import type { BrowserWindow } from 'electron';
import type { TaskMessage, TaskResult, TaskStatus, TodoItem } from '@accomplish_ai/agent-core';
import { mapResultToStatus } from '@accomplish_ai/agent-core';
import { getTaskManager, recoverDevBrowserServer } from '../opencode';
import type { TaskCallbacks } from '../opencode';
import { getStorage } from '../store/storage';

const DEV_BROWSER_TOOL_PREFIXES = ['dev-browser-mcp_', 'dev_browser_mcp_', 'browser_'];
const BROWSER_FAILURE_WINDOW_MS = 12000;
const BROWSER_FAILURE_THRESHOLD = 2;
const BROWSER_CONNECTION_ERROR_PATTERNS = [
  /fetch failed/i,
  /\bECONNREFUSED\b/i,
  /\bECONNRESET\b/i,
  /\bUND_ERR\b/i,
  /socket hang up/i,
  /\bwebsocket\b/i,
  /browserType\.connectOverCDP/i,
  /Target closed/i,
  /Session closed/i,
  /Page closed/i,
];

function isDevBrowserToolCall(toolName: string): boolean {
  return DEV_BROWSER_TOOL_PREFIXES.some((prefix) => toolName.startsWith(prefix));
}

function isBrowserConnectionFailure(output: string): boolean {
  // Guard against false positives from successful outputs that mention words
  // like "WebSocket" while not being an actual error.
  const isExplicitErrorOutput = /^\s*Error:/i.test(output) || /"isError"\s*:\s*true/.test(output);
  if (!isExplicitErrorOutput) {
    return false;
  }

  return BROWSER_CONNECTION_ERROR_PATTERNS.some((pattern) => pattern.test(output));
}

export interface TaskCallbacksOptions {
  taskId: string;
  window: BrowserWindow;
  sender: Electron.WebContents;
}

export function createTaskCallbacks(options: TaskCallbacksOptions): TaskCallbacks {
  const { taskId, window, sender } = options;

  const storage = getStorage();
  const taskManager = getTaskManager();
  let browserFailureCount = 0;
  let browserFailureWindowStart = 0;
  let browserRecoveryInFlight = false;
  let hasRendererSendFailure = false;

  const forwardToRenderer = (channel: string, data: unknown) => {
    if (hasRendererSendFailure) {
      return;
    }
    if (window.isDestroyed() || sender.isDestroyed()) {
      return;
    }
    try {
      sender.send(channel, data);
    } catch (error) {
      hasRendererSendFailure = true;
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[TaskCallbacks] Failed to send IPC event to renderer', {
        taskId,
        channel,
        error: errorMessage,
      });
    }
  };

  const resetBrowserFailureState = () => {
    browserFailureCount = 0;
    browserFailureWindowStart = 0;
  };

  return {
    onBatchedMessages: (messages: TaskMessage[]) => {
      forwardToRenderer('task:update:batch', { taskId, messages });
      for (const msg of messages) {
        storage.addTaskMessage(taskId, msg);
      }
    },

    onProgress: (progress: { stage: string; message?: string }) => {
      forwardToRenderer('task:progress', {
        taskId,
        ...progress,
      });
    },

    onPermissionRequest: (request: unknown) => {
      forwardToRenderer('permission:request', request);
    },

    onComplete: (result: TaskResult) => {
      forwardToRenderer('task:update', {
        taskId,
        type: 'complete',
        result,
      });

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
      forwardToRenderer('task:update', {
        taskId,
        type: 'error',
        error: error.message,
      });

      storage.updateTaskStatus(taskId, 'failed', new Date().toISOString());
    },

    onDebug: (log: { type: string; message: string; data?: unknown }) => {
      if (storage.getDebugMode()) {
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
      storage.updateTaskStatus(taskId, status, new Date().toISOString());
    },

    onTodoUpdate: (todos: TodoItem[]) => {
      storage.saveTodosForTask(taskId, todos);
      forwardToRenderer('todo:update', { taskId, todos });
    },

    onAuthError: (error: { providerId: string; message: string }) => {
      forwardToRenderer('auth:error', error);
    },

    onToolCallComplete: ({ toolName, toolOutput }) => {
      if (!isDevBrowserToolCall(toolName)) {
        return;
      }

      if (!isBrowserConnectionFailure(toolOutput)) {
        resetBrowserFailureState();
        return;
      }

      const now = Date.now();
      if (
        browserFailureWindowStart === 0 ||
        now - browserFailureWindowStart > BROWSER_FAILURE_WINDOW_MS
      ) {
        browserFailureWindowStart = now;
        browserFailureCount = 1;
      } else {
        browserFailureCount += 1;
      }

      if (browserFailureCount < BROWSER_FAILURE_THRESHOLD || browserRecoveryInFlight) {
        return;
      }

      browserRecoveryInFlight = true;
      const reason = `Detected repeated browser connection failures (${browserFailureCount} in ${Math.ceil(
        (now - browserFailureWindowStart) / 1000,
      )}s). Reconnecting browser...`;

      console.warn(`[TaskCallbacks] ${reason}`);

      void recoverDevBrowserServer(
        {
          onProgress: (progress) => {
            forwardToRenderer('task:progress', {
              taskId,
              ...progress,
            });
          },
        },
        { reason },
      )
        .catch((error) => {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.warn('[TaskCallbacks] Browser recovery failed:', errorMessage);
          if (storage.getDebugMode()) {
            forwardToRenderer('debug:log', {
              taskId,
              timestamp: new Date().toISOString(),
              type: 'warning',
              message: `Browser recovery failed: ${errorMessage}`,
            });
          }
        })
        .finally(() => {
          browserRecoveryInFlight = false;
          resetBrowserFailureState();
        });
    },
  };
}
