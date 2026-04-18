/**
 * Daemon RPC Protocol Types
 *
 * JSON-RPC 2.0 message types for communication between the Electron UI
 * (thin client) and the always-on daemon process.
 *
 * ESM module — use .js extensions on imports.
 */

import type {
  FileAttachmentInfo,
  Task,
  TaskMessage,
  TaskProgress,
  TaskResult,
  TaskStatus,
} from './task.js';
import type { PermissionRequest, PermissionResponse } from './permission.js';
import type { TodoItem } from './todo.js';
import type { CreditUsage } from './gateway.js';
// M2 storage-surface types. These are type-only imports — TypeScript erases
// them at emit time, so pulling them in from sibling common modules (and
// from `../../types/storage.js`, the `AppSettings` / `SelectedModel` layer)
// does not widen the runtime graph. Keeps the RPC contract single-sourced.
import type {
  HuggingFaceLocalConfig,
  SelectedModel,
  OllamaConfig,
  LiteLLMConfig,
  AzureFoundryConfig,
  LMStudioConfig,
  NimConfig,
} from './provider.js';
import type { McpConnector, ConnectorStatus, OAuthTokens, StoredAuthEntry } from './connector.js';
import type { ProviderId, ConnectedProvider, ProviderSettings } from './providerSettings.js';
import type {
  Workspace,
  WorkspaceCreateInput,
  WorkspaceUpdateInput,
  KnowledgeNote,
  KnowledgeNoteCreateInput,
  KnowledgeNoteUpdateInput,
} from './workspace.js';
import type { SandboxConfig } from './sandbox.js';
import type { CloudBrowserConfig } from './cloud-browser.js';
import type { MessagingConfig } from './messaging.js';
import type {
  AppSettings,
  ThemePreference,
  LanguagePreference,
  StoredFavorite,
} from '../../types/storage.js';
import type { GoogleAccount, GoogleAccountStatus, GoogleAccountToken } from './google-account.js';
import type { Skill } from './skills.js';

// =============================================================================
// JSON-RPC 2.0 Base Types
// =============================================================================

export interface JsonRpcRequest<TParams = unknown> {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: TParams;
}

export interface JsonRpcResponse<TResult = unknown> {
  jsonrpc: '2.0';
  id: string | number;
  result?: TResult;
  error?: JsonRpcError;
}

export interface JsonRpcNotification<TParams = unknown> {
  jsonrpc: '2.0';
  method: string;
  params?: TParams;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

/** Union of all JSON-RPC message types. */
export type JsonRpcMessage = JsonRpcRequest | JsonRpcResponse | JsonRpcNotification;

// =============================================================================
// Standard JSON-RPC Error Codes
// =============================================================================

export const JSON_RPC_ERRORS = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  /** Custom: task not found */
  TASK_NOT_FOUND: -32000,
  /** Custom: no provider configured */
  NO_PROVIDER: -32001,
  /** Custom: daemon not ready */
  NOT_READY: -32002,
} as const;

// =============================================================================
// RPC Method Definitions (Client → Daemon requests)
// =============================================================================

/** Parameters for task.start */
export interface TaskStartParams {
  prompt: string;
  taskId?: string;
  modelId?: string;
  sessionId?: string;
  workingDirectory?: string;
  workspaceId?: string;
  attachments?: FileAttachmentInfo[];
  allowedTools?: string[];
  systemPromptAppend?: string;
  outputSchema?: object;
  /**
   * Originating surface — `'ui' | 'whatsapp' | 'scheduler'`. Drives the
   * no-UI auto-deny policy for permission/question prompts when the task
   * runs headlessly (Phase 2 of the SDK cutover port, decision #5).
   *
   * The runtime zod schema at `validation.ts:taskConfigSchema` already
   * accepts this field, but any typed RPC caller that follows this
   * interface used to silently omit it and default to `'ui'`. WhatsApp
   * bridge and scheduler callers call `TaskService.startTask` directly
   * (not via RPC), so they were unaffected; the gap mattered for any
   * future RPC-path caller.
   */
  source?: import('./task.js').TaskSource;
}

