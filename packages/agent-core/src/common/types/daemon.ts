/**
 * Daemon RPC Protocol Types
 *
 * JSON-RPC 2.0 message types for communication between the Electron UI
 * (thin client) and the always-on daemon process.
 *
 * ESM module — use .js extensions on imports.
 */

import type {
  TaskConfig,
  Task,
  TaskMessage,
  TaskProgress,
  TaskResult,
  TaskStatus,
} from './task.js';
import type { PermissionRequest, PermissionResponse } from './permission.js';
import type { ThoughtEvent, CheckpointEvent } from './thought-stream.js';
import type { TodoItem } from './todo.js';

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
  taskId: string;
  config: TaskConfig;
}

/** Parameters for task.cancel / task.interrupt */
export interface TaskIdParams {
  taskId: string;
}

/** Parameters for task.sendResponse */
export interface TaskSendResponseParams {
  taskId: string;
  response: string;
}

/** Parameters for permission.respond */
export interface PermissionRespondParams {
  response: PermissionResponse;
}

/** Parameters for session.resume */
export interface SessionResumeParams {
  sessionId: string;
  prompt: string;
  existingTaskId?: string;
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

/** A scheduled task definition. */
export interface ScheduledTask {
  id: string;
  /** Cron expression (e.g. '0 9 * * 1-5' = weekdays at 9am) */
  cron: string;
  /** Task prompt to execute */
  prompt: string;
  /** Whether this schedule is active */
  enabled: boolean;
  /** ISO timestamp of creation */
  createdAt: string;
  /** ISO timestamp of last execution, if any */
  lastRunAt?: string;
  /** ISO timestamp of next planned execution */
  nextRunAt?: string;
}

/** Parameters for task.schedule */
export interface TaskScheduleParams {
  cron: string;
  prompt: string;
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

// =============================================================================
// Method Map: maps RPC method names to { params, result } types
// =============================================================================

export interface DaemonMethodMap {
  // Task lifecycle
  'task.start': { params: TaskStartParams; result: Task };
  'task.cancel': { params: TaskIdParams; result: void };
  'task.interrupt': { params: TaskIdParams; result: void };
  'task.sendResponse': { params: TaskSendResponseParams; result: void };
  'task.list': { params: undefined; result: Task[] };
  'task.get': { params: TaskIdParams; result: Task | null };
  'task.delete': { params: StorageDeleteTaskParams; result: void };
  'task.clearHistory': { params: undefined; result: void };
  'task.getTodos': { params: TaskIdParams; result: TodoItem[] };
  'task.getActiveIds': { params: undefined; result: string[] };
  'task.getActiveCount': { params: undefined; result: number };
  'task.hasActive': { params: TaskIdParams; result: boolean };
  'task.isQueued': { params: TaskIdParams; result: boolean };
  'task.cancelQueued': { params: TaskIdParams; result: boolean };

  // Session
  'session.resume': { params: SessionResumeParams; result: Task };

  // Permission
  'permission.respond': { params: PermissionRespondParams; result: void };

  // Storage — task persistence
  'storage.saveTask': { params: StorageSaveTaskParams; result: void };
  'storage.updateTaskStatus': { params: StorageUpdateTaskStatusParams; result: void };
  'storage.updateTaskSummary': { params: StorageUpdateTaskSummaryParams; result: void };
  'storage.addTaskMessage': { params: StorageAddTaskMessageParams; result: void };

  // Scheduling
  'task.schedule': { params: TaskScheduleParams; result: ScheduledTask };
  'task.listScheduled': { params: undefined; result: ScheduledTask[] };
  'task.cancelScheduled': { params: TaskCancelScheduledParams; result: void };

  // Health
  'daemon.ping': { params: undefined; result: { status: 'ok'; uptime: number } };

  // Extended task methods used by the standalone daemon process
  'task.stop': { params: TaskIdParams; result: void };
  'task.status': {
    params: TaskIdParams;
    result: {
      taskId: string;
      status: import('./task.js').TaskStatus;
      prompt: string;
      createdAt: string;
    } | null;
  };
  'health.check': { params: undefined; result: HealthCheckResult };
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
  'permission.request': { taskId: string; request: PermissionRequest };
  'todo.update': { taskId: string; todos: TodoItem[] };
  'thought.event': ThoughtEvent;
  'checkpoint.event': CheckpointEvent;
  // Extended notifications used by the standalone daemon process
  'task.thought': ThoughtEvent;
  'task.checkpoint': CheckpointEvent;
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
