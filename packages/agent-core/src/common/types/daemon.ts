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