/** Parameters for task.cancel / task.interrupt */
export interface TaskIdParams {
  taskId: string;
}

/** Parameters for task.list (optional workspace filter) */
export interface TaskListParams {
  workspaceId?: string;
  /** When true, also return tasks with no workspace (workspace_id IS NULL) */
  includeUnassigned?: boolean;
}

/** Parameters for task.sendResponse */
export interface TaskSendResponseParams {
  taskId: string;
  response: string;
}

/** Parameters for permission.respond */
/** Flat permission response — matches permissionResponseSchema validation. */
export type PermissionRespondParams = PermissionResponse;

/** Parameters for session.resume */
export interface SessionResumeParams {
  sessionId: string;
  prompt: string;
  existingTaskId?: string;
  workspaceId?: string;
  attachments?: import('./task.js').FileAttachmentInfo[];
}

/** Parameters for storage.saveTask */
export interface StorageSaveTaskParams {
  task: Task;
}

/** Parameters for storage.updateTaskStatus */
export interface StorageUpdateTaskStatusParams {
  taskId: string;
  status: TaskStatus;
  completedAt?: string;
}

/** Parameters for storage.updateTaskSummary */
export interface StorageUpdateTaskSummaryParams {
  taskId: string;
  summary: string;
}

/** Parameters for storage.addTaskMessage */
export interface StorageAddTaskMessageParams {
  taskId: string;
  message: TaskMessage;
}

/** Parameters for storage.deleteTask */
export interface StorageDeleteTaskParams {
  taskId: string;
}

export interface ScheduledTask {
  id: string;
  /** Cron expression (e.g. '0 9 * * 1-5' = weekdays at 9am) */
  cron: string;
  /** Task prompt to execute */
  prompt: string;
  /** Optional workspace scope */
  workspaceId?: string;
  /** Whether this schedule is active */
  enabled: boolean;
  /** ISO timestamp of creation */
  createdAt: string;
  /** ISO timestamp of last update */
  updatedAt: string;
  /** ISO timestamp of last execution, if any */
  lastRunAt?: string;
  /** ISO timestamp of next planned execution */
  nextRunAt?: string;
}

/** Parameters for task.schedule */
export interface TaskScheduleParams {
  cron: string;
  prompt: string;
  workspaceId?: string;
}

/** Parameters for task.cancelScheduled */
export interface TaskCancelScheduledParams {
  scheduleId: string;
}

// =============================================================================
// Health Check Result
// =============================================================================

export interface HealthCheckResult {
  version: string;
  uptime: number;
  activeTasks: number;
  memoryUsage: number;
}

/** WhatsApp config returned by whatsapp.getConfig — includes QR recovery data. */
export interface WhatsAppDaemonConfig {
  providerId: 'whatsapp';
  enabled: boolean;
  status: import('./messaging.js').MessagingConnectionStatus;
  phoneNumber?: string;
  lastConnectedAt?: number;
  /** Current QR code string when status is 'qr_ready' */
  qrCode?: string;
  /** Timestamp when the QR was first emitted — UI computes remaining time */
  qrIssuedAt?: number;
}

// =============================================================================
// M2 storage-surface payloads (daemon-only-SQLite migration)
//
// Defined here (not in the daemon package) so both sides of the RPC share a
// single source of truth. Extending `DaemonMethodMap` and
// `DaemonNotificationMap` below pulls these types into `DaemonClient.call()`
// and `onNotification()`, giving M3 typed callers from the desktop side.
// =============================================================================

/** Snapshot of user-visible settings returned by `settings.getAll`. Used by
 *  M5's daemon-first startup to fetch everything needed to render the first
 *  frame in a single RPC round-trip. */
