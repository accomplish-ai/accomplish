/**
 * Task callback factory for TaskService.
 * Extracted from task-config-builder.ts to keep that file under 200 lines.
 *
 * NO electron imports — this runs as plain Node.js.
 */
import type { EventEmitter } from 'node:events';
import {
  mapResultToStatus,
  type TaskCallbacks,
  type TaskMessage,
  type TaskResult,
  type TaskStatus,
  type StorageAPI,
  type TaskManagerAPI,
} from '@accomplish_ai/agent-core';

export function createTaskCallbacks(
  taskId: string,
  emitter: EventEmitter,
  storage: StorageAPI,
  taskManager: TaskManagerAPI,
): TaskCallbacks {
  return {
    onBatchedMessages: (messages: TaskMessage[]) => {
      emitter.emit('message', { taskId, messages });
      for (const msg of messages) {
        storage.addTaskMessage(taskId, msg);
      }
    },
    onProgress: (progress) => {
      emitter.emit('progress', { taskId, ...progress });
    },
    onPermissionRequest: (request) => {
      emitter.emit('permission', request);
    },
    onComplete: (result: TaskResult) => {
      emitter.emit('complete', { taskId, result });
      const taskStatus = mapResultToStatus(result);
      storage.updateTaskStatus(taskId, taskStatus, new Date().toISOString());
      const sessionId = result.sessionId || taskManager.getSessionId(taskId);
      if (sessionId) {
        storage.updateTaskSessionId(taskId, sessionId);
      }
      if (result.status === 'success') {
        storage.clearTodosForTask(taskId);
      }
    },
    onError: (error: Error) => {
      emitter.emit('error', { taskId, error: error.message });
      storage.updateTaskStatus(taskId, 'failed', new Date().toISOString());
    },
    onStatusChange: (status: TaskStatus) => {
      emitter.emit('statusChange', { taskId, status });
      storage.updateTaskStatus(taskId, status, new Date().toISOString());
    },
    onTodoUpdate: (todos) => {
      storage.saveTodosForTask(taskId, todos);
    },
  };
}
