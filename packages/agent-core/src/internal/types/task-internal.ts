/**
 * Internal task type with runtime state that should never be exposed to external consumers.
 *
 * This module defines TaskInternal which extends the public Task DTO with fields
 * that are only needed during task execution in the main process.
 *
 * IMPORTANT: These types must NEVER be exported via common.ts or any public API.
 * Use the mappers in internal/mappers/ to convert to public DTOs before sending
 * to external consumers (UI, API clients, etc.).
 */

import type { Task, TaskConfig, TaskResult, TaskStatus } from '../../common/types/task.js';
import type { OpenCodeMessage } from '../../common/types/opencode.js';
import type { PermissionRequest } from '../../common/types/permission.js';
import type { TodoItem } from '../../common/types/todo.js';

/**
 * Callbacks for task lifecycle events.
 * These are internal event handlers that should never be serialized.
 */
export interface TaskCallbacksInternal {
  onMessage: (message: OpenCodeMessage) => void;
  onProgress: (progress: TaskProgressInternal) => void;
  onPermissionRequest: (request: PermissionRequest) => void;
  onComplete: (result: TaskResult) => void;
  onError: (error: Error) => void;
  onStatusChange?: (status: TaskStatus) => void;
  onDebug?: (log: { type: string; message: string; data?: unknown }) => void;
  onTodoUpdate?: (todos: TodoItem[]) => void;
  onAuthError?: (error: { providerId: string; message: string }) => void;
}

/**
 * Internal progress event with additional runtime state.
 */
export interface TaskProgressInternal {
  stage: string;
  message?: string;
  isFirstTask?: boolean;
  modelName?: string;
}

/**
 * Internal task representation with runtime state.
 *
 * This extends the public Task DTO with fields that are:
 * - Not serializable (process handles, timers, callbacks)
 * - Implementation details (queue position, state flags)
 * - Only needed by the main process during execution
 *
 * @example
 * ```typescript
 * // In main process - work with TaskInternal
 * const internal: TaskInternal = {
 *   ...task,
 *   _config: config,
 *   _callbacks: callbacks,
 *   _queuePosition: 0,
 * };
 *
 * // Before sending to renderer - convert to DTO
 * const dto = toTaskDTO(internal);
 * ```
 */
export interface TaskInternal extends Task {
  /**
   * Original task configuration.
   * Contains internal settings like allowedTools, systemPromptAppend.
   */
  _config?: TaskConfig;

  /**
   * Event callbacks for task lifecycle.
   * Not serializable - function references.
   */
  _callbacks?: TaskCallbacksInternal;

  /**
   * Cleanup function to dispose resources.
   * Not serializable - function reference.
   */
  _cleanup?: () => void;

  /**
   * Position in the task queue (0-indexed).
   * Only set when status is 'queued'.
   */
  _queuePosition?: number;

  /**
   * AbortController for cancelling the task.
   * Not serializable - contains abort signal.
   */
  _abortController?: AbortController;

  /**
   * Whether this is the first task in the session.
   * Used for startup UI hints.
   */
  _isFirstTask?: boolean;

  /**
   * Current model ID being used.
   * Internal tracking for progress events.
   */
  _currentModelId?: string;

  /**
   * Timestamp when the task was created internally.
   * More precise than the string createdAt field.
   */
  _createdAtDate?: Date;
}

/**
 * Managed task state maintained by TaskManager.
 * This is the full runtime state for an active task.
 */
export interface ManagedTaskInternal {
  taskId: string;

  /**
   * The adapter instance managing PTY execution.
   * This is the main process handle that must never be exposed.
   */
  adapter: unknown; // OpenCodeAdapter - using unknown to avoid circular deps

  /**
   * Event callbacks.
   */
  callbacks: TaskCallbacksInternal;

  /**
   * Cleanup function.
   */
  cleanup: () => void;

  /**
   * When this managed task was created.
   */
  createdAt: Date;
}

/**
 * Queued task state before execution.
 */
export interface QueuedTaskInternal {
  taskId: string;
  config: TaskConfig;
  callbacks: TaskCallbacksInternal;
  createdAt: Date;
}