export interface SettingsSnapshot {
  /** The `AppSettings` row (theme, language, debug, onboarding, model + local-provider configs). */
  app: AppSettings;
  /** Active + connected providers + debug mode. */
  providers: ProviderSettings;
  /** HuggingFace-local MCP config (enabled + selected model), stored separately from `AppSettings`. */
  huggingFaceLocalConfig: HuggingFaceLocalConfig | null;
  /** Desktop notification toggle. Not included in `AppSettings` today. */
  notificationsEnabled: boolean;
  /** What the close-window button does: keep the daemon running or stop it. */
  closeBehavior: 'keep-daemon' | 'stop-daemon';
  /** Sandbox execution config (network policy, mount points, etc.). */
  sandboxConfig: SandboxConfig;
  /** Cloud-browser config (null if cloud-browser isn't configured). */
  cloudBrowserConfig: CloudBrowserConfig | null;
  /** Messaging integration config (null if not configured). */
  messagingConfig: MessagingConfig | null;
  /** NVIDIA NIM provider config — NOT in `AppSettings`, so carried separately. */
  nimConfig: NimConfig | null;
}

/** Discriminated union describing a settings write. Subscribers can patch
 *  their cache in place using the `key` to route; `providerSettings` is a
 *  deliberately-coarse bucket since provider writes touch a shared JSON blob. */
export type SettingsChangePayload =
  | { key: 'theme'; value: ThemePreference }
  | { key: 'language'; value: LanguagePreference }
  | { key: 'debugMode'; value: boolean }
  | { key: 'notificationsEnabled'; value: boolean }
  | { key: 'closeBehavior'; value: 'keep-daemon' | 'stop-daemon' }
  | { key: 'sandboxConfig'; value: SandboxConfig }
  | { key: 'cloudBrowserConfig'; value: CloudBrowserConfig | null }
  | { key: 'messagingConfig'; value: MessagingConfig | null }
  | { key: 'onboardingComplete'; value: boolean }
  | { key: 'providerSettings' }
  | { key: 'huggingFaceLocalConfig'; value: HuggingFaceLocalConfig | null }
  // Individual provider-config + selected-model variants, emitted by each
  // of the corresponding SettingsService setters so the renderer can patch
  // only the affected bucket.
  | { key: 'selectedModel'; value: SelectedModel }
  | { key: 'openaiBaseUrl'; value: string }
  | { key: 'ollamaConfig'; value: OllamaConfig | null }
  | { key: 'litellmConfig'; value: LiteLLMConfig | null }
  | { key: 'azureFoundryConfig'; value: AzureFoundryConfig | null }
  | { key: 'lmstudioConfig'; value: LMStudioConfig | null }
  | { key: 'nimConfig'; value: NimConfig | null };

/** Result shape for `workspace.setActive` and `workspace.delete`: callers
 *  need to know whether the operation actually changed state so they can
 *  avoid redundant UI re-renders and report accurate success to the user. */
export interface WorkspaceSetActiveResult {
  /** `true` if the active workspace changed; `false` if it was already active. */
  changed: boolean;
}
export interface WorkspaceDeleteResult {
  /** `true` if a row was deleted; `false` if the workspace didn't exist or was the default. */
  deleted: boolean;
  /** If the deleted workspace was active, the id we switched to (default or first remaining). */
  newActiveWorkspaceId?: string;
}

/** Discriminated union describing a workspace-or-KN write. `workspaceId` is
 *  always the workspace the change scopes to — for KN operations, the
 *  workspaceId the note lives in; for workspace-level events, the affected
 *  workspace itself. */
export type WorkspaceChangePayload =
  | { kind: 'workspace.created'; workspaceId: string }
  | { kind: 'workspace.updated'; workspaceId: string }
  | { kind: 'workspace.deleted'; workspaceId: string }
  | { kind: 'workspace.activeChanged'; workspaceId: string }
  | { kind: 'knowledgeNote.changed'; workspaceId: string };

/** Payload for `gwsAccount.add` — OAuth loopback on desktop hands the
 *  daemon the account metadata (from the Google userinfo endpoint) and the
 *  token bundle (access + refresh + expiry + scopes). The daemon owns the
 *  DB row + secure-storage token from there. */
