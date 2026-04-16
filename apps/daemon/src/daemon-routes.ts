/**
 * Daemon RPC method registration and task event forwarding.
 * Extracted from index.ts to keep the entry point under 200 lines.
 *
 * NO electron imports — this runs as plain Node.js.
 */
import {
  type DaemonRpcServer,
  taskConfigSchema,
  permissionResponseSchema,
  resumeSessionSchema,
  authOpenAiAwaitCompletionSchema,
  validate,
} from '@accomplish_ai/agent-core';
import type { AccomplishRuntime, StorageDeps } from '@accomplish_ai/agent-core';
import { z } from 'zod';
import { homedir } from 'node:os';
import type { TaskService } from './task-service.js';
import type { HealthService } from './health.js';
import type { StorageService } from './storage-service.js';
import type { SchedulerService } from './scheduler-service.js';
import type { WhatsAppDaemonService } from './whatsapp-service.js';
import type { OpenAiOauthManager } from './opencode/auth-openai.js';

const taskIdSchema = z.object({ taskId: z.string().min(1) });
// taskConfigSchema already includes modelId — no extension needed
const taskStartSchema = taskConfigSchema;

function sanitizeErrorMessage(err: unknown): string {
  if (err instanceof z.ZodError) {
    return `Invalid parameters: ${err.issues.map((i) => i.message).join('; ')}`;
  }
  const msg = err instanceof Error ? err.message : 'Internal error';
  if (process.env.NODE_ENV === 'development') {
    return msg;
  }
  const home = homedir();
  const escapedHome = home.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return msg.replace(new RegExp(`${escapedHome}(?:[\\\\/][^\\s:]*)?`, 'g'), '~/...');
}

