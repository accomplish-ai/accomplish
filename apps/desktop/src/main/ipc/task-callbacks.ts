import type { BrowserWindow } from 'electron';
import type {
  TaskMessage,
  TaskResult,
  TaskStatus,
  TodoItem,
} from '@accomplish_ai/agent-core';
import { mapResultToStatus } from '@accomplish_ai/agent-core';
import { getTaskManager } from '../opencode';
import type { TaskCallbacks } from '../opencode';
import { getStorage } from '../store/storage';

// Display labels shown in the UI when tools execute.
const TOOL_DISPLAY_NAMES: Record<string, string> = {
  invalid: 'Retrying...', Read: 'Reading files', Glob: 'Finding files', Grep: 'Searching code',
  Bash: 'Running command', Write: 'Writing file', Edit: 'Editing file', Task: 'Running agent',
  WebFetch: 'Fetching web page', WebSearch: 'Searching web',
  dev_browser_execute: 'Executing browser action', browser_navigate: 'Navigating',
  browser_snapshot: 'Reading page', browser_click: 'Clicking', browser_type: 'Typing',
  browser_screenshot: 'Taking screenshot', browser_evaluate: 'Running script',
  browser_keyboard: 'Pressing keys', browser_scroll: 'Scrolling', browser_hover: 'Hovering',
  browser_select: 'Selecting option', browser_wait: 'Waiting', browser_tabs: 'Managing tabs',
  browser_pages: 'Getting pages', browser_highlight: 'Highlighting',
  browser_sequence: 'Browser sequence', browser_file_upload: 'Uploading file',
  browser_drag: 'Dragging', browser_get_text: 'Getting text',
  browser_is_visible: 'Checking visibility', browser_is_enabled: 'Checking state',
  browser_is_checked: 'Checking state', browser_iframe: 'Switching frame',
  browser_canvas_type: 'Typing in canvas', browser_script: 'Browser Actions',
  request_file_permission: 'Requesting permission', AskUserQuestion: 'Asking question',
  complete_task: 'Completing task', report_thought: 'Thinking',
  report_checkpoint: 'Checkpoint', todowrite: 'Planning tasks', discard: 'Updating tasks',
};

/** Extract the base tool name by stripping MCP server prefixes (e.g. "server_Read" → "Read"). */
function getBaseToolName(toolName: string): string {
  let base = toolName;
  let idx = 0;
  while ((idx = toolName.indexOf('_', idx)) !== -1) {
    const candidate = toolName.substring(idx + 1);
    if (candidate.length >= 3) base = candidate;
    idx++;
  }
  return base;
}

/** Convert a snake_case tool name to a human-readable title (e.g. "read_file" → "Read file"). */
function humanizeToolName(name: string): string {
  const base = getBaseToolName(name);
  return base.charAt(0).toUpperCase() + base.slice(1).replace(/_/g, ' ');
}

/** Look up a display name for a tool, falling back to the base name lookup. */
function getToolDisplayName(toolName: string): string | null {
  // Try exact name first, then base name
  if (TOOL_DISPLAY_NAMES[toolName]) return TOOL_DISPLAY_NAMES[toolName];
  const base = getBaseToolName(toolName);
  if (base !== toolName && TOOL_DISPLAY_NAMES[base]) return TOOL_DISPLAY_NAMES[base];
  return null;
}

export interface TaskCallbacksOptions {
  taskId: string;
  window: BrowserWindow;
  sender: Electron.WebContents;
}

/** Create the set of callbacks that bridge OpenCode task events to the renderer via IPC. */
export function createTaskCallbacks(options: TaskCallbacksOptions): TaskCallbacks {
  const { taskId, window, sender } = options;

  const storage = getStorage();
  const taskManager = getTaskManager();

  const forwardToRenderer = (channel: string, data: unknown) => {
    if (!window.isDestroyed() && !sender.isDestroyed()) {
      sender.send(channel, data);
    }
  };

  return {
    onBatchedMessages: (messages: TaskMessage[]) => {
      for (const msg of messages) {
        if (msg.type === 'tool') {
          const input = (msg.toolInput || {}) as Record<string, unknown>;
          if (msg.toolName) {
            const displayName = getToolDisplayName(msg.toolName);
            input._toolDisplayName = displayName || humanizeToolName(msg.toolName);
          }
          msg.toolInput = input;
        }
      }

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
  };
}