export interface GwsAccountAddInput {
  googleAccountId: string;
  email: string;
  displayName: string;
  pictureUrl: string | null;
  label: string;
  connectedAt: string;
  token: GoogleAccountToken;
}

/** Result emitted by `gwsAccount.getToken` — deliberately excludes the
 *  refresh token. Main only needs the access token to mint manifest
 *  entries for child OpenCode processes; the refresh token stays
 *  daemon-side so it never crosses the IPC boundary. */
export interface GwsAccountTokenResult {
  accessToken: string;
  scopes: string[];
  expiresAt: number;
}

/** `gwsAccount.statusChanged` notification — emitted by GoogleAccountService
 *  whenever a token-refresh success/failure changes the status column. */
export interface GwsAccountStatusChangedPayload {
  googleAccountId: string;
  status: GoogleAccountStatus;
}

/** `skills.changed` notification — emitted by SkillsService whenever a
 *  skill is added, removed, toggled, or resynced. Renderer patches its
 *  cache by reloading `skills.list` on every such event; no partial diffs. */
export interface SkillsChangedPayload {
  kind: 'added' | 'removed' | 'updated' | 'resynced';
}

/** Result of the one-shot electron-store → SQLite importer (`legacy.importElectronStoreIfNeeded`). */
export type LegacyImportResult =
  | { imported: true; reason: 'completed' }
  | { imported: false; reason: 'already-imported' }
  | { imported: false; reason: 'existing-data' };

export interface LegacyImportPaths {
  appSettingsPath: string;
  providerSettingsPath: string;
  taskHistoryPath: string;
}

// =============================================================================
// Method Map: maps RPC method names to { params, result } types
// =============================================================================

export interface DaemonMethodMap {
  // Task lifecycle
  'task.start': { params: TaskStartParams; result: Task };
  'task.cancel': { params: TaskIdParams; result: void };
  'task.interrupt': { params: TaskIdParams; result: void };
  'task.list': { params: TaskListParams | undefined; result: Task[] };
  'task.get': { params: TaskIdParams; result: Task | null };
  'task.delete': { params: StorageDeleteTaskParams; result: void };
  'task.clearHistory': { params: undefined; result: void };
  'task.getTodos': { params: TaskIdParams; result: TodoItem[] };
  'task.getActiveCount': { params: undefined; result: number };
  'task.status': {
    params: TaskIdParams;
    result: {
      taskId: string;
      status: import('./task.js').TaskStatus;
      prompt: string;
      createdAt: string;
    } | null;
  };

  // Session
  'session.resume': { params: SessionResumeParams; result: Task };

  // Permission
  'permission.respond': { params: PermissionRespondParams; result: void };

  // Scheduling
  'task.schedule': { params: TaskScheduleParams; result: ScheduledTask };
  'task.listScheduled': { params: { workspaceId?: string } | undefined; result: ScheduledTask[] };
  'task.cancelScheduled': { params: TaskCancelScheduledParams; result: void };
  'task.setScheduleEnabled': {
    params: { scheduleId: string; enabled: boolean };
    result: void;
  };

  // WhatsApp
  'whatsapp.connect': { params: undefined; result: void };
  'whatsapp.disconnect': { params: undefined; result: void };
  'whatsapp.getConfig': { params: undefined; result: WhatsAppDaemonConfig | null };
  'whatsapp.setEnabled': { params: { enabled: boolean }; result: void };

  // Health & lifecycle
  'daemon.ping': { params: undefined; result: { status: 'ok'; uptime: number; buildId?: string } };
  'daemon.shutdown': { params: undefined; result: void };
  'health.check': { params: undefined; result: HealthCheckResult };

  // Accomplish AI free tier
  'accomplish-ai.connect': {
    params: undefined;
    result: { deviceFingerprint: string; usage: CreditUsage | null };
  };
  'accomplish-ai.get-usage': { params: undefined; result: CreditUsage };
  'accomplish-ai.disconnect': { params: undefined; result: void };

