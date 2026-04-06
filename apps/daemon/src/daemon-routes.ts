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
  validate,
  logger,
} from '@accomplish_ai/agent-core';
import { z } from 'zod';
import { homedir } from 'node:os';
import type { TaskService } from './task-service.js';
import type { PermissionService } from './permission-service.js';
import type { ThoughtStreamService } from './thought-stream-service.js';
import type { HealthService } from './health.js';
import type { StorageService } from './storage-service.js';
import type { SchedulerService } from './scheduler-service.js';
import type { WhatsAppDaemonService } from './whatsapp-service.js';

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
  permissionService: PermissionService;
  thoughtStreamService: ThoughtStreamService;
  healthService: HealthService;
  storageService: StorageService;
  schedulerService: SchedulerService;
  whatsappService: WhatsAppDaemonService;
}

/**
 * Register all RPC methods on the server.
 */
export function registerRpcMethods(services: RouteServices): void {
  const { rpc, taskService, permissionService, healthService, schedulerService, whatsappService } =
    services;
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
    safeHandler((params) => {
      const validated = validate(permissionResponseSchema, params);
      const { requestId, decision, selectedOptions, customText } = validated;

      if (requestId && permissionService.isFilePermissionRequest(requestId)) {
        const resolved = permissionService.resolvePermission(requestId, decision === 'allow');
        if (resolved) {
          return Promise.resolve();
        }
      }
      if (requestId && permissionService.isQuestionRequest(requestId)) {
        const resolved = permissionService.resolveQuestion(requestId, {
          selectedOptions,
          customText,
          denied: decision === 'deny',
        });
        if (resolved) {
          return Promise.resolve();
        }
      }
      // requestId is always present after schema validation — fall through means
      // neither a file-permission nor a question request matched.
      logger.warn(`[Daemon] Permission response for unmatched requestId: ${requestId}`);
      return Promise.reject(new Error(`No pending permission request with id: ${requestId}`));
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
}
