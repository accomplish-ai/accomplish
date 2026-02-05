/**
 * Task mappers for converting between internal and public DTO types.
 *
 * These mappers ensure internal implementation state never leaks to
 * external consumers. Always use these when sending task data to:
 * - The renderer process (UI)
 * - External API consumers
 * - Serialization (JSON, IPC, etc.)
 */

import type { Task, TaskMessage, TaskProgress } from '../../common/types/task.js';
import type { TaskInternal, TaskProgressInternal } from '../types/task-internal.js';

/**
 * Converts an internal task to a public DTO.
 *
 * This strips all internal fields (prefixed with _) that should not
 * be exposed to external consumers.
 *
 * @param internal - The internal task with runtime state
 * @returns A clean DTO safe for external consumption
 *
 * @example
 * ```typescript
 * // In IPC handler
 * const internal = taskManager.getTaskInternal(taskId);
 * const dto = toTaskDTO(internal);
 * event.reply('task:get', dto);
 * ```
 */
export function toTaskDTO(internal: TaskInternal): Task {
  // Explicitly destructure to omit internal fields
  const {
    _config,
    _callbacks,
    _cleanup,
    _queuePosition,
    _abortController,
    _isFirstTask,
    _currentModelId,
    _createdAtDate,
    // Public fields
    id,
    prompt,
    summary,
    status,
    sessionId,
    messages,
    createdAt,
    startedAt,
    completedAt,
    result,
  } = internal;

  return {
    id,
    prompt,
    summary,
    status,
    sessionId,
    messages,
    createdAt,
    startedAt,
    completedAt,
    result,
  };
}

/**
 * Converts an array of internal tasks to public DTOs.
 *
 * @param internals - Array of internal tasks
 * @returns Array of clean DTOs
 */
export function toTaskDTOArray(internals: TaskInternal[]): Task[] {
  return internals.map(toTaskDTO);
}

/**
 * Converts internal progress to public TaskProgress DTO.
 *
 * @param internal - Internal progress event
 * @param taskId - Task ID to include in the DTO
 * @returns Public TaskProgress DTO
 */
export function toTaskProgressDTO(
  internal: TaskProgressInternal,
  taskId: string
): TaskProgress {
  return {
    taskId,
    stage: internal.stage as TaskProgress['stage'],
    message: internal.message,
    modelName: internal.modelName,
    isFirstTask: internal.isFirstTask,
  };
}

/**
 * Type guard to check if an object has internal task fields.
 *
 * Useful for debugging - helps identify if internal state is
 * accidentally being passed where a DTO is expected.
 *
 * @param obj - Object to check
 * @returns true if object has internal fields
 */
export function hasInternalFields(obj: unknown): obj is TaskInternal {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }

  const internalKeys = [
    '_config',
    '_callbacks',
    '_cleanup',
    '_queuePosition',
    '_abortController',
    '_isFirstTask',
    '_currentModelId',
    '_createdAtDate',
  ];

  return internalKeys.some((key) => key in obj);
}

/**
 * Strips internal fields from a task message if present.
 *
 * TaskMessage doesn't have internal fields currently,
 * but this provides a consistent pattern if needed in the future.
 *
 * @param message - Task message (internal or public)
 * @returns Clean TaskMessage DTO
 */
export function toTaskMessageDTO(message: TaskMessage): TaskMessage {
  // Currently TaskMessage has no internal fields
  // This function exists for consistency and future-proofing
  const { id, type, content, toolName, toolInput, timestamp, attachments } = message;

  return {
    id,
    type,
    content,
    toolName,
    toolInput,
    timestamp,
    attachments,
  };
}