  // OpenAI ChatGPT OAuth (Phase 4a of the SDK cutover port).
  // Four-method protocol — desktop calls `startLogin` + `awaitCompletion`
  // around an `Electron shell.openExternal`; `status` and `getAccessToken`
  // are non-flow reads used by settings UI and model discovery respectively.
  'auth.openai.startLogin': {
    params: undefined;
    result: { sessionId: string; authorizeUrl: string };
  };
  'auth.openai.awaitCompletion': {
    params: { sessionId: string; timeoutMs?: number };
    result: { ok: true; plan: 'free' | 'paid' } | { ok: false; error: string };
  };
  'auth.openai.status': {
    params: undefined;
    result: { connected: boolean; expires?: number };
  };
  'auth.openai.getAccessToken': {
    params: undefined;
    result: string | null;
  };

  // ──────────────────────────────────────────────────────────────────────
  // M2 storage-surface routes (daemon-only-SQLite migration).
  //
  // All of these wrap StorageAPI (or agent-core repo functions) on the
  // daemon side. Nothing in main consumes them yet; M3 and M5 will
  // progressively repoint desktop callers.
  // ──────────────────────────────────────────────────────────────────────

  // Secrets — SecureStorageAPI pass-throughs
  'secrets.storeApiKey': { params: { provider: string; apiKey: string }; result: void };
  'secrets.getApiKey': { params: { provider: string }; result: string | null };
  'secrets.deleteApiKey': { params: { provider: string }; result: boolean };
  'secrets.getAllApiKeys': { params: undefined; result: Record<string, string | null> };
  'secrets.hasAnyApiKey': { params: undefined; result: boolean };
  'secrets.storeBedrockCredentials': { params: { credentials: string }; result: void };
  'secrets.getBedrockCredentials': {
    params: undefined;
    result: Record<string, string> | null;
  };
  'secrets.clear': { params: undefined; result: void };

  // Settings — bulk read + individual setters + on-demand getters for the
  // fields AppSettings doesn't already cover (notifications, closeBehavior,
  // and the three typed-config blobs).
  'settings.getAll': { params: undefined; result: SettingsSnapshot };
  'settings.setTheme': { params: { theme: ThemePreference }; result: void };
  'settings.setLanguage': { params: { language: LanguagePreference }; result: void };
  'settings.setDebugMode': { params: { enabled: boolean }; result: void };
  'settings.setNotificationsEnabled': { params: { enabled: boolean }; result: void };
  'settings.getNotificationsEnabled': { params: undefined; result: boolean };
  'settings.setCloseBehavior': {
    params: { behavior: 'keep-daemon' | 'stop-daemon' };
    result: void;
  };
  'settings.getCloseBehavior': {
    params: undefined;
    result: 'keep-daemon' | 'stop-daemon';
  };
  'settings.setSandboxConfig': { params: { config: SandboxConfig }; result: void };
  'settings.getSandboxConfig': { params: undefined; result: SandboxConfig };
  'settings.setCloudBrowserConfig': {
    params: { config: CloudBrowserConfig | null };
    result: void;
  };
  'settings.getCloudBrowserConfig': {
    params: undefined;
    result: CloudBrowserConfig | null;
  };
  'settings.setMessagingConfig': {
    params: { config: MessagingConfig | null };
    result: void;
  };
  'settings.getMessagingConfig': { params: undefined; result: MessagingConfig | null };
  'settings.setOnboardingComplete': { params: { complete: boolean }; result: void };

