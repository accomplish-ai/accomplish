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
import type { SecretsService } from './secrets-service.js';
import type { SettingsService, SettingsChangePayload } from './settings-service.js';
import type { WorkspaceService, WorkspaceChangePayload } from './workspace-service.js';
import type { LegacyImportService } from './legacy-import-service.js';

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
  // Milestone 2 of the daemon-only-SQLite migration. Four thin services that
  // expose the StorageAPI surface over RPC. Main doesn't consume them yet;
  // they're registered so M3/M5 can progressively repoint desktop callers.
  secretsService: SecretsService;
  settingsService: SettingsService;
  workspaceService: WorkspaceService;
  legacyImportService: LegacyImportService;
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
    secretsService,
    settingsService,
    workspaceService,
    legacyImportService,
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

  // ═══════════════════════════════════════════════════════════════════════
  // Milestone 2 of the daemon-only-SQLite migration.
  //
  // Everything below this line is additive: new RPC endpoints and change
  // notifications for the storage surface main currently opens itself.
  // No existing route is modified. Desktop consumes these incrementally
  // during M3 + M5.
  //
  // Validation strategy: inline zod schemas. A single shared file would
  // help reuse, but these are all trivial (one string / one bool / a typed
  // config object) and scoping them here keeps the related `registerMethod`
  // call self-contained.
  // ═══════════════════════════════════════════════════════════════════════

  const providerIdSchema = z
    .string()
    .min(1)
    .describe('ProviderId — any value of the ProviderId type literal');

  // ── Secrets ──────────────────────────────────────────────────────────────
  rpc.registerMethod(
    'secrets.storeApiKey',
    safeHandler((params) => {
      const v = validate(
        z.object({ provider: z.string().min(1), apiKey: z.string().min(1) }),
        params,
      );
      secretsService.storeApiKey(v.provider, v.apiKey);
      return Promise.resolve();
    }),
  );
  rpc.registerMethod(
    'secrets.getApiKey',
    safeHandler((params) => {
      const v = validate(z.object({ provider: z.string().min(1) }), params);
      return Promise.resolve(secretsService.getApiKey(v.provider));
    }),
  );
  rpc.registerMethod(
    'secrets.deleteApiKey',
    safeHandler((params) => {
      const v = validate(z.object({ provider: z.string().min(1) }), params);
      return Promise.resolve(secretsService.deleteApiKey(v.provider));
    }),
  );
  rpc.registerMethod(
    'secrets.getAllApiKeys',
    safeHandler(() => secretsService.getAllApiKeys()),
  );
  rpc.registerMethod(
    'secrets.hasAnyApiKey',
    safeHandler(() => secretsService.hasAnyApiKey()),
  );
  rpc.registerMethod(
    'secrets.storeBedrockCredentials',
    safeHandler((params) => {
      const v = validate(z.object({ credentials: z.string().min(1) }), params);
      secretsService.storeBedrockCredentials(v.credentials);
      return Promise.resolve();
    }),
  );
  rpc.registerMethod(
    'secrets.getBedrockCredentials',
    safeHandler(() => Promise.resolve(secretsService.getBedrockCredentials())),
  );
  rpc.registerMethod(
    'secrets.clear',
    safeHandler(() => {
      secretsService.clear();
      return Promise.resolve();
    }),
  );

  // ── Settings — app-level ─────────────────────────────────────────────────
  rpc.registerMethod(
    'settings.getAll',
    safeHandler(() => Promise.resolve(settingsService.getAll())),
  );
  rpc.registerMethod(
    'settings.setTheme',
    safeHandler((params) => {
      const v = validate(z.object({ theme: z.enum(['system', 'light', 'dark']) }), params);
      settingsService.setTheme(v.theme);
      return Promise.resolve();
    }),
  );
  rpc.registerMethod(
    'settings.setLanguage',
    safeHandler((params) => {
      const v = validate(
        z.object({ language: z.enum(['auto', 'en', 'zh-CN', 'ru', 'fr']) }),
        params,
      );
      settingsService.setLanguage(v.language);
      return Promise.resolve();
    }),
  );
  rpc.registerMethod(
    'settings.setDebugMode',
    safeHandler((params) => {
      const v = validate(z.object({ enabled: z.boolean() }), params);
      settingsService.setDebugMode(v.enabled);
      return Promise.resolve();
    }),
  );
  rpc.registerMethod(
    'settings.setNotificationsEnabled',
    safeHandler((params) => {
      const v = validate(z.object({ enabled: z.boolean() }), params);
      settingsService.setNotificationsEnabled(v.enabled);
      return Promise.resolve();
    }),
  );
  rpc.registerMethod(
    'settings.setCloseBehavior',
    safeHandler((params) => {
      const v = validate(z.object({ behavior: z.enum(['keep-daemon', 'stop-daemon']) }), params);
      settingsService.setCloseBehavior(v.behavior);
      return Promise.resolve();
    }),
  );
  // Sandbox / cloud-browser / messaging configs are typed objects; their
  // Zod schemas would duplicate the TypeScript types. Pass-through `.unknown()`
  // for the config payload and trust the type at the call site — misuse
  // surfaces as a StorageAPI-level error, not a silent no-op.
  rpc.registerMethod(
    'settings.setSandboxConfig',
    safeHandler((params) => {
      const v = validate(z.object({ config: z.unknown() }), params);
      settingsService.setSandboxConfig(
        v.config as Parameters<typeof settingsService.setSandboxConfig>[0],
      );
      return Promise.resolve();
    }),
  );
  rpc.registerMethod(
    'settings.setCloudBrowserConfig',
    safeHandler((params) => {
      const v = validate(z.object({ config: z.unknown().nullable() }), params);
      settingsService.setCloudBrowserConfig(
        v.config as Parameters<typeof settingsService.setCloudBrowserConfig>[0],
      );
      return Promise.resolve();
    }),
  );
  rpc.registerMethod(
    'settings.setMessagingConfig',
    safeHandler((params) => {
      const v = validate(z.object({ config: z.unknown().nullable() }), params);
      settingsService.setMessagingConfig(
        v.config as Parameters<typeof settingsService.setMessagingConfig>[0],
      );
      return Promise.resolve();
    }),
  );
  rpc.registerMethod(
    'settings.setOnboardingComplete',
    safeHandler((params) => {
      const v = validate(z.object({ complete: z.boolean() }), params);
      settingsService.setOnboardingComplete(v.complete);
      return Promise.resolve();
    }),
  );

  // ── Settings — provider ──────────────────────────────────────────────────
  rpc.registerMethod(
    'provider.getSettings',
    safeHandler(() => Promise.resolve(settingsService.getProviderSettings())),
  );
  rpc.registerMethod(
    'provider.setActive',
    safeHandler((params) => {
      const v = validate(z.object({ providerId: providerIdSchema.nullable() }), params);
      settingsService.setActiveProvider(
        v.providerId as Parameters<typeof settingsService.setActiveProvider>[0],
      );
      return Promise.resolve();
    }),
  );
  rpc.registerMethod(
    'provider.setConnected',
    safeHandler((params) => {
      const v = validate(z.object({ providerId: providerIdSchema, provider: z.unknown() }), params);
      settingsService.setConnectedProvider(
        v.providerId as Parameters<typeof settingsService.setConnectedProvider>[0],
        v.provider as Parameters<typeof settingsService.setConnectedProvider>[1],
      );
      return Promise.resolve();
    }),
  );
  rpc.registerMethod(
    'provider.removeConnected',
    safeHandler((params) => {
      const v = validate(z.object({ providerId: providerIdSchema }), params);
      settingsService.removeConnectedProvider(
        v.providerId as Parameters<typeof settingsService.removeConnectedProvider>[0],
      );
      return Promise.resolve();
    }),
  );
  rpc.registerMethod(
    'provider.updateModel',
    safeHandler((params) => {
      const v = validate(
        z.object({ providerId: providerIdSchema, modelId: z.string().nullable() }),
        params,
      );
      settingsService.updateProviderModel(
        v.providerId as Parameters<typeof settingsService.updateProviderModel>[0],
        v.modelId,
      );
      return Promise.resolve();
    }),
  );
  rpc.registerMethod(
    'provider.setDebugMode',
    safeHandler((params) => {
      const v = validate(z.object({ enabled: z.boolean() }), params);
      settingsService.setProviderDebugMode(v.enabled);
      return Promise.resolve();
    }),
  );
  rpc.registerMethod(
    'provider.getDebugMode',
    safeHandler(() => Promise.resolve(settingsService.getProviderDebugMode())),
  );
  rpc.registerMethod(
    'provider.getAccomplishAiCredits',
    safeHandler(() => Promise.resolve(settingsService.getAccomplishAiCredits())),
  );
  rpc.registerMethod(
    'provider.saveAccomplishAiCredits',
    safeHandler((params) => {
      const v = validate(z.object({ usage: z.unknown() }), params);
      settingsService.saveAccomplishAiCredits(
        v.usage as Parameters<typeof settingsService.saveAccomplishAiCredits>[0],
      );
      return Promise.resolve();
    }),
  );
  rpc.registerMethod(
    'provider.getHuggingFaceLocalConfig',
    safeHandler(() => Promise.resolve(settingsService.getHuggingFaceLocalConfig())),
  );
  rpc.registerMethod(
    'provider.setHuggingFaceLocalConfig',
    safeHandler((params) => {
      const v = validate(z.object({ config: z.unknown().nullable() }), params);
      settingsService.setHuggingFaceLocalConfig(
        v.config as Parameters<typeof settingsService.setHuggingFaceLocalConfig>[0],
      );
      return Promise.resolve();
    }),
  );

  // Forward settings.changed events to all connected clients.
  settingsService.on('settings.changed', (payload: SettingsChangePayload) => {
    rpc.notify('settings.changed', payload);
  });

  // ── Workspaces ───────────────────────────────────────────────────────────
  const workspaceIdParam = z.object({ workspaceId: z.string().min(1) });

  rpc.registerMethod(
    'workspace.list',
    safeHandler(() => Promise.resolve(workspaceService.list())),
  );
  rpc.registerMethod(
    'workspace.get',
    safeHandler((params) => {
      const v = validate(workspaceIdParam, params);
      return Promise.resolve(workspaceService.get(v.workspaceId));
    }),
  );
  rpc.registerMethod(
    'workspace.getActive',
    safeHandler(() => Promise.resolve(workspaceService.getActive())),
  );
  rpc.registerMethod(
    'workspace.setActive',
    safeHandler((params) => {
      const v = validate(workspaceIdParam, params);
      workspaceService.setActive(v.workspaceId);
      return Promise.resolve();
    }),
  );
  rpc.registerMethod(
    'workspace.create',
    safeHandler((params) => {
      const v = validate(z.object({ input: z.unknown() }), params);
      return Promise.resolve(
        workspaceService.create(v.input as Parameters<typeof workspaceService.create>[0]),
      );
    }),
  );
  rpc.registerMethod(
    'workspace.update',
    safeHandler((params) => {
      const v = validate(z.object({ workspaceId: z.string().min(1), input: z.unknown() }), params);
      return Promise.resolve(
        workspaceService.update(
          v.workspaceId,
          v.input as Parameters<typeof workspaceService.update>[1],
        ),
      );
    }),
  );
  rpc.registerMethod(
    'workspace.delete',
    safeHandler((params) => {
      const v = validate(workspaceIdParam, params);
      workspaceService.delete(v.workspaceId);
      return Promise.resolve();
    }),
  );

  // ── Knowledge notes ─────────────────────────────────────────────────────
  const noteKeyParam = z.object({
    noteId: z.string().min(1),
    workspaceId: z.string().min(1),
  });

  rpc.registerMethod(
    'knowledgeNote.list',
    safeHandler((params) => {
      const v = validate(workspaceIdParam, params);
      return Promise.resolve(workspaceService.listKnowledgeNotes(v.workspaceId));
    }),
  );
  rpc.registerMethod(
    'knowledgeNote.get',
    safeHandler((params) => {
      const v = validate(noteKeyParam, params);
      return Promise.resolve(workspaceService.getKnowledgeNote(v.noteId, v.workspaceId));
    }),
  );
  rpc.registerMethod(
    'knowledgeNote.create',
    safeHandler((params) => {
      const v = validate(z.object({ input: z.unknown() }), params);
      return Promise.resolve(
        workspaceService.createKnowledgeNote(
          v.input as Parameters<typeof workspaceService.createKnowledgeNote>[0],
        ),
      );
    }),
  );
  rpc.registerMethod(
    'knowledgeNote.update',
    safeHandler((params) => {
      const v = validate(
        z.object({
          noteId: z.string().min(1),
          workspaceId: z.string().min(1),
          input: z.unknown(),
        }),
        params,
      );
      return Promise.resolve(
        workspaceService.updateKnowledgeNote(
          v.noteId,
          v.workspaceId,
          v.input as Parameters<typeof workspaceService.updateKnowledgeNote>[2],
        ),
      );
    }),
  );
  rpc.registerMethod(
    'knowledgeNote.delete',
    safeHandler((params) => {
      const v = validate(noteKeyParam, params);
      workspaceService.deleteKnowledgeNote(v.noteId, v.workspaceId);
      return Promise.resolve();
    }),
  );

  // Forward workspace.changed events to all connected clients.
  workspaceService.on('workspace.changed', (payload: WorkspaceChangePayload) => {
    rpc.notify('workspace.changed', payload);
  });

  // ── Favorites ────────────────────────────────────────────────────────────
  rpc.registerMethod(
    'favorites.list',
    safeHandler(() => Promise.resolve(storage.getFavorites())),
  );
  rpc.registerMethod(
    'favorites.add',
    safeHandler((params) => {
      const v = validate(
        z.object({
          taskId: z.string().min(1),
          prompt: z.string(),
          summary: z.string().optional(),
        }),
        params,
      );
      storage.addFavorite(v.taskId, v.prompt, v.summary);
      return Promise.resolve();
    }),
  );
  rpc.registerMethod(
    'favorites.remove',
    safeHandler((params) => {
      const v = validate(taskIdSchema, params);
      storage.removeFavorite(v.taskId);
      return Promise.resolve();
    }),
  );
  rpc.registerMethod(
    'favorites.isFavorite',
    safeHandler((params) => {
      const v = validate(taskIdSchema, params);
      return Promise.resolve(storage.isFavorite(v.taskId));
    }),
  );

  // ── Logs (bug-report support) ───────────────────────────────────────────
  // The desktop bug-report handler reads recent task history to attach to
  // the generated report. Exposing it here avoids having the renderer reach
  // into the DB through main after M3.
  rpc.registerMethod(
    'logs.getTasksForBugReport',
    safeHandler(() => Promise.resolve(storage.getTasks())),
  );

  // ── Legacy electron-store import (one-shot, guarded) ─────────────────────
  rpc.registerMethod(
    'legacy.importElectronStoreIfNeeded',
    safeHandler((params) => {
      const v = validate(
        z.object({
          appSettingsPath: z.string().min(1),
          providerSettingsPath: z.string().min(1),
          taskHistoryPath: z.string().min(1),
        }),
        params,
      );
      return Promise.resolve(legacyImportService.importElectronStoreIfNeeded(v));
    }),
  );
}
