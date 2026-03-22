import { BrowserWindow } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import {
  sanitizeString,
  generateTaskSummary,
  validateTaskConfig,
  createTaskId,
  createMessageId,
  type TaskConfig,
  type TaskMessage,
  type FileAttachmentInfo,
} from '@accomplish_ai/agent-core';
import { getApiKey } from '../../store/secureStorage';
import { getStorage } from '../../store/storage';
import { getTaskManager } from '../../opencode';
import {
  isMockTaskEventsEnabled,
  createMockTask,
  executeMockTaskFlow,
  detectScenarioFromPrompt,
} from '../../test-utils/mock-task-flow';
import * as workspaceManager from '../../store/workspaceManager';
import { createTaskCallbacks } from '../../ipc/task-callbacks';
import { handle, assertTrustedWindow } from './utils';
import { registerPermissionHandlers } from './permission-ipc';
import { sanitizeAttachments } from './attachment-utils';

export function registerTaskHandlers(): void {
  const storage = getStorage();
  const taskManager = getTaskManager();
  const ensurePermissionApiInitialized = registerPermissionHandlers(taskManager);

  handle('task:start', async (event: IpcMainInvokeEvent, config: TaskConfig) => {
    const window = assertTrustedWindow(BrowserWindow.fromWebContents(event.sender));
    const sender = event.sender;
    const validatedConfig = validateTaskConfig(config);

    if (!isMockTaskEventsEnabled() && !storage.hasReadyProvider()) {
      throw new Error(
        'No provider is ready. Please connect a provider and select a model in Settings.',
      );
    }

    await ensurePermissionApiInitialized(window, () => taskManager.getActiveTaskId());

    const taskId = createTaskId();

    if (isMockTaskEventsEnabled()) {
      const mockTask = createMockTask(taskId, validatedConfig.prompt);
      const scenario = detectScenarioFromPrompt(validatedConfig.prompt);
      storage.saveTask(mockTask, workspaceManager.getActiveWorkspace());
      void executeMockTaskFlow(window, {
        taskId,
        prompt: validatedConfig.prompt,
        scenario,
        delayMs: 50,
      });
      return mockTask;
    }

    const activeModel = storage.getActiveProviderModel();
    const selectedModel = activeModel || storage.getSelectedModel();
    if (selectedModel?.model) {
      validatedConfig.modelId = selectedModel.model;
    }

    const callbacks = createTaskCallbacks({ taskId, window, sender });
    const task = await taskManager.startTask(taskId, validatedConfig, callbacks);

    const initialUserMessage: TaskMessage = {
      id: createMessageId(),
      type: 'user',
      content: validatedConfig.prompt,
      timestamp: new Date().toISOString(),
    };
    task.messages = [initialUserMessage];
    storage.saveTask(task, workspaceManager.getActiveWorkspace());

    generateTaskSummary(validatedConfig.prompt, getApiKey)
      .then((summary) => {
        storage.updateTaskSummary(taskId, summary);
        if (!window.isDestroyed() && !sender.isDestroyed()) {
          sender.send('task:summary', { taskId, summary });
        }
      })
      .catch((err) => {
        console.warn('[IPC] Failed to generate task summary:', err);
      });

    return task;
  });

  handle('task:cancel', async (_event: IpcMainInvokeEvent, taskId?: string) => {
    if (!taskId) {
      return;
    }
    if (taskManager.isTaskQueued(taskId)) {
      taskManager.cancelQueuedTask(taskId);
      storage.updateTaskStatus(taskId, 'cancelled', new Date().toISOString());
      return;
    }
    if (taskManager.hasActiveTask(taskId)) {
      await taskManager.cancelTask(taskId);
      storage.updateTaskStatus(taskId, 'cancelled', new Date().toISOString());
    }
  });

  handle('task:interrupt', async (_event: IpcMainInvokeEvent, taskId?: string) => {
    if (!taskId) {
      return;
    }
    if (taskManager.hasActiveTask(taskId)) {
      await taskManager.interruptTask(taskId);
    }
  });

  handle('task:get', async (_event: IpcMainInvokeEvent, taskId: string) => {
    return storage.getTask(taskId) || null;
  });

  handle('task:list', async (_event: IpcMainInvokeEvent) => {
    return storage.getTasks(workspaceManager.getActiveWorkspace());
  });

  handle('task:delete', async (_event: IpcMainInvokeEvent, taskId: string) => {
    storage.deleteTask(taskId);
  });

  handle('task:clear-history', async (_event: IpcMainInvokeEvent) => {
    storage.clearHistory();
  });

  handle('task:get-todos', async (_event: IpcMainInvokeEvent, taskId: string) => {
    return storage.getTodosForTask(taskId);
  });

  handle(
    'session:resume',
    async (
      event: IpcMainInvokeEvent,
      sessionId: string,
      prompt: string,
      existingTaskId?: string,
      attachments?: FileAttachmentInfo[],
    ) => {
      const window = assertTrustedWindow(BrowserWindow.fromWebContents(event.sender));
      const sender = event.sender;
      const validatedSessionId = sanitizeString(sessionId, 'sessionId', 128);
      const validatedPrompt = sanitizeString(prompt, 'prompt');
      const validatedExistingTaskId = existingTaskId
        ? sanitizeString(existingTaskId, 'taskId', 128)
        : undefined;

      if (!isMockTaskEventsEnabled() && !storage.hasReadyProvider()) {
        throw new Error(
          'No provider is ready. Please connect a provider and select a model in Settings.',
        );
      }

      await ensurePermissionApiInitialized(window, () => taskManager.getActiveTaskId());

      const taskId = validatedExistingTaskId || createTaskId();
      const sanitizedAttachments = sanitizeAttachments(attachments as unknown[] | undefined);

      const activeModelForResume = storage.getActiveProviderModel();
      const selectedModelForResume = activeModelForResume || storage.getSelectedModel();
      const callbacks = createTaskCallbacks({ taskId, window, sender });

      const userMessage: TaskMessage = {
        id: createMessageId(),
        type: 'user',
        content: validatedPrompt,
        timestamp: new Date().toISOString(),
      };

      const task = await taskManager.startTask(
        taskId,
        {
          prompt: validatedPrompt,
          sessionId: validatedSessionId,
          taskId,
          modelId: selectedModelForResume?.model,
          files: sanitizedAttachments,
        },
        callbacks,
      );

      if (validatedExistingTaskId) {
        storage.addTaskMessage(validatedExistingTaskId, userMessage);
        storage.updateTaskStatus(validatedExistingTaskId, task.status, new Date().toISOString());
      } else {
        // New task created by session:resume — persist it so it appears in task history.
        task.messages = [userMessage];
        storage.saveTask(task, workspaceManager.getActiveWorkspace());
      }

      return task;
    },
  );
}
