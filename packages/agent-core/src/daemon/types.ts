import type { Task, TaskMessage, TaskResult } from '../common/types/task.js';
import type { PermissionRequest } from '../common/types/permission.js';
import type { DaemonMethodMap, DaemonMethod } from '../common/types/daemon.js';

// =============================================================================
// JSON-RPC 2.0 Base Types
// =============================================================================

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: unknown;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: JsonRpcError;
}

export interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

// =============================================================================
// JSON-RPC 2.0 Standard Error Codes
// =============================================================================

export const RPC_ERROR_CODES = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
} as const;

// =============================================================================
// RPC Method Definitions
// =============================================================================

export interface TaskStartParams {
  prompt: string;
  taskId?: string;
  modelId?: string;
  sessionId?: string;
  workingDirectory?: string;
  workspaceId?: string;
  attachments?: import('../common/types/task.js').FileAttachmentInfo[];
  allowedTools?: string[];
  systemPromptAppend?: string;
  outputSchema?: object;
}

export interface TaskStopParams {
  taskId: string;
}

export interface TaskInterruptParams {
  taskId: string;
}

export interface TaskGetParams {
  taskId: string;
}

export interface TaskDeleteParams {
  taskId: string;
}

export interface TaskGetTodosParams {
  taskId: string;
}

export interface TaskStatusParams {
  taskId: string;
}

// PermissionRespondParams and SessionResumeParams are defined in
// common/types/daemon.ts (the canonical RPC contract). Removed local
// duplicates to avoid drift.

export interface HealthCheckResult {
  version: string;
  uptime: number;
  activeTasks: number;
  memoryUsage?: number;
}

export interface TaskStatusResult {
  taskId: string;
  status: Task['status'];
  prompt: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  result?: TaskResult;
}

// =============================================================================
// RPC Method Map (method name -> params/result types)
// =============================================================================

/**
 * RpcMethodMap is the canonical source of truth for daemon RPC methods.
 * It is kept in sync with DaemonMethodMap from common/types/daemon.ts.
 * Both types are aliases of each other to prevent divergence.
 */
export type RpcMethodMap = DaemonMethodMap;

export type RpcMethod = DaemonMethod;

// =============================================================================
// Server-Sent Notification Types
// =============================================================================

export interface TaskProgressNotification {
  taskId: string;
  stage: string;
  message?: string;
}

export interface TaskMessageNotification {
  taskId: string;
  messages: TaskMessage[];
}

export interface TaskCompleteNotification {
  taskId: string;
  result: TaskResult;
}

export interface TaskErrorNotification {
  taskId: string;
  error: string;
}

export interface TaskSummaryNotification {
  taskId: string;
  summary: string;
}

export interface TaskStatusChangeNotification {
  taskId: string;
  status: Task['status'];
}

export interface RpcNotificationMap {
  'task.progress': TaskProgressNotification;
  'task.message': TaskMessageNotification;
  'task.complete': TaskCompleteNotification;
  'task.error': TaskErrorNotification;
  'task.thought': Record<string, unknown>;
  'task.checkpoint': Record<string, unknown>;
  'task.summary': TaskSummaryNotification;
  'task.statusChange': TaskStatusChangeNotification;
  'permission.request': PermissionRequest;
}

export type RpcNotificationType = keyof RpcNotificationMap;

// =============================================================================
// Type Guards
// =============================================================================

export function isJsonRpcRequest(msg: unknown): msg is JsonRpcRequest {
  if (typeof msg !== 'object' || msg === null) {
    return false;
  }
  const obj = msg as Record<string, unknown>;
  return (
    obj.jsonrpc === '2.0' &&
    (typeof obj.id === 'string' || typeof obj.id === 'number') &&
    typeof obj.method === 'string'
  );
}

export function isJsonRpcNotification(msg: unknown): msg is JsonRpcNotification {
  if (typeof msg !== 'object' || msg === null) {
    return false;
  }
  const obj = msg as Record<string, unknown>;
  return obj.jsonrpc === '2.0' && !('id' in obj) && typeof obj.method === 'string';
}
