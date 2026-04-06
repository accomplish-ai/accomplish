import crypto from 'node:crypto';
import path from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  DaemonRpcServer,
  getSocketPath,
  getPidFilePath,
  acquirePidLock,
  installCrashHandlers,
  type PidLockHandle,
  PERMISSION_API_PORT,
  QUESTION_API_PORT,
  THOUGHT_STREAM_PORT,
} from '@accomplish_ai/agent-core';
import { StorageService } from './storage-service.js';
import { TaskService } from './task-service.js';
import { PermissionService } from './permission-service.js';
import { ThoughtStreamService } from './thought-stream-service.js';
import { SchedulerService } from './scheduler-service.js';
import { HealthService, VERSION } from './health.js';
import { parseArgs } from './cli.js';
import { registerRpcMethods, safeHandler } from './daemon-routes.js';
import { registerTaskEventForwarding } from './task-event-forwarding.js';
import { WhatsAppDaemonService } from './whatsapp-service.js';
import { log } from './logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DRAIN_TIMEOUT_MS = 30_000;
let pidLock: PidLockHandle | null = null;

async function main(): Promise<void> {
  const args = parseArgs();

  if (args.version) {
    console.log(VERSION);
    process.exit(0);
  }

  installCrashHandlers();

  // Resolve dataDir early — all identity files (socket, PID, DB) derive from it.
  // --data-dir is required by default. Only explicitly opted-in dev mode skips it,
  // so a misconfigured launcher can never silently use the wrong profile.
  const dataDir = args.dataDir;
  const isDevMode = process.env.ACCOMPLISH_DAEMON_DEV === '1';
  if (!dataDir && !isDevMode) {
    log.error(
      '[Daemon] Error: --data-dir is required.\n' +
        'The daemon must know which data directory to use so it shares the same\n' +
        'database, socket, and PID file as the desktop app.\n\n' +
        'Usage: node daemon/index.js --data-dir /path/to/userData\n\n' +
        'For local development without --data-dir, set ACCOMPLISH_DAEMON_DEV=1\n' +
        'to fall back to ~/.accomplish.',
    );
    process.exit(1);
  }

  if (!dataDir && isDevMode) {
    log.warn('[Daemon] Warning: running in dev mode without --data-dir, using ~/.accomplish');
  }

  log.info(`[Daemon] Starting... (dataDir=${dataDir ?? '~/.accomplish (dev fallback)'})`);

  // 1. Acquire PID lock scoped to dataDir (atomic, with stale detection)
  const pidPath = getPidFilePath(dataDir);
  pidLock = acquirePidLock(pidPath);
  log.info(`[Daemon] PID lock acquired: ${pidLock.pidPath} (pid=${process.pid})`);

  // 2. Generate per-session auth token for HTTP APIs
  const authToken = crypto.randomUUID();

  // 3. Initialize storage (use shared data dir if provided, enabling shared DB with desktop)
  const storageService = new StorageService();
  const storage = storageService.initialize(dataDir);

  // 4. Crash recovery: mark stale running tasks as failed
  for (const task of storage.getTasks()) {
    if (task.status === 'running') {
      log.warn(`[Daemon] Crash recovery: marking stale task ${task.id} as failed`);
      storage.updateTaskStatus(task.id, 'failed', new Date().toISOString());
    }
  }

  // 5. Create services
  // Packaged-mode context: CLI args take precedence over env vars (for Windows login-item).
  const userDataPath = dataDir || path.join(homedir(), '.accomplish');
  const isPackaged = args.isPackaged || process.env.ACCOMPLISH_IS_PACKAGED === '1';
  const resourcesPath = args.resourcesPath || process.env.ACCOMPLISH_RESOURCES_PATH || '';
  const appPath = args.appPath || process.env.ACCOMPLISH_APP_PATH || '';
  const mcpToolsPath = isPackaged
    ? path.join(resourcesPath, 'mcp-tools')
    : process.env.MCP_TOOLS_PATH ||
      path.resolve(__dirname, '..', '..', '..', 'packages', 'agent-core', 'mcp-tools');
  const taskService = new TaskService(storage, {
    userDataPath,
    mcpToolsPath,
    isPackaged,
    resourcesPath,
    appPath,
  });
  const healthService = new HealthService();
  const permissionService = new PermissionService(authToken);
  const thoughtStreamService = new ThoughtStreamService(authToken);
  const schedulerService = new SchedulerService(storage, (prompt, workspaceId) => {
    void taskService.startTask({ prompt, workspaceId });
  });
  const whatsappService = new WhatsAppDaemonService(
    storage,
    userDataPath,
    taskService,
    permissionService,
  );

  // 6. Create RPC server — socket path derived from dataDir for profile isolation
  const socketPath = args.socketPath || getSocketPath(dataDir);
  const rpc = new DaemonRpcServer({
    socketPath,
    onConnection: (clientId) => log.info(`[Daemon] Client connected: ${clientId}`),
    onDisconnection: (clientId) => log.info(`[Daemon] Client disconnected: ${clientId}`),
  });

  // 7. Initialize permission service
  permissionService.init(
    () => taskService.getActiveTaskId(),
    (request) => rpc.notify('permission.request', request),
    () => rpc.hasConnectedClients(),
  );

  // 8. Set up thought stream event forwarding
  thoughtStreamService.setEventHandlers(
    (event) => rpc.notify('task.thought', event),
    (event) => rpc.notify('task.checkpoint', event),
  );

  // 9 & 10. Register RPC methods and task event forwarding
  const routeServices = {
    rpc,
    taskService,
    permissionService,
    thoughtStreamService,
    healthService,
    storageService,
    schedulerService,
    whatsappService,
  };
  registerRpcMethods(routeServices);
  registerTaskEventForwarding(routeServices);

  // 11. Start all servers on well-known ports so MCP tools can connect reliably.
  // The constants (PERMISSION_API_PORT=9226, QUESTION_API_PORT=9227,
  // THOUGHT_STREAM_PORT=9228) must match what config-generator writes
  // into the MCP tool environment.
  await rpc.start();
  await permissionService.startPermissionApiServer(PERMISSION_API_PORT);
  await permissionService.startQuestionApiServer(QUESTION_API_PORT);
  await thoughtStreamService.start(THOUGHT_STREAM_PORT);

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
    // MCP tools (report-thought, report-checkpoint) read THOUGHT_STREAM_PORT
    process.env.THOUGHT_STREAM_PORT = String(thoughtPort);
  }

  // Start scheduler after RPC server is ready
  schedulerService.start();
  log.info('[Daemon] Scheduler started');

  // Auto-connect WhatsApp if previously enabled
  whatsappService.autoConnectIfEnabled();

  log.info(`[Daemon] Listening on ${socketPath}`);

  // 12. Graceful shutdown with drain phase
  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    log.info('[Daemon] Shutting down...');

    // Stop scheduler FIRST — prevent new tasks from being launched during drain
    schedulerService.stop();
    log.info('[Daemon] Scheduler stopped');

    const activeCount = taskService.getActiveTaskCount();
    if (activeCount > 0) {
      log.info(`[Daemon] Draining ${activeCount} active task(s)...`);
      await new Promise<void>((resolve) => {
        let remaining = taskService.getActiveTaskCount();
        if (remaining === 0) {
          resolve();
          return;
        }

        const drainTimeout = setTimeout(() => {
          log.warn('[Daemon] Drain timeout reached, force-killing active tasks');
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

    whatsappService.dispose();
    thoughtStreamService.close();
    permissionService.close();
    taskService.dispose();
    await rpc.stop();
    storageService.close();
    pidLock?.release();
    log.info('[Daemon] Shutdown complete');
    process.exit(0);
  };

  const forceShutdown = () => {
    log.error('[Daemon] Forced shutdown after timeout');
    pidLock?.release();
    process.exit(1);
  };

  // Register daemon.shutdown RPC method (must be after shutdown() is defined)
  rpc.registerMethod(
    'daemon.shutdown',
    safeHandler(async () => {
      log.info('[Daemon] Shutdown requested via RPC');
      // Defer actual shutdown to after the RPC response is sent
      setTimeout(() => void shutdown(), 100);
      return Promise.resolve();
    }),
  );

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
  log.error('[Daemon] Fatal error:', err);
  pidLock?.release();
  process.exit(1);
});
