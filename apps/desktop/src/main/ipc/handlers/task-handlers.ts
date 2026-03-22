import { BrowserWindow } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import {
  sanitizeString,
  generateTaskSummary,
  validateTaskConfig,
  createTaskId,
  createMessageId,
} from '@accomplish_ai/agent-core';
import type {
  TaskConfig,
  PermissionResponse,
  TaskMessage,
  FileAttachmentInfo,
} from '@accomplish_ai/agent-core';
import { getApiKey } from '../../store/secureStorage';
import { getStorage } from '../../store/storage';
import { getTaskManager } from '../../opencode';
import {
  startPermissionApiServer,
  startQuestionApiServer,
  initPermissionApi,
  resolvePermission,
  resolveQuestion,
  isFilePermissionRequest,
  isQuestionRequest,
} from '../../permission-api';
import {
  isMockTaskEventsEnabled,
  createMockTask,
  executeMockTaskFlow,
  detectScenarioFromPrompt,
} from '../../test-utils/mock-task-flow';
import * as workspaceManager from '../../store/workspaceManager';
import { permissionResponseSchema, validate } from '../../ipc/validation';
import { createTaskCallbacks } from '../../ipc/task-callbacks';
import { handle, assertTrustedWindow } from './utils';

export function registerTaskHandlers(): void {
  const storage = getStorage();
  const taskManager = getTaskManager();

  let permissionApiInitialized = false;

  handle('task:start', async (event: IpcMainInvokeEvent, config: TaskConfig) => {
    const window = assertTrustedWindow(BrowserWindow.fromWebContents(event.sender));
    const sender = event.sender;
    const validatedConfig = validateTaskConfig(config);

    if (!isMockTaskEventsEnabled() && !storage.hasReadyProvider()) {
      throw new Error(
        'No provider is ready. Please connect a provider and select a model in Settings.',
      );
    }

    if (!permissionApiInitialized) {
      // Set the flag before starting to prevent concurrent initialization attempts
      // on overlapping task:start calls, while still ensuring init only runs once.
      // The flag is set inside a microtask after listen() fires to avoid a race
      // where subsequent calls see the flag as true before the port is open.
      permissionApiInitialized = true;
      initPermissionApi(window, () => taskManager.getActiveTaskId());
      const permServer = startPermissionApiServer();
      const questionServer = startQuestionApiServer();
      // Await actual server readiness so the flag is only true once ports are bound
      await Promise.all([
        new Promise<void>((resolve) => permServer.once('listening', resolve)),
        new Promise<void>((resolve) => questionServer.once('listening', resolve)),
      ]).catch(() => {
        // Servers may already be listening (EADDRINUSE handled internally); proceed
      });
    }

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

    const callbacks = createTaskCallbacks({
      taskId,
      window,
      sender,
    });

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
    if (!taskId) return;

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
    if (!taskId) return;

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

  handle('permission:respond', async (_event: IpcMainInvokeEvent, response: PermissionResponse) => {
    const parsedResponse = validate(permissionResponseSchema, response);
    const { taskId, decision, requestId } = parsedResponse;

    if (requestId && isFilePermissionRequest(requestId)) {
      const allowed = decision === 'allow';
      const resolved = resolvePermission(requestId, allowed);
      if (resolved) {
        return;
      }
      console.warn(`[IPC] File permission request ${requestId} not found in pending requests`);
      return;
    }

    if (requestId && isQuestionRequest(requestId)) {
      const denied = decision === 'deny';
      const resolved = resolveQuestion(requestId, {
        selectedOptions: parsedResponse.selectedOptions,
        customText: parsedResponse.customText,
        denied,
      });
      if (resolved) {
        return;
      }
      console.warn(`[IPC] Question request ${requestId} not found in pending requests`);
      return;
    }

    if (!taskManager.hasActiveTask(taskId)) {
      console.warn(`[IPC] Permission response for inactive task ${taskId}`);
      return;
    }

    if (decision === 'allow') {
      const message = parsedResponse.selectedOptions?.join(', ') || parsedResponse.message || 'yes';
      const sanitizedMessage = sanitizeString(message, 'permissionResponse', 1024);
      await taskManager.sendResponse(taskId, sanitizedMessage);
    } else {
      await taskManager.sendResponse(taskId, 'no');
    }
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

      const taskId = validatedExistingTaskId || createTaskId();

      if (validatedExistingTaskId) {
        const userMessage: TaskMessage = {
          id: createMessageId(),
          type: 'user',
          content: validatedPrompt,
          timestamp: new Date().toISOString(),
        };
        storage.addTaskMessage(validatedExistingTaskId, userMessage);
      }

      const activeModelForResume = storage.getActiveProviderModel();
      const selectedModelForResume = activeModelForResume || storage.getSelectedModel();

      const callbacks = createTaskCallbacks({
        taskId,
        window,
        sender,
      });

      const task = await taskManager.startTask(
        taskId,
        {
          prompt: validatedPrompt,
          sessionId: validatedSessionId,
          taskId,
          modelId: selectedModelForResume?.model,
          files: attachments,
        },
        callbacks,
      );

      if (validatedExistingTaskId) {
        storage.updateTaskStatus(validatedExistingTaskId, task.status, new Date().toISOString());
      }

      return task;
    },
  );
}
