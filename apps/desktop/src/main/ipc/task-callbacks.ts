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
import { translateFromEnglish, clearTaskLanguage } from '../services/translationService';
import { getLanguage as getI18nLanguage } from '../i18n';

// Human-readable tool display names per language.
// Known tools get curated labels; unknown tools are translated dynamically via the translation service.
const TOOL_DISPLAY_NAMES: Record<string, Record<string, string>> = {
  en: {
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
  },
  'zh-CN': {
    invalid: '重试中...', Read: '读取文件', Glob: '查找文件', Grep: '搜索代码',
    Bash: '执行命令', Write: '写入文件', Edit: '编辑文件', Task: '运行智能体',
    WebFetch: '获取网页', WebSearch: '搜索网络',
    dev_browser_execute: '执行浏览器操作', browser_navigate: '正在导航',
    browser_snapshot: '正在读取页面', browser_click: '正在点击', browser_type: '正在输入',
    browser_screenshot: '正在截图', browser_evaluate: '正在运行脚本',
    browser_keyboard: '正在按键', browser_scroll: '正在滚动', browser_hover: '正在悬停',
    browser_select: '正在选择选项', browser_wait: '正在等待', browser_tabs: '正在管理标签页',
    browser_pages: '正在获取页面', browser_highlight: '正在高亮显示',
    browser_sequence: '浏览器序列', browser_file_upload: '正在上传文件',
    browser_drag: '正在拖拽', browser_get_text: '正在获取文本',
    browser_is_visible: '正在检查可见性', browser_is_enabled: '正在检查状态',
    browser_is_checked: '正在检查状态', browser_iframe: '正在切换框架',
    browser_canvas_type: '正在画布中输入', browser_script: '浏览器操作',
    request_file_permission: '正在请求权限', AskUserQuestion: '正在询问问题',
    complete_task: '正在完成任务', report_thought: '正在思考',
    report_checkpoint: '检查点', todowrite: '规划任务', discard: '更新任务',
  },
};

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

function humanizeToolName(name: string): string {
  const base = getBaseToolName(name);
  return base.charAt(0).toUpperCase() + base.slice(1).replace(/_/g, ' ');
}

function getToolDisplayName(toolName: string, language: string): string | null {
  const langMap = TOOL_DISPLAY_NAMES[language] || TOOL_DISPLAY_NAMES['en'];
  // Try exact name first, then base name
  if (langMap[toolName]) return langMap[toolName];
  const base = getBaseToolName(toolName);
  if (base !== toolName && langMap[base]) return langMap[base];
  return null;
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

  const forwardToRenderer = (channel: string, data: unknown) => {
    if (!window.isDestroyed() && !sender.isDestroyed()) {
      sender.send(channel, data);
    }
  };

  return {
    onBatchedMessages: (messages: TaskMessage[]) => {
      const language = getI18nLanguage();
      const translations: Promise<void>[] = [];

      for (const msg of messages) {
        // Translate assistant message content
        if (language !== 'en' && msg.type === 'assistant' && msg.content) {
          translations.push(
            translateFromEnglish(msg.content, language)
              .then((t) => { msg.content = t; })
              .catch(() => {})
          );
        }

        // Resolve tool display names and translate descriptions
        if (msg.type === 'tool') {
          const input = (msg.toolInput || {}) as Record<string, unknown>;
          if (msg.toolName) {
            const displayName = getToolDisplayName(msg.toolName, language);
            if (displayName) {
              input._translatedToolName = displayName;
            } else if (language !== 'en') {
              const humanized = humanizeToolName(msg.toolName);
              translations.push(
                translateFromEnglish(humanized, language)
                  .then((t) => { input._translatedToolName = t; })
                  .catch(() => { input._translatedToolName = humanized; })
              );
            } else {
              input._translatedToolName = humanizeToolName(msg.toolName);
            }
          }
          if (language !== 'en' && typeof input.description === 'string') {
            translations.push(
              translateFromEnglish(input.description, language)
                .then((t) => { input.description = t; })
                .catch(() => {})
            );
          }
          msg.toolInput = input;
        }
      }

      if (translations.length > 0) {
        Promise.all(translations).then(() => {
          forwardToRenderer('task:update:batch', { taskId, messages });
          for (const msg of messages) {
            storage.addTaskMessage(taskId, msg);
          }
        });
        return;
      }

      forwardToRenderer('task:update:batch', { taskId, messages });
      for (const msg of messages) {
        storage.addTaskMessage(taskId, msg);
      }
    },

    onProgress: (progress: { stage: string; message?: string }) => {
      const language = getI18nLanguage();
      if (language !== 'en' && progress.message) {
        translateFromEnglish(progress.message, language)
          .then((translated) => {
            forwardToRenderer('task:progress', { taskId, ...progress, message: translated });
          })
          .catch(() => {
            forwardToRenderer('task:progress', { taskId, ...progress });
          });
        return;
      }
      forwardToRenderer('task:progress', {
        taskId,
        ...progress,
      });
    },

    onPermissionRequest: (request: unknown) => {
      const language = getI18nLanguage();
      const req = request as Record<string, unknown>;

      if (language !== 'en' && req.type === 'question') {
        const translations: Promise<void>[] = [];
        const translated = { ...req };

        if (typeof req.header === 'string') {
          translations.push(
            translateFromEnglish(req.header, language)
              .then((t) => { translated.header = t; })
              .catch(() => {})
          );
        }

        if (typeof req.question === 'string') {
          translations.push(
            translateFromEnglish(req.question, language)
              .then((t) => { translated.question = t; })
              .catch(() => {})
          );
        }

        if (Array.isArray(req.options)) {
          const translatedOptions = (req.options as Array<{ label: string; description?: string }>).map((opt) => ({ ...opt }));
          translated.options = translatedOptions;

          for (const opt of translatedOptions) {
            translations.push(
              translateFromEnglish(opt.label, language)
                .then((t) => { opt.label = t; })
                .catch(() => {})
            );
            if (opt.description) {
              translations.push(
                translateFromEnglish(opt.description, language)
                  .then((t) => { opt.description = t; })
                  .catch(() => {})
              );
            }
          }
        }

        Promise.all(translations).then(() => {
          forwardToRenderer('permission:request', translated);
        });
        return;
      }

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

      clearTaskLanguage(taskId);
    },

    onError: (error: Error) => {
      forwardToRenderer('task:update', {
        taskId,
        type: 'error',
        error: error.message,
      });

      storage.updateTaskStatus(taskId, 'failed', new Date().toISOString());
      clearTaskLanguage(taskId);
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