export function safeHandler(
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

export interface RouteServices {
  rpc: DaemonRpcServer;
  taskService: TaskService;
  healthService: HealthService;
  storageService: StorageService;
  schedulerService: SchedulerService;
  accomplishRuntime: AccomplishRuntime;
  whatsappService: WhatsAppDaemonService;
  /** OAuth manager (Phase 4a of the SDK cutover port). Owns transient
   *  `opencode serve` spawns + the SDK auth flow + plan detection. */
  openAiOauthManager: OpenAiOauthManager;
}

/**
 * Register all RPC methods on the server.
 */
export function registerRpcMethods(services: RouteServices): void {
  const {
    rpc,
    taskService,
    healthService,
    schedulerService,
    accomplishRuntime,
    whatsappService,
    openAiOauthManager,
  } = services;
  const storage = services.storageService.getStorage();

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
    safeHandler((params) => {
      const raw =
        params && typeof params === 'object' && 'workspaceId' in params
          ? (params as { workspaceId?: unknown }).workspaceId
          : undefined;
      const workspaceId = typeof raw === 'string' && raw.trim() !== '' ? raw.trim() : undefined;
      const includeUnassigned =
        params && typeof params === 'object' && 'includeUnassigned' in params
          ? (params as { includeUnassigned?: unknown }).includeUnassigned === true
          : false;
      return Promise.resolve(taskService.listTasks(workspaceId, includeUnassigned));
    }),
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
    safeHandler(async (params) => {
      const validated = validate(taskIdSchema, params);
      if (taskService.hasActiveTask(validated.taskId)) {
        await taskService.stopTask({ taskId: validated.taskId });
      }
      storage.deleteTask(validated.taskId);
      return Promise.resolve();
    }),
  );
  rpc.registerMethod(
    'task.clearHistory',
    safeHandler(() => {
      if (taskService.getActiveTaskCount() > 0) {
        throw new Error('Cannot clear history while tasks are active or queued');
      }
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
    // Rewritten in Phase 2 of the SDK cutover port (commercial PR #720).
    //
    // Pre-port: resolved an in-memory promise map held by `PermissionService`;
    // the HTTP handler awaiting the promise returned the decision back to
    // the `opencode` CLI over its /permission or /question callback.
    //
    // Post-port: `PermissionService` is deleted. The daemon forwards the
    // structured response directly to `TaskService.sendResponse`, which
    // routes to `TaskManager.sendResponse` → `OpenCodeAdapter.sendResponse` →
    // `client.permission.reply` / `client.question.reply` on the SDK v2
    // client. The `taskId` field was added to `permissionResponseSchema`
    // specifically for this routing — without it the daemon cannot scope
    // the reply to a specific in-flight task.
    safeHandler(async (params) => {
      const validated = validate(permissionResponseSchema, params);
      const { taskId, requestId, decision, selectedOptions, customText } = validated;
      // Defensive taskId check. Without it, a bogus taskId (stale UI,
      // double-click, replay of a cancelled task) cascades an error from
      // deep inside `OpenCodeAdapter.sendResponse` (`pending` is null, or
      // the adapter doesn't exist), producing a confusing stack trace
      // rather than a clean "unknown task" RPC error.
      if (!taskService.hasActiveTask(taskId)) {
        throw new Error(
          `permission.respond: no active task with id=${taskId}. The task may have completed, been cancelled, or never existed.`,
        );
      }
      await taskService.sendResponse(taskId, {
        requestId,
        taskId,
        decision,
        ...(selectedOptions ? { selectedOptions } : {}),
        ...(customText ? { customText } : {}),
      });
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

  // Alias: desktop IPC uses 'task.cancel', daemon-routes registers 'task.stop'
  rpc.registerMethod(
    'task.cancel',
    safeHandler((params) => {
      const validated = validate(taskIdSchema, params);
      return taskService.stopTask(validated);
    }),
  );

  rpc.registerMethod(
    'task.getActiveCount',
    safeHandler(() => Promise.resolve(taskService.getActiveTaskCount())),
  );

  // ── Scheduler ────────────────────────────────────────────────────────────
  rpc.registerMethod(
    'task.schedule',
    safeHandler((params) => {
      const validated = validate(
        z.object({
          cron: z.string().min(1),
          prompt: z.string().min(1),
          workspaceId: z.string().optional(),
        }),
        params,
      );
      return Promise.resolve(
        schedulerService.createSchedule(validated.cron, validated.prompt, validated.workspaceId),
      );
    }),
  );
  rpc.registerMethod(
    'task.listScheduled',
    safeHandler((params) => {
      const workspaceId =
        params && typeof params === 'object' && 'workspaceId' in params
          ? (params as { workspaceId?: string }).workspaceId
          : undefined;
      return Promise.resolve(schedulerService.listSchedules(workspaceId));
    }),
  );
  rpc.registerMethod(
    'task.cancelScheduled',
    safeHandler((params) => {
      const validated = validate(z.object({ scheduleId: z.string().min(1) }), params);
      schedulerService.deleteSchedule(validated.scheduleId);
      return Promise.resolve();
    }),
  );
  rpc.registerMethod(
    'task.setScheduleEnabled',
    safeHandler((params) => {
      const validated = validate(
        z.object({ scheduleId: z.string().min(1), enabled: z.boolean() }),
        params,
      );
      schedulerService.setEnabled(validated.scheduleId, validated.enabled);
      return Promise.resolve();
    }),
  );

  // ── Accomplish AI Free Tier ─────────────────────────────────────────────
  // StorageDeps constructed from daemon's own secure storage — no callbacks over RPC.
  const accomplishStorageDeps: StorageDeps = {
    readKey: (key) => storage.get(key),
    writeKey: (key, value) => storage.set(key, value),
    readGaClientId: () => null, // GA client ID not available in daemon
  };

  rpc.registerMethod(
    'accomplish-ai.connect',
    safeHandler(async () => {
      const result = await accomplishRuntime.connect(accomplishStorageDeps);
      return { deviceFingerprint: result.deviceFingerprint, usage: result.usage };
    }),
  );

  rpc.registerMethod(
    'accomplish-ai.get-usage',
    safeHandler(async () => {
      return accomplishRuntime.getUsage();
    }),
  );

  rpc.registerMethod(
    'accomplish-ai.disconnect',
    safeHandler(async () => {
      accomplishRuntime.disconnect();
      return Promise.resolve();
    }),
  );

  // Bridge proxy usage updates to daemon notifications → forwarded to renderer via IPC
  accomplishRuntime.onUsageUpdate((usage) => {
    rpc.notify('accomplish-ai.usage-update', usage);
  });

  // ── WhatsApp ─────────────────────────────────────────────────────────────
  rpc.registerMethod(
    'whatsapp.connect',
    safeHandler(() => whatsappService.connect()),
  );
  rpc.registerMethod(
    'whatsapp.disconnect',
    safeHandler(() => whatsappService.disconnect()),
  );
  rpc.registerMethod(
    'whatsapp.getConfig',
    safeHandler(() => Promise.resolve(whatsappService.getConfig())),
  );
  rpc.registerMethod(
    'whatsapp.setEnabled',
    safeHandler((params) => {
      const validated = validate(z.object({ enabled: z.boolean() }), params);
      whatsappService.setEnabled(validated.enabled);
      return Promise.resolve();
    }),
  );

  // ---------------------------------------------------------------------------
  // OpenAI ChatGPT OAuth (Phase 4a of the SDK cutover port, commercial PR #720)
  //
  // Four-method protocol. Desktop IPC handler runs:
  //   startLogin → shell.openExternal(authorizeUrl) → awaitCompletion.
  // `status` and `getAccessToken` are non-flow reads used by settings UI
  // and model-discovery respectively.
  // ---------------------------------------------------------------------------
  rpc.registerMethod(
    'auth.openai.startLogin',
    safeHandler(async () => {
      return openAiOauthManager.startLogin();
    }),
  );
  rpc.registerMethod(
    'auth.openai.awaitCompletion',
    safeHandler(async (params) => {
      const validated = validate(authOpenAiAwaitCompletionSchema, params);
      return openAiOauthManager.awaitCompletion(validated);
    }),
  );
  rpc.registerMethod(
    'auth.openai.status',
    safeHandler(() => Promise.resolve(openAiOauthManager.status())),
  );
  rpc.registerMethod(
    'auth.openai.getAccessToken',
    safeHandler(() => Promise.resolve(openAiOauthManager.getAccessToken())),
  );
}
