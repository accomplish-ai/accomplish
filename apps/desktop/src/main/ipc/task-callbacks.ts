import type { BrowserWindow } from 'electron';
import type {
  OpenCodeMessage,
  TaskMessage,
  TaskResult,
  TaskStatus,
  TodoItem,
} from '@accomplish/agent-core';
import {
  updateTaskStatus,
  updateTaskSessionId,
  addTaskMessage,
  saveTodosForTask,
  clearTodosForTask,
  getDebugMode,
  mapResultToStatus,
} from '@accomplish/agent-core';
import { getTaskManager } from '../opencode';
import type { TaskCallbacks } from '../opencode';

export interface TaskCallbacksOptions {
  taskId: string;
  window: BrowserWindow;
  sender: Electron.WebContents;
  toTaskMessage: (message: OpenCodeMessage) => TaskMessage | null;
  queueMessage: (
    taskId: string,
    message: TaskMessage,
    forwardToRenderer: (channel: string, data: unknown) => void,
    addTaskMessageFn: (taskId: string, message: TaskMessage) => void
  ) => void;
  flushAndCleanupBatcher: (taskId: string) => void;
}

export function createTaskCallbacks(options: TaskCallbacksOptions): TaskCallbacks {
  const {
    taskId,
    window,
    sender,
    toTaskMessage,
    queueMessage,
    flushAndCleanupBatcher,
  } = options;

  const taskManager = getTaskManager();

  const forwardToRenderer = (channel: string, data: unknown) => {
    if (!window.isDestroyed() && !sender.isDestroyed()) {
      sender.send(channel, data);
    }
  };

  return {
    onMessage: (message: OpenCodeMessage) => {
      const taskMessage = toTaskMessage(message);
      if (!taskMessage) return;

      queueMessage(taskId, taskMessage, forwardToRenderer, addTaskMessage);
    },

    onProgress: (progress: { stage: string; message?: string }) => {
      forwardToRenderer('task:progress', {
        taskId,
        ...progress,
      });
    },

    onPermissionRequest: (request: unknown) => {
      flushAndCleanupBatcher(taskId);
      forwardToRenderer('permission:request', request);
    },

    onComplete: (result: TaskResult) => {
      flushAndCleanupBatcher(taskId);

      forwardToRenderer('task:update', {
        taskId,
        type: 'complete',
        result,
      });

      const taskStatus = mapResultToStatus(result);
      updateTaskStatus(taskId, taskStatus, new Date().toISOString());

      const sessionId = result.sessionId || taskManager.getSessionId(taskId);
      if (sessionId) {
        updateTaskSessionId(taskId, sessionId);
      }

      if (result.status === 'success') {
        clearTodosForTask(taskId);
      }
    },

    onError: (error: Error) => {
      flushAndCleanupBatcher(taskId);

      forwardToRenderer('task:update', {
        taskId,
        type: 'error',
        error: error.message,
      });

      updateTaskStatus(taskId, 'failed', new Date().toISOString());
    },

    onDebug: (log: { type: string; message: string; data?: unknown }) => {
      if (getDebugMode()) {
        forwardToRenderer('debug:log', {
          taskId,
          timestamp: new Date().toISOString(),
          ...log,
        });
      }
    },

    onStatusChange: (status: TaskStatus) => {
      forwardToRenderer('task:status-change', {
        taskId,
        status,
      });
      updateTaskStatus(taskId, status, new Date().toISOString());
    },

    onTodoUpdate: (todos: TodoItem[]) => {
      saveTodosForTask(taskId, todos);
      forwardToRenderer('todo:update', { taskId, todos });
    },

    onAuthError: (error: { providerId: string; message: string }) => {
      forwardToRenderer('auth:error', error);
    },
  };
}