  // Selected model + provider configs currently reachable through desktop's
  // `getStorage().setXxxConfig` + `model:set` IPC handlers. Named-field
  // setters + getters so M3 can repoint each handler one-for-one; matching
  // `settings.changed` variants live in `SettingsChangePayload`.
  'settings.getSelectedModel': { params: undefined; result: SelectedModel | null };
  'settings.setSelectedModel': { params: { model: SelectedModel }; result: void };
  'settings.getOpenAiBaseUrl': { params: undefined; result: string };
  'settings.setOpenAiBaseUrl': { params: { baseUrl: string }; result: void };
  'settings.getOllamaConfig': { params: undefined; result: OllamaConfig | null };
  'settings.setOllamaConfig': { params: { config: OllamaConfig | null }; result: void };
  'settings.getLiteLLMConfig': { params: undefined; result: LiteLLMConfig | null };
  'settings.setLiteLLMConfig': { params: { config: LiteLLMConfig | null }; result: void };
  'settings.getAzureFoundryConfig': {
    params: undefined;
    result: AzureFoundryConfig | null;
  };
  'settings.setAzureFoundryConfig': {
    params: { config: AzureFoundryConfig | null };
    result: void;
  };
  'settings.getLMStudioConfig': { params: undefined; result: LMStudioConfig | null };
  'settings.setLMStudioConfig': { params: { config: LMStudioConfig | null }; result: void };
  'settings.getNimConfig': { params: undefined; result: NimConfig | null };
  'settings.setNimConfig': { params: { config: NimConfig | null }; result: void };

  // Provider settings
  'provider.getSettings': { params: undefined; result: ProviderSettings };
  'provider.setActive': { params: { providerId: ProviderId | null }; result: void };
  'provider.setConnected': {
    params: { providerId: ProviderId; provider: ConnectedProvider };
    result: void;
  };
  'provider.removeConnected': { params: { providerId: ProviderId }; result: void };
  'provider.updateModel': {
    params: { providerId: ProviderId; modelId: string | null };
    result: void;
  };
  'provider.setDebugMode': { params: { enabled: boolean }; result: void };
  'provider.getDebugMode': { params: undefined; result: boolean };
  'provider.getAccomplishAiCredits': { params: undefined; result: CreditUsage | null };
  'provider.saveAccomplishAiCredits': { params: { usage: CreditUsage }; result: void };
  'provider.getHuggingFaceLocalConfig': {
    params: undefined;
    result: HuggingFaceLocalConfig | null;
  };
  'provider.setHuggingFaceLocalConfig': {
    params: { config: HuggingFaceLocalConfig | null };
    result: void;
  };

  // Workspaces
  'workspace.list': { params: undefined; result: Workspace[] };
  'workspace.get': { params: { workspaceId: string }; result: Workspace | null };
  'workspace.getActive': { params: undefined; result: Workspace | null };
  'workspace.setActive': {
    params: { workspaceId: string };
    result: WorkspaceSetActiveResult;
  };
  'workspace.create': { params: { input: WorkspaceCreateInput }; result: Workspace };
  'workspace.update': {
    params: { workspaceId: string; input: WorkspaceUpdateInput };
    result: Workspace | null;
  };
  'workspace.delete': {
    params: { workspaceId: string };
    result: WorkspaceDeleteResult;
  };

  // Knowledge notes (composite `(noteId, workspaceId)` key — the repo
  // requires both because notes are workspace-scoped)
  'knowledgeNote.list': { params: { workspaceId: string }; result: KnowledgeNote[] };
  'knowledgeNote.get': {
    params: { noteId: string; workspaceId: string };
    result: KnowledgeNote | null;
  };
  'knowledgeNote.create': {
    params: { input: KnowledgeNoteCreateInput };
    result: KnowledgeNote;
  };
  'knowledgeNote.update': {
    params: { noteId: string; workspaceId: string; input: KnowledgeNoteUpdateInput };
    result: KnowledgeNote | null;
  };
  'knowledgeNote.delete': {
    params: { noteId: string; workspaceId: string };
    result: void;
  };

  // Favorites
  'favorites.list': { params: undefined; result: StoredFavorite[] };
  'favorites.add': {
    params: { taskId: string; prompt: string; summary?: string };
    result: void;
  };
  'favorites.remove': { params: TaskIdParams; result: void };
  'favorites.isFavorite': { params: TaskIdParams; result: boolean };

