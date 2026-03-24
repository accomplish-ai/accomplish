/**
 * Daemon In-Process Callbacks
 *
 * Builds task lifecycle callbacks that forward events back through the in-process DaemonServer.
 */

import { DaemonServer, mapResultToStatus } from '@accomplish_ai/agent-core';
import type {
  TaskCallbacks,
  TaskMessage,
  TaskResult,
  TaskStatus,
  StorageAPI,
} from '@accomplish_ai/agent-core';
import { getLogCollector } from '../logging';

/**
 * Build task lifecycle callbacks that forward events back through the in-process DaemonServer.
 */
export function buildInProcessCallbacks(
  taskId: string,
  srv: DaemonServer,
  storage: StorageAPI,
): TaskCallbacks {
  return {
    onBatchedMessages: (messages: TaskMessage[]) => {
      for (const msg of messages) {
        storage.addTaskMessage(taskId, msg);
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      srv.notify('task.message' as any, { taskId, messages });
    },
    onProgress: (progress) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      srv.notify('task.progress' as any, { taskId, ...progress });
    },
    onPermissionRequest: (request) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      srv.notify('permission.request' as any, request);
    },
    onComplete: (result: TaskResult) => {
      const taskStatus = mapResultToStatus(result);
      storage.updateTaskStatus(taskId, taskStatus, new Date().toISOString());
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      srv.notify('task.complete' as any, { taskId, result });
    },
    onError: (error: Error) => {
      storage.updateTaskStatus(taskId, 'failed', new Date().toISOString());
      getLogCollector().logEnv('ERROR', `[DaemonBootstrap] Task ${taskId} error`, {
        error: error.message,
      });
    },
    onStatusChange: (status: TaskStatus) => {
      storage.updateTaskStatus(taskId, status, new Date().toISOString());
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      srv.notify('task.statusChange' as any, { taskId, status });
    },
  };
}
