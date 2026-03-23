import crypto from 'node:crypto';
import path from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  DaemonRpcServer,
  getSocketPath,
  acquirePidLock,
  installCrashHandlers,
  type PidLockHandle,
  taskConfigSchema,
  permissionResponseSchema,
  resumeSessionSchema,
  validate,
} from '@accomplish_ai/agent-core';
import { z } from 'zod';
import { StorageService } from './storage-service.js';
import { TaskService } from './task-service.js';
import { PermissionService } from './permission-service.js';
import { ThoughtStreamService } from './thought-stream-service.js';
import { HealthService, VERSION } from './health.js';
import { parseArgs } from './cli.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DRAIN_TIMEOUT_MS = 30_000;

function sanitizeErrorMessage(err: unknown): string {
  if (err instanceof z.ZodError) {
    return `Invalid parameters: ${err.issues.map((i) => i.message).join('; ')}`;
  }
  const msg = err instanceof Error ? err.message : 'Internal error';
  if (process.env.NODE_ENV === 'development') {
    return msg;
  }
  const home = homedir();
  return msg.replace(
    new RegExp(home.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '/[^\\s:]*', 'g'),
    '~/...',
  );
}

function safeHandler(
  fn: (params: unknown) => Promise<unknown>,
): (params: unknown) => Promise<unknown> {
  return async (params) => {
    try {
      return await fn(params);
    } catch (err) {
      throw new Error(sanitizeErrorMessage(err));
    }
  };
}

const taskIdSchema = z.object({ taskId: z.string().min(1) });
const taskStartSchema = taskConfigSchema.extend({ modelId: z.string().optional() });

let pidLock: PidLockHandle | null = null;