  // Connectors (MCP + OAuth tokens). M3 repoints `connector-handlers.ts`
  // + `connector-auth-entry.ts` onto these. The `connectors.storeTokens`
  // surface uses the typed `ConnectorStorageAPI.storeConnectorTokens`
  // (encrypted via the secure-storage file under a per-connector key),
  // NOT the legacy `connector-auth:<key>` prefix that desktop wrote
  // directly — M3 handles any key-space migration needed.
  'connectors.list': { params: undefined; result: McpConnector[] };
  'connectors.getEnabled': { params: undefined; result: McpConnector[] };
  'connectors.getById': { params: { id: string }; result: McpConnector | null };
  'connectors.upsert': { params: { connector: McpConnector }; result: void };
  'connectors.setEnabled': { params: { id: string; enabled: boolean }; result: void };
  'connectors.setStatus': { params: { id: string; status: ConnectorStatus }; result: void };
  'connectors.delete': { params: { id: string }; result: void };
  'connectors.storeTokens': {
    params: { connectorId: string; tokens: OAuthTokens };
    result: void;
  };
  'connectors.getTokens': { params: { connectorId: string }; result: OAuthTokens | null };
  'connectors.deleteTokens': { params: { connectorId: string }; result: void };

  // Built-in connector auth entries (`connector-auth:<key>` prefix). Carry
  // the full StoredAuthEntry blob — tokens, DCR clientRegistration, serverUrl,
  // pending-auth PKCE state, lastOAuthValidatedAt — so M3 can repoint
  // `connector-auth-entry.ts` without losing Lightdash/Datadog/Slack/etc.
  // session state on upgrade. `connectorKey` is the raw provider key
  // (e.g. `slack`); the daemon applies the `connector-auth:` prefix internally.
  'connectors.authEntry.read': {
    params: { connectorKey: string };
    result: StoredAuthEntry | null;
  };
  'connectors.authEntry.write': {
    params: { connectorKey: string; entry: StoredAuthEntry };
    result: void;
  };
  'connectors.authEntry.delete': { params: { connectorKey: string }; result: void };

  // Google accounts (M4 — daemon owns DB + token refresh). OAuth loopback
  // stays in main because it needs `shell.openExternal` + a local HTTP
  // server; on success main calls `gwsAccount.add` which schedules the
  // refresh timer daemon-side. `gwsAccount.getToken` returns the access
  // token only — the refresh token stays daemon-owned.
  'gwsAccount.list': { params: undefined; result: GoogleAccount[] };
  'gwsAccount.add': { params: { input: GwsAccountAddInput }; result: void };
  'gwsAccount.remove': { params: { googleAccountId: string }; result: void };
  'gwsAccount.updateLabel': {
    params: { googleAccountId: string; label: string };
    result: void;
  };
  'gwsAccount.updateToken': {
    params: { googleAccountId: string; token: GoogleAccountToken; connectedAt: string };
    result: void;
  };
  'gwsAccount.getToken': {
    params: { googleAccountId: string };
    result: GwsAccountTokenResult | null;
  };
  'gwsAccount.refreshNow': { params: { googleAccountId: string }; result: void };

  // Skills (M4). The daemon owns the skills repo + disk-scan / frontmatter
  // parsing via `createSkillsManager`. Main keeps the Electron-only parts:
  // dialog.showOpenDialog for folder pickers, `shell.openPath` /
  // `shell.showItemInFolder`. File paths selected by the user are passed
  // to the daemon via `skills.addFromPath`. The daemon emits
  // `skills.changed` on every mutation; renderer reloads via `skills.list`.
  'skills.list': { params: undefined; result: Skill[] };
  'skills.listEnabled': { params: undefined; result: Skill[] };
  'skills.setEnabled': { params: { skillId: string; enabled: boolean }; result: void };
  'skills.getContent': { params: { skillId: string }; result: string | null };
  'skills.addFromPath': { params: { sourcePath: string }; result: Skill | null };
  'skills.delete': { params: { skillId: string }; result: void };
  'skills.resync': { params: undefined; result: Skill[] };
  'skills.getUserSkillsPath': { params: undefined; result: string };

  // Logs (bug-report support)
  'logs.getTasksForBugReport': { params: undefined; result: Task[] };