async function main(): Promise<void> {
  const args = parseArgs();

  if (args.version) {
    console.log(VERSION);
    process.exit(0);
  }

  installCrashHandlers();

  console.log('[Daemon] Starting...');

  // 1. Acquire PID lock (atomic, with stale detection)
  pidLock = acquirePidLock();
  console.log(`[Daemon] PID lock acquired: ${pidLock.pidPath} (pid=${process.pid})`);

  // 2. Generate per-session auth token for HTTP APIs
  const authToken = crypto.randomUUID();

  // 3. Initialize storage (use shared data dir if provided, enabling shared DB with desktop)
  const storageService = new StorageService();
  const storage = storageService.initialize(args.dataDir);

  // 4. Crash recovery: mark stale running tasks as failed
  const allTasks = storage.getTasks();
  for (const task of allTasks) {
    if (task.status === 'running') {
      console.warn(`[Daemon] Crash recovery: marking stale task ${task.id} as failed`);
      storage.updateTaskStatus(task.id, 'failed', new Date().toISOString());
    }
  }

  // 5. Create services
  const userDataPath = args.dataDir || path.join(homedir(), '.accomplish');
  const mcpToolsPath =
    process.env.MCP_TOOLS_PATH ||
    path.resolve(__dirname, '..', '..', '..', 'packages', 'agent-core', 'mcp-tools');
  const isPackaged = process.env.ACCOMPLISH_IS_PACKAGED === '1';
  const taskService = new TaskService(storage, {
    userDataPath,
    mcpToolsPath,
    isPackaged,
    resourcesPath: process.env.ACCOMPLISH_RESOURCES_PATH,
    appPath: process.env.ACCOMPLISH_APP_PATH,
  });
  const healthService = new HealthService();
  const permissionService = new PermissionService(authToken);
  const thoughtStreamService = new ThoughtStreamService(authToken);

  // 6. Create RPC server (moved before init calls to avoid TDZ)
  const rpc = new DaemonRpcServer({
    socketPath: args.socketPath,
    onConnection: (clientId) => console.log(`[Daemon] Client connected: ${clientId}`),
    onDisconnection: (clientId) => console.log(`[Daemon] Client disconnected: ${clientId}`),
  });

  // 7. Initialize permission service (rpc is now declared)
  permissionService.init(
    () => taskService.getActiveTaskId(),
    (request) => rpc.notify('permission.request', request),
  );

  // 8. Set up thought stream event forwarding
  thoughtStreamService.setEventHandlers(
    (event) => rpc.notify('task.thought', event),
    (event) => rpc.notify('task.checkpoint', event),
  );

  // 9. Register RPC methods with Zod validation and error sanitization
  rpc.registerMethod(
    'task.start',
    safeHandler((params) => {
      const validated = validate(taskStartSchema, params);
      return taskService.startTask(validated);
    }),
  );
  rpc.registerMethod(
    'task.stop',
    safeHandler((params) => {
      const validated = validate(taskIdSchema, params);
      return taskService.stopTask(validated);
    }),
  );
  rpc.registerMethod(
    'task.list',
    safeHandler(() => Promise.resolve(taskService.listTasks())),
  );
  rpc.registerMethod(
    'task.status',
    safeHandler((params) => {
      const validated = validate(taskIdSchema, params);
      return Promise.resolve(taskService.getTaskStatus(validated));
    }),
  );
  rpc.registerMethod(
    'task.interrupt',
    safeHandler((params) => {
      const validated = validate(taskIdSchema, params);
      return taskService.interruptTask(validated);
    }),
  );
  rpc.registerMethod(
    'task.get',
    safeHandler((params) => {
      const validated = validate(taskIdSchema, params);
      return Promise.resolve(storage.getTask(validated.taskId) || null);
    }),
  );
  rpc.registerMethod(
    'task.delete',
    safeHandler((params) => {
      const validated = validate(taskIdSchema, params);
      storage.deleteTask(validated.taskId);
      return Promise.resolve();
    }),
  );
  rpc.registerMethod(
    'task.clearHistory',
    safeHandler(() => {
      storage.clearHistory();
      return Promise.resolve();
    }),
  );
  rpc.registerMethod(
    'task.getTodos',
    safeHandler((params) => {
      const validated = validate(taskIdSchema, params);
      return Promise.resolve(storage.getTodosForTask(validated.taskId));
    }),
  );
  rpc.registerMethod(
    'permission.respond',
    safeHandler((params) => {
      const validated = validate(permissionResponseSchema, params);
      const { requestId, taskId, decision, selectedOptions, customText } = validated;

      if (requestId && permissionService.isFilePermissionRequest(requestId)) {
        const allowed = decision === 'allow';
        const resolved = permissionService.resolvePermission(requestId, allowed);
        if (resolved) {
          return Promise.resolve();
        }
      }

      if (requestId && permissionService.isQuestionRequest(requestId)) {
        const denied = decision === 'deny';
        const resolved = permissionService.resolveQuestion(requestId, {
          selectedOptions,
          customText,
          denied,
        });
        if (resolved) {
          return Promise.resolve();
        }
      }

      if (requestId) {
        console.warn(`[Daemon] Permission response for unmatched requestId: ${requestId}`);
        return Promise.reject(new Error(`No pending permission request with id: ${requestId}`));
      }

      if (!taskService.hasActiveTask(taskId)) {
        return Promise.resolve();
      }

      if (decision === 'allow') {
        const message = selectedOptions?.join(', ') || 'yes';
        return taskService.sendResponse(taskId, message);
      }
      return taskService.sendResponse(taskId, 'no');
    }),
  );
  rpc.registerMethod(
    'session.resume',
    safeHandler((params) => {
      const validated = validate(resumeSessionSchema, params);
      return taskService.resumeSession(validated);
    }),
  );
  rpc.registerMethod(
    'health.check',
    safeHandler(() => Promise.resolve(healthService.getStatus())),
  );

  // 10. Forward task events as RPC notifications
  taskService.on('progress', (data) => {
    rpc.notify('task.progress', data);
  });
  taskService.on('message', (data) => {
    rpc.notify('task.message', data);
  });
  taskService.on('complete', (data: { taskId: string }) => {
    thoughtStreamService.unregisterTask(data.taskId);
    rpc.notify('task.complete', data);
  });
  taskService.on('error', (data: { taskId: string }) => {
    thoughtStreamService.unregisterTask(data.taskId);
    rpc.notify('task.error', data);
  });
  taskService.on('permission', (data) => {
    rpc.notify('permission.request', data);
  });
  taskService.on('statusChange', (data: { taskId: string; status: string }) => {
    if (data.status === 'running') {
      thoughtStreamService.registerTask(data.taskId);
    } else if (data.status === 'cancelled') {
      thoughtStreamService.unregisterTask(data.taskId);
    }
    healthService.setActiveTaskCount(taskService.getActiveTaskCount());
    rpc.notify('task.statusChange', data);
  });
  taskService.on('summary', (data: { taskId: string; summary: string }) => {
    rpc.notify('task.summary', data);
  });

  // 11. Start all servers
  await rpc.start();
  await permissionService.startPermissionApiServer();
  await permissionService.startQuestionApiServer();
  await thoughtStreamService.start();

  // Pass auth token and actual ports to child processes via environment
  const permPorts = permissionService.getPorts();
  const thoughtPort = thoughtStreamService.getPort();
  process.env.ACCOMPLISH_DAEMON_AUTH_TOKEN = authToken;
  if (permPorts.permissionPort) {
    process.env.ACCOMPLISH_PERMISSION_API_PORT = String(permPorts.permissionPort);
  }
  if (permPorts.questionPort) {
    process.env.ACCOMPLISH_QUESTION_API_PORT = String(permPorts.questionPort);
  }
  if (thoughtPort) {
    process.env.ACCOMPLISH_THOUGHT_STREAM_PORT = String(thoughtPort);
  }

  const socketPath = args.socketPath || getSocketPath();
  console.log(`[Daemon] Listening on ${socketPath}`);

  // 12. Graceful shutdown with drain phase
  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    console.log('[Daemon] Shutting down...');

    // Drain phase: wait for active tasks to finish
    const activeCount = taskService.getActiveTaskCount();
    if (activeCount > 0) {
      console.log(`[Daemon] Draining ${activeCount} active task(s)...`);
      await new Promise<void>((resolve) => {
        let remaining = taskService.getActiveTaskCount();

        if (remaining === 0) {
          resolve();
          return;
        }

        const drainTimeout = setTimeout(() => {
          console.warn('[Daemon] Drain timeout reached, force-killing active tasks');
          taskService.dispose();
          resolve();
        }, DRAIN_TIMEOUT_MS);
        drainTimeout.unref();

        const onComplete = () => {
          remaining = taskService.getActiveTaskCount();
          if (remaining === 0) {
            clearTimeout(drainTimeout);
            taskService.removeListener('complete', onComplete);
            taskService.removeListener('error', onComplete);
            resolve();
          }
        };

        taskService.on('complete', onComplete);
        taskService.on('error', onComplete);
      });
    }

    thoughtStreamService.close();
    permissionService.close();
    taskService.dispose();

    await rpc.stop();
    storageService.close();
    pidLock?.release();

    console.log('[Daemon] Shutdown complete');
    process.exit(0);
  };

  const forceShutdown = () => {
    console.error('[Daemon] Forced shutdown after timeout');
    pidLock?.release();
    process.exit(1);
  };

  process.on('SIGINT', () => {
    setTimeout(forceShutdown, DRAIN_TIMEOUT_MS + 10_000).unref();
    void shutdown();
  });
  process.on('SIGTERM', () => {
    setTimeout(forceShutdown, DRAIN_TIMEOUT_MS + 10_000).unref();
    void shutdown();
  });
}

main().catch((err) => {
  console.error('[Daemon] Fatal error:', err);
  pidLock?.release();
  process.exit(1);
});