  // Legacy electron-store import (one-shot, guarded by schema_meta flag)
  'legacy.importElectronStoreIfNeeded': {
    params: LegacyImportPaths;
    result: LegacyImportResult;
  };
}

/** All valid daemon RPC method names. */
export type DaemonMethod = keyof DaemonMethodMap;

// =============================================================================
// Notification Definitions (Daemon → Client push events)
// =============================================================================

export interface DaemonNotificationMap {
  'task.progress': TaskProgress;
  'task.message': { taskId: string; messages: TaskMessage[] };
  'task.statusChange': { taskId: string; status: string; completedAt?: string };
  'task.summary': { taskId: string; summary: string };
  'task.complete': { taskId: string; result: TaskResult };
  'task.error': { taskId: string; error?: string };
  // Phase 2 of the SDK cutover port decided to stay with the flat
  // `PermissionRequest` wire shape. The runtime at
  // `apps/daemon/src/task-event-forwarding.ts:24` forwards the flat
  // payload and renderer consumers read `request.taskId` directly.
  // Earlier drafts of this map said `{ taskId, request }` — that never
  // matched the wire; typed callers and future refactors would have
  // carried a bogus contract.
  'permission.request': PermissionRequest;
  'todo.update': { taskId: string; todos: TodoItem[] };
  // Connector auth-required marker observed in tool output. Renderer
  // subscribes via `accomplish.onAuthError`. Added alongside the P1
  // task-callbacks wiring fix (Codex R4 P1 #1).
  'auth.error': { taskId: string; providerId: string; message: string };
  // Browser preview frames from `dev-browser-mcp` tool output. Renderer
  // subscribes via `accomplish.onBrowserFrame`. ENG-695 / PR #414 —
  // plan decision #7 explicitly preserves this path.
  'browser.frame': { taskId: string; [key: string]: unknown };

  // Accomplish AI credit usage updates (emitted by proxy on each gateway response)
  'accomplish-ai.usage-update': CreditUsage;
  // WhatsApp notifications
  'whatsapp.qr': { qr: string };
  'whatsapp.status': { status: import('./messaging.js').MessagingConnectionStatus };

  // M2 storage-surface notifications (daemon-only-SQLite migration).
  // `settings.changed` is emitted by the daemon's SettingsService on every
  // write; `workspace.changed` by WorkspaceService on every workspace or
  // knowledge-note mutation. The renderer uses these to patch its cache
  // instead of re-fetching on every IPC round-trip.
  'settings.changed': SettingsChangePayload;
  'workspace.changed': WorkspaceChangePayload;
  // M4 — daemon owns Google accounts + skills. Main forwards these events
  // to the renderer over IPC (`gws:account:status-changed`, `skills:changed`).
  'gwsAccount.statusChanged': GwsAccountStatusChangedPayload;
  'skills.changed': SkillsChangedPayload;
}

/** All valid daemon notification names. */
export type DaemonNotification = keyof DaemonNotificationMap;

// =============================================================================
// Typed Request / Response / Notification Helpers
// =============================================================================

export type TypedJsonRpcRequest<M extends DaemonMethod> = JsonRpcRequest<
  DaemonMethodMap[M]['params']
>;

export type TypedJsonRpcResponse<M extends DaemonMethod> = JsonRpcResponse<
  DaemonMethodMap[M]['result']
>;

export type TypedJsonRpcNotification<N extends DaemonNotification> = JsonRpcNotification<
  DaemonNotificationMap[N]
>;

// =============================================================================
// Transport Abstraction
// =============================================================================

/** A bidirectional message channel (socket, in-process, named pipe, etc.) */
export interface DaemonTransport {
  /** Send a JSON-RPC message to the other end. */
  send(message: JsonRpcMessage): void;

  /** Register a handler for incoming messages. */
  onMessage(handler: (message: JsonRpcMessage) => void): void;

  /** Close the transport. */
  close(): void;
}

/** Connection state of the transport. */
export type DaemonConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';
