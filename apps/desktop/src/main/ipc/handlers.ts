import { ipcMain, BrowserWindow, shell, app, dialog } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import { URL } from 'url';
import fs from 'fs';
import {
  isOpenCodeCliInstalled,
  getOpenCodeCliVersion,
} from '../opencode/adapter';
import { getLogCollector } from '../logging';
import { getAzureEntraToken } from '../opencode/azure-token-manager';
import {
  getTaskManager,
  disposeTaskManager,
  type TaskCallbacks,
} from '../opencode/task-manager';
import {
  getTasks,
  getTask,
  saveTask,
  updateTaskStatus,
  updateTaskSessionId,
  updateTaskSummary,
  addTaskMessage,
  deleteTask,
  clearHistory,
} from '../store/taskHistory';
import { generateTaskSummary } from '../services/summarizer';
import {
  storeApiKey,
  getApiKey,
  deleteApiKey,
  getAllApiKeys,
  hasAnyApiKey,
  listStoredCredentials,
} from '../store/secureStorage';
import {
  getDebugMode,
  setDebugMode,
  getAppSettings,
  getOnboardingComplete,
  setOnboardingComplete,
  getSelectedModel,
  setSelectedModel,
  getOpenAiBaseUrl,
  setOpenAiBaseUrl,
  getOllamaConfig,
  setOllamaConfig,
  getLanguage,
  setLanguage,
  type UILanguage,
  getAzureFoundryConfig,
  setAzureFoundryConfig,
  getLiteLLMConfig,
  setLiteLLMConfig,
  getLMStudioConfig,
  setLMStudioConfig,
} from '../store/appSettings';
import {
  getProviderSettings,
  setActiveProvider,
  getConnectedProvider,
  setConnectedProvider,
  removeConnectedProvider,
  updateProviderModel,
  setProviderDebugMode,
  getProviderDebugMode,
  hasReadyProvider,
} from '../store/providerSettings';
import { getOpenAiOauthStatus, loginOpenAiWithChatGpt } from '../opencode/auth';
import type { ProviderId, ConnectedProvider, BedrockCredentials } from '@accomplish/shared';
import { getDesktopConfig } from '../config';
import {
  startPermissionApiServer,
  startQuestionApiServer,
  initPermissionApi,
  resolvePermission,
  resolveQuestion,
  isFilePermissionRequest,
  isQuestionRequest,
} from '../permission-api';
import {
  validateElevenLabsApiKey,
  transcribeAudio,
  isElevenLabsConfigured,
} from '../services/speechToText';
import type {
  TaskConfig,
  PermissionResponse,
  OpenCodeMessage,
  TaskMessage,
  TaskResult,
  TaskStatus,
  SelectedModel,
  OllamaConfig,
  AzureFoundryConfig,
  LiteLLMConfig,
  LMStudioConfig,
  ToolSupportStatus,
  TodoItem,
} from '@accomplish/shared';
import { DEFAULT_PROVIDERS } from '@accomplish/shared';
import {
  normalizeIpcError,
  permissionResponseSchema,
  resumeSessionSchema,
  taskConfigSchema,
  validate,
} from './validation';
import { BedrockClient, ListFoundationModelsCommand } from '@aws-sdk/client-bedrock';
import { fromIni } from '@aws-sdk/credential-providers';
import {
  isMockTaskEventsEnabled,
  createMockTask,
  executeMockTaskFlow,
  detectScenarioFromPrompt,
} from '../test-utils/mock-task-flow';
import {
  initializeI18n,
  getLanguage as getI18nLanguage,
  setLanguage as setI18nLanguage,
  getAllTranslations,
  SUPPORTED_LANGUAGES,
  t,
  type SupportedLanguage,
} from '../i18n';

const MAX_TEXT_LENGTH = 8000;
const ALLOWED_API_KEY_PROVIDERS = new Set(['anthropic', 'openai', 'openrouter', 'google', 'xai', 'deepseek', 'moonshot', 'zai', 'azure-foundry', 'custom', 'bedrock', 'litellm', 'minimax', 'lmstudio', 'elevenlabs']);
const API_KEY_VALIDATION_TIMEOUT_MS = 15000;

interface OllamaModel {
  id: string;
  displayName: string;
  size: number;
  toolSupport?: ToolSupportStatus;
}

/**
 * Fetch with timeout using AbortController
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

// Message batching configuration
const MESSAGE_BATCH_DELAY_MS = 50;

// Per-task message batching state
interface MessageBatcher {
  pendingMessages: TaskMessage[];
  timeout: NodeJS.Timeout | null;
  taskId: string;
  flush: () => void;
}

const messageBatchers = new Map<string, MessageBatcher>();

function createMessageBatcher(
  taskId: string,
  forwardToRenderer: (channel: string, data: unknown) => void,
  addTaskMessage: (taskId: string, message: TaskMessage) => void
): MessageBatcher {
  const batcher: MessageBatcher = {
    pendingMessages: [],
    timeout: null,
    taskId,
    flush: () => {
      if (batcher.pendingMessages.length === 0) return;

      // Send all pending messages in one IPC call
      forwardToRenderer('task:update:batch', {
        taskId,
        messages: batcher.pendingMessages,
      });

      // Also persist each message to history
      for (const msg of batcher.pendingMessages) {
        addTaskMessage(taskId, msg);
      }

      batcher.pendingMessages = [];
      if (batcher.timeout) {
        clearTimeout(batcher.timeout);
        batcher.timeout = null;
      }
    },
  };

  messageBatchers.set(taskId, batcher);
  return batcher;
}

function queueMessage(
  taskId: string,
  message: TaskMessage,
  forwardToRenderer: (channel: string, data: unknown) => void,
  addTaskMessage: (taskId: string, message: TaskMessage) => void
): void {
  let batcher = messageBatchers.get(taskId);
  if (!batcher) {
    batcher = createMessageBatcher(taskId, forwardToRenderer, addTaskMessage);
  }

  batcher.pendingMessages.push(message);

  // Set up or reset the batch timer
  if (batcher.timeout) {
    clearTimeout(batcher.timeout);
  }

  batcher.timeout = setTimeout(() => {
    batcher.flush();
  }, MESSAGE_BATCH_DELAY_MS);
}

function flushAndCleanupBatcher(taskId: string): void {
  const batcher = messageBatchers.get(taskId);
  if (batcher) {
    batcher.flush();
    messageBatchers.delete(taskId);
  }
}

function assertTrustedWindow(window: BrowserWindow | null): BrowserWindow {
  if (!window || window.isDestroyed()) {
    throw new Error(t('errors:validation.untrustedWindow'));
  }

  const focused = BrowserWindow.getFocusedWindow();
  if (BrowserWindow.getAllWindows().length > 1 && focused && focused.id !== window.id) {
    throw new Error(t('errors:validation.focusedWindowRequired'));
  }

  return window;
}

function sanitizeString(input: unknown, field: string, maxLength = MAX_TEXT_LENGTH): string {
  if (typeof input !== 'string') {
    throw new Error(t('errors:validation.mustBeString', { field }));
  }
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error(t('errors:validation.required', { field }));
  }
  if (trimmed.length > maxLength) {
    throw new Error(t('errors:validation.exceedsLength', { field }));
  }
  return trimmed;
}

function validateTaskConfig(config: TaskConfig): TaskConfig {
  const prompt = sanitizeString(config.prompt, 'prompt');
  const validated: TaskConfig = { prompt };

  if (config.taskId) {
    validated.taskId = sanitizeString(config.taskId, 'taskId', 128);
  }
  if (config.sessionId) {
    validated.sessionId = sanitizeString(config.sessionId, 'sessionId', 128);
  }
  if (config.workingDirectory) {
    validated.workingDirectory = sanitizeString(config.workingDirectory, 'workingDirectory', 1024);
  }
  if (Array.isArray(config.allowedTools)) {
    validated.allowedTools = config.allowedTools
      .filter((tool): tool is string => typeof tool === 'string')
      .map((tool) => sanitizeString(tool, 'allowedTools', 64))
      .slice(0, 20);
  }
  if (config.systemPromptAppend) {
    validated.systemPromptAppend = sanitizeString(
      config.systemPromptAppend,
      'systemPromptAppend',
      MAX_TEXT_LENGTH
    );
  }
  if (config.outputSchema && typeof config.outputSchema === 'object') {
    validated.outputSchema = config.outputSchema;
  }

  return validated;
}

/**
 * Check if E2E auth bypass is enabled via global flag, command-line argument, or environment variable
 * Global flag is set by Playwright's app.evaluate() and is most reliable across platforms
 */
function isE2ESkipAuthEnabled(): boolean {
  return (
    (global as Record<string, unknown>).E2E_SKIP_AUTH === true ||
    process.argv.includes('--e2e-skip-auth') ||
    process.env.E2E_SKIP_AUTH === '1'
  );
}

function handle<Args extends unknown[], ReturnType = unknown>(
  channel: string,
  handler: (event: IpcMainInvokeEvent, ...args: Args) => ReturnType
): void {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      return await handler(event, ...(args as Args));
    } catch (error) {
      console.error(`IPC handler ${channel} failed`, error);
      throw normalizeIpcError(error);
    }
  });
}

/**
 * Register all IPC handlers
 */
export function registerIPCHandlers(): void {
  const taskManager = getTaskManager();

  // Start the permission API server for file-permission MCP
  // Initialize when we have a window (deferred until first task:start)
  let permissionApiInitialized = false;

  // Task: Start a new task
  handle('task:start', async (event: IpcMainInvokeEvent, config: TaskConfig) => {
    const window = assertTrustedWindow(BrowserWindow.fromWebContents(event.sender));
    const sender = event.sender;
    const validatedConfig = validateTaskConfig(config);

    // Check for ready provider before starting task (skip in E2E mock mode)
    // This is a backend safety check - the UI should also check before calling
    if (!isMockTaskEventsEnabled() && !hasReadyProvider()) {
      throw new Error('No provider is ready. Please connect a provider and select a model in Settings.');
    }

    // Initialize permission API server (once, when we have a window)
    if (!permissionApiInitialized) {
      initPermissionApi(window, () => taskManager.getActiveTaskId());
      startPermissionApiServer();
      startQuestionApiServer();
      permissionApiInitialized = true;
    }

    const taskId = createTaskId();

    // E2E Mock Mode: Return mock task and emit simulated events
    if (isMockTaskEventsEnabled()) {
      const mockTask = createMockTask(taskId, validatedConfig.prompt);
      const scenario = detectScenarioFromPrompt(validatedConfig.prompt);

      // Save task to history so Execution page can load it
      saveTask(mockTask);

      // Execute mock flow asynchronously (sends IPC events)
      void executeMockTaskFlow(window, {
        taskId,
        prompt: validatedConfig.prompt,
        scenario,
        delayMs: 50,
      });

      return mockTask;
    }

    // Setup event forwarding to renderer
    const forwardToRenderer = (channel: string, data: unknown) => {
      if (!window.isDestroyed() && !sender.isDestroyed()) {
        sender.send(channel, data);
      }
    };

    // Create task-scoped callbacks for the TaskManager
    const callbacks: TaskCallbacks = {
      onMessage: (message: OpenCodeMessage) => {
        const taskMessage = toTaskMessage(message);
        if (!taskMessage) return;

        // Queue message for batching instead of immediate send
        queueMessage(taskId, taskMessage, forwardToRenderer, addTaskMessage);
      },

      onProgress: (progress: { stage: string; message?: string }) => {
        forwardToRenderer('task:progress', {
          taskId,
          ...progress,
        });
      },

      onPermissionRequest: (request: unknown) => {
        // Flush pending messages before showing permission request
        flushAndCleanupBatcher(taskId);
        forwardToRenderer('permission:request', request);
      },

      onComplete: (result: TaskResult) => {
        // Flush any pending messages before completing
        flushAndCleanupBatcher(taskId);

        forwardToRenderer('task:update', {
          taskId,
          type: 'complete',
          result,
        });

        // Map result status to task status
        let taskStatus: TaskStatus;
        if (result.status === 'success') {
          taskStatus = 'completed';
        } else if (result.status === 'interrupted') {
          taskStatus = 'interrupted';
        } else {
          taskStatus = 'failed';
        }

        // Update task status in history
        updateTaskStatus(taskId, taskStatus, new Date().toISOString());

        // Update session ID if available (important for interrupted tasks to allow continuation)
        const sessionId = result.sessionId || taskManager.getSessionId(taskId);
        if (sessionId) {
          updateTaskSessionId(taskId, sessionId);
        }
      },

      onError: (error: Error) => {
        // Flush any pending messages before error
        flushAndCleanupBatcher(taskId);

        forwardToRenderer('task:update', {
          taskId,
          type: 'error',
          error: error.message,
        });

        // Update task status in history
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
        // Notify renderer of status change (e.g., queued -> running)
        forwardToRenderer('task:status-change', {
          taskId,
          status,
        });
        // Update task status in history
        updateTaskStatus(taskId, status, new Date().toISOString());
      },

      onTodoUpdate: (todos: TodoItem[]) => {
        forwardToRenderer('todo:update', { taskId, todos });
      },

      onAuthError: (error: { providerId: string; message: string }) => {
        // Forward auth error to renderer so it can show re-login toast
        forwardToRenderer('auth:error', error);
      },
    };

    // Start the task via TaskManager (creates isolated adapter or queues if busy)
    const task = await taskManager.startTask(taskId, validatedConfig, callbacks);

    // Add initial user message with the prompt to the chat
    const initialUserMessage: TaskMessage = {
      id: createMessageId(),
      type: 'user',
      content: validatedConfig.prompt,
      timestamp: new Date().toISOString(),
    };
    task.messages = [initialUserMessage];

    // Save task to history (includes the initial user message)
    saveTask(task);

    // Generate AI summary asynchronously (don't block task execution)
    generateTaskSummary(validatedConfig.prompt)
      .then((summary) => {
        updateTaskSummary(taskId, summary);
        forwardToRenderer('task:summary', { taskId, summary });
      })
      .catch((err) => {
        console.warn('[IPC] Failed to generate task summary:', err);
      });

    return task;
  });

  // Task: Cancel current task (running or queued)
  handle('task:cancel', async (_event: IpcMainInvokeEvent, taskId?: string) => {
    if (!taskId) return;

    // Check if it's a queued task first
    if (taskManager.isTaskQueued(taskId)) {
      taskManager.cancelQueuedTask(taskId);
      updateTaskStatus(taskId, 'cancelled', new Date().toISOString());
      return;
    }

    // Otherwise cancel the running task
    if (taskManager.hasActiveTask(taskId)) {
      await taskManager.cancelTask(taskId);
      updateTaskStatus(taskId, 'cancelled', new Date().toISOString());
    }
  });

  // Task: Interrupt current task (graceful Ctrl+C, doesn't kill process)
  handle('task:interrupt', async (_event: IpcMainInvokeEvent, taskId?: string) => {
    if (!taskId) return;

    if (taskManager.hasActiveTask(taskId)) {
      await taskManager.interruptTask(taskId);
      // Note: Don't change task status - task is still running, just interrupted
      console.log(`[IPC] Task ${taskId} interrupted`);
    }
  });

  // Task: Get task from history
  handle('task:get', async (_event: IpcMainInvokeEvent, taskId: string) => {
    return getTask(taskId) || null;
  });

  // Task: List tasks from history
  handle('task:list', async (_event: IpcMainInvokeEvent) => {
    return getTasks();
  });

  // Task: Delete task from history
  handle('task:delete', async (_event: IpcMainInvokeEvent, taskId: string) => {
    deleteTask(taskId);
  });

  // Task: Clear all history
  handle('task:clear-history', async (_event: IpcMainInvokeEvent) => {
    clearHistory();
  });

  // Permission: Respond to permission request
  handle('permission:respond', async (_event: IpcMainInvokeEvent, response: PermissionResponse) => {
    const parsedResponse = validate(permissionResponseSchema, response);
    const { taskId, decision, requestId } = parsedResponse;

    // Check if this is a file permission request from the MCP server
    if (requestId && isFilePermissionRequest(requestId)) {
      const allowed = decision === 'allow';
      const resolved = resolvePermission(requestId, allowed);
      if (resolved) {
        console.log(`[IPC] File permission request ${requestId} resolved: ${allowed ? 'allowed' : 'denied'}`);
        return;
      }
      // If not found in pending, fall through to standard handling
      console.warn(`[IPC] File permission request ${requestId} not found in pending requests`);
    }

    // Check if this is a question request from the MCP server
    if (requestId && isQuestionRequest(requestId)) {
      const denied = decision === 'deny';
      const resolved = resolveQuestion(requestId, {
        selectedOptions: parsedResponse.selectedOptions,
        customText: parsedResponse.customText,
        denied,
      });
      if (resolved) {
        console.log(`[IPC] Question request ${requestId} resolved: ${denied ? 'denied' : 'answered'}`);
        return;
      }
      // If not found in pending, fall through to standard handling
      console.warn(`[IPC] Question request ${requestId} not found in pending requests`);
    }

    // Check if the task is still active
    if (!taskManager.hasActiveTask(taskId)) {
      console.warn(`[IPC] Permission response for inactive task ${taskId}`);
      return;
    }

    if (decision === 'allow') {
      // Send the response to the correct task's CLI
      const message = parsedResponse.selectedOptions?.join(', ') || parsedResponse.message || 'yes';
      const sanitizedMessage = sanitizeString(message, 'permissionResponse', 1024);
      await taskManager.sendResponse(taskId, sanitizedMessage);
    } else {
      // Send denial to the correct task
      await taskManager.sendResponse(taskId, 'no');
    }
  });

  // Session: Resume (continue conversation)
  handle('session:resume', async (event: IpcMainInvokeEvent, sessionId: string, prompt: string, existingTaskId?: string) => {
    const window = assertTrustedWindow(BrowserWindow.fromWebContents(event.sender));
    const sender = event.sender;
    const validatedSessionId = sanitizeString(sessionId, 'sessionId', 128);
    const validatedPrompt = sanitizeString(prompt, 'prompt');
    const validatedExistingTaskId = existingTaskId
      ? sanitizeString(existingTaskId, 'taskId', 128)
      : undefined;

    // Check for ready provider before resuming session (skip in E2E mock mode)
    // This is a backend safety check - the UI should also check before calling
    if (!isMockTaskEventsEnabled() && !hasReadyProvider()) {
      throw new Error('No provider is ready. Please connect a provider and select a model in Settings.');
    }

    // Use existing task ID or create a new one
    const taskId = validatedExistingTaskId || createTaskId();

    // Persist the user's follow-up message to task history
    if (validatedExistingTaskId) {
      const userMessage: TaskMessage = {
        id: createMessageId(),
        type: 'user',
        content: validatedPrompt,
        timestamp: new Date().toISOString(),
      };
      addTaskMessage(validatedExistingTaskId, userMessage);
    }

    // Setup event forwarding to renderer
    const forwardToRenderer = (channel: string, data: unknown) => {
      if (!window.isDestroyed() && !sender.isDestroyed()) {
        sender.send(channel, data);
      }
    };

    // Create task-scoped callbacks for the TaskManager (with batching for performance)
    const callbacks: TaskCallbacks = {
      onMessage: (message: OpenCodeMessage) => {
        const taskMessage = toTaskMessage(message);
        if (!taskMessage) return;

        // Queue message for batching instead of immediate send
        queueMessage(taskId, taskMessage, forwardToRenderer, addTaskMessage);
      },

      onProgress: (progress: { stage: string; message?: string }) => {
        forwardToRenderer('task:progress', {
          taskId,
          ...progress,
        });
      },

      onPermissionRequest: (request: unknown) => {
        // Flush pending messages before showing permission request
        flushAndCleanupBatcher(taskId);
        forwardToRenderer('permission:request', request);
      },

      onComplete: (result: TaskResult) => {
        // Flush any pending messages before completing
        flushAndCleanupBatcher(taskId);

        forwardToRenderer('task:update', {
          taskId,
          type: 'complete',
          result,
        });

        // Map result status to task status
        let taskStatus: TaskStatus;
        if (result.status === 'success') {
          taskStatus = 'completed';
        } else if (result.status === 'interrupted') {
          taskStatus = 'interrupted';
        } else {
          taskStatus = 'failed';
        }

        // Update task status in history
        updateTaskStatus(taskId, taskStatus, new Date().toISOString());

        // Update session ID if available (important for interrupted tasks to allow continuation)
        const newSessionId = result.sessionId || taskManager.getSessionId(taskId);
        if (newSessionId) {
          updateTaskSessionId(taskId, newSessionId);
        }
      },

      onError: (error: Error) => {
        // Flush any pending messages before error
        flushAndCleanupBatcher(taskId);

        forwardToRenderer('task:update', {
          taskId,
          type: 'error',
          error: error.message,
        });

        // Update task status in history
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
        // Notify renderer of status change (e.g., queued -> running)
        forwardToRenderer('task:status-change', {
          taskId,
          status,
        });
        // Update task status in history
        updateTaskStatus(taskId, status, new Date().toISOString());
      },

      onTodoUpdate: (todos: TodoItem[]) => {
        forwardToRenderer('todo:update', { taskId, todos });
      },
    };

    // Start the task via TaskManager with sessionId for resume (creates isolated adapter or queues if busy)
    const task = await taskManager.startTask(taskId, {
      prompt: validatedPrompt,
      sessionId: validatedSessionId,
      taskId,
    }, callbacks);

    // Update task status in history (whether running or queued)
    if (validatedExistingTaskId) {
      updateTaskStatus(validatedExistingTaskId, task.status, new Date().toISOString());
    }

    return task;
  });

  // Settings: Get API keys
  // Note: In production, this should fetch from backend to get metadata
  // The actual keys are stored locally in secure storage
  handle('settings:api-keys', async (_event: IpcMainInvokeEvent) => {
    const storedCredentials = await listStoredCredentials();

    const keys = storedCredentials
      .filter((credential) => credential.account.startsWith('apiKey:'))
      .map((credential) => {
        const provider = credential.account.replace('apiKey:', '');

        // Handle Bedrock specially - it stores JSON credentials
        let keyPrefix = '';
        if (provider === 'bedrock') {
          try {
            const parsed = JSON.parse(credential.password);
            if (parsed.authType === 'accessKeys') {
              keyPrefix = `${parsed.accessKeyId?.substring(0, 8) || 'AKIA'}...`;
            } else if (parsed.authType === 'profile') {
              keyPrefix = `Profile: ${parsed.profileName || 'default'}`;
            }
          } catch {
            keyPrefix = 'AWS Credentials';
          }
        } else {
          keyPrefix =
            credential.password && credential.password.length > 0
              ? `${credential.password.substring(0, 8)}...`
              : '';
        }

        return {
          id: `local-${provider}`,
          provider,
          label: provider === 'bedrock' ? 'AWS Credentials' : 'Local API Key',
          keyPrefix,
          isActive: true,
          createdAt: new Date().toISOString(),
        };
      });

    // Check for Azure Foundry Entra ID configuration (stored in config, not keychain)
    // Only add if not already present (checking for API key existence)
    const azureConfig = getAzureFoundryConfig();
    const hasAzureKey = keys.some((k) => k.provider === 'azure-foundry');

    if (azureConfig && azureConfig.authType === 'entra-id' && !hasAzureKey) {
      keys.push({
        id: 'local-azure-foundry',
        provider: 'azure-foundry',
        label: 'Azure Foundry (Entra ID)',
        keyPrefix: 'Entra ID',
        isActive: azureConfig.enabled ?? true,
        createdAt: new Date().toISOString(),
      });
    }

    return keys;
  });

  // Settings: Add API key (stores securely in OS keychain)
  handle(
    'settings:add-api-key',
    async (_event: IpcMainInvokeEvent, provider: string, key: string, label?: string) => {
      if (!ALLOWED_API_KEY_PROVIDERS.has(provider)) {
        throw new Error(t('errors:validation.unsupportedProvider'));
      }
      const sanitizedKey = sanitizeString(key, 'apiKey', 256);
      const sanitizedLabel = label ? sanitizeString(label, 'label', 128) : undefined;

      // Store the API key securely in OS keychain
      await storeApiKey(provider, sanitizedKey);

      return {
        id: `local-${provider}`,
        provider,
        label: sanitizedLabel || 'Local API Key',
        keyPrefix: sanitizedKey.substring(0, 8) + '...',
        isActive: true,
        createdAt: new Date().toISOString(),
      };
    }
  );

  // Settings: Remove API key
  handle('settings:remove-api-key', async (_event: IpcMainInvokeEvent, id: string) => {
    // Extract provider from id (format: local-{provider})
    const sanitizedId = sanitizeString(id, 'id', 128);
    const provider = sanitizedId.replace('local-', '');
    await deleteApiKey(provider);
  });

  // API Key: Check if API key exists
  handle('api-key:exists', async (_event: IpcMainInvokeEvent) => {
    const apiKey = await getApiKey('anthropic');
    return Boolean(apiKey);
  });

  // API Key: Set API key
  handle('api-key:set', async (_event: IpcMainInvokeEvent, key: string) => {
    const sanitizedKey = sanitizeString(key, 'apiKey', 256);
    await storeApiKey('anthropic', sanitizedKey);
    console.log('[API Key] Key set', { keyPrefix: sanitizedKey.substring(0, 8) });
  });

  // API Key: Get API key
  handle('api-key:get', async (_event: IpcMainInvokeEvent) => {
    return getApiKey('anthropic');
  });

  // API Key: Validate API key by making a test request
  handle('api-key:validate', async (_event: IpcMainInvokeEvent, key: string) => {
    const sanitizedKey = sanitizeString(key, 'apiKey', 256);
    console.log('[API Key] Validation requested');

    try {
      // Make a simple API call to validate the key
      const response = await fetchWithTimeout(
        'https://api.anthropic.com/v1/messages',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': sanitizedKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-3-haiku-20240307',
            max_tokens: 1,
            messages: [{ role: 'user', content: 'test' }],
          }),
        },
        API_KEY_VALIDATION_TIMEOUT_MS
      );

      if (response.ok) {
        console.log('[API Key] Validation succeeded');
        return { valid: true };
      }

      const errorData = await response.json().catch(() => ({}));
      const errorMessage = (errorData as { error?: { message?: string } })?.error?.message || `API returned status ${response.status}`;

      console.warn('[API Key] Validation failed', { status: response.status, error: errorMessage });

      return { valid: false, error: errorMessage };
    } catch (error) {
      console.error('[API Key] Validation error', { error: error instanceof Error ? error.message : String(error) });
      if (error instanceof Error && error.name === 'AbortError') {
        return { valid: false, error: t('errors:api.timeoutRetry') };
      }
      return { valid: false, error: t('errors:api.connectionFailed') };
    }
  });

  // API Key: Validate API key for any provider
  handle('api-key:validate-provider', async (_event: IpcMainInvokeEvent, provider: string, key: string, options?: Record<string, any>) => {
    if (!ALLOWED_API_KEY_PROVIDERS.has(provider)) {
      return { valid: false, error: t('errors:api.unsupportedProvider') };
    }

    // Special handling for Azure Foundry with Entra ID - skip strict key validation
    let sanitizedKey = '';
    const isUsingEntraIdAuth = provider === 'azure-foundry' && (
      options?.authType === 'entra-id' || 
      (!options && getAzureFoundryConfig()?.authType === 'entra-id')
    );

    if (!isUsingEntraIdAuth) {
      try {
        sanitizedKey = sanitizeString(key, 'apiKey', 256);
      } catch (e) {
        return { valid: false, error: e instanceof Error ? e.message : 'Invalid API key' };
      }
    }

    console.log(`[API Key] Validation requested for provider: ${provider}`);

    try {
      let response: Response;

      switch (provider) {
        case 'anthropic':
          response = await fetchWithTimeout(
            'https://api.anthropic.com/v1/messages',
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-api-key': sanitizedKey,
                'anthropic-version': '2023-06-01',
              },
              body: JSON.stringify({
                model: 'claude-3-haiku-20240307',
                max_tokens: 1,
                messages: [{ role: 'user', content: 'test' }],
              }),
            },
            API_KEY_VALIDATION_TIMEOUT_MS
          );
          break;

        case 'openai': {
          const configuredBaseUrl = getOpenAiBaseUrl().trim();
          const baseUrl = (configuredBaseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
          response = await fetchWithTimeout(
            `${baseUrl}/models`,
            {
              method: 'GET',
              headers: {
                'Authorization': `Bearer ${sanitizedKey}`,
              },
            },
            API_KEY_VALIDATION_TIMEOUT_MS
          );
          break;
        }

        case 'openrouter':
          response = await fetchWithTimeout(
            'https://openrouter.ai/api/v1/auth/key',
            {
              method: 'GET',
              headers: {
                'Authorization': `Bearer ${sanitizedKey}`,
              },
            },
            API_KEY_VALIDATION_TIMEOUT_MS
          );
          break;

        case 'google':
          response = await fetchWithTimeout(
            `https://generativelanguage.googleapis.com/v1beta/models?key=${sanitizedKey}`,
            {
              method: 'GET',
            },
            API_KEY_VALIDATION_TIMEOUT_MS
          );
          break;

        case 'xai':
          response = await fetchWithTimeout(
            'https://api.x.ai/v1/models',
            {
              method: 'GET',
              headers: {
                'Authorization': `Bearer ${sanitizedKey}`,
              },
            },
            API_KEY_VALIDATION_TIMEOUT_MS
          );
          break;

        case 'deepseek':
          response = await fetchWithTimeout(
            'https://api.deepseek.com/models',
            {
              method: 'GET',
              headers: {
                'Authorization': `Bearer ${sanitizedKey}`,
              },
            },
            API_KEY_VALIDATION_TIMEOUT_MS
          );
          break;

        case 'moonshot':
          response = await fetchWithTimeout(
            'https://api.moonshot.ai/v1/chat/completions',
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${sanitizedKey}`,
              },
              body: JSON.stringify({
                model: 'kimi-latest',
                max_tokens: 1,
                messages: [{ role: 'user', content: 'test' }],
              }),
            },
            API_KEY_VALIDATION_TIMEOUT_MS
          );
          break;

        // Z.AI Coding Plan uses the same validation as standard API
        case 'zai': {
          const zaiRegion = (options?.region as string) || 'international';
          const zaiEndpoint = zaiRegion === 'china'
            ? 'https://open.bigmodel.cn/api/paas/v4/models'
            : 'https://api.z.ai/api/coding/paas/v4/models';

          response = await fetchWithTimeout(
            zaiEndpoint,
            {
              method: 'GET',
              headers: {
                'Authorization': `Bearer ${sanitizedKey}`,
              },
            },
            API_KEY_VALIDATION_TIMEOUT_MS
          );
          break;
        }

        case 'azure-foundry':
          // Prioritize options passed in (from settings dialog setup)
          // otherwise fall back to stored config
          const config = getAzureFoundryConfig();
          const baseUrl = options?.baseUrl || config?.baseUrl;
          const deploymentName = options?.deploymentName || config?.deploymentName;
          const authType = options?.authType || config?.authType || 'api-key';

          // Store token if using Entra ID to avoid double-fetch
          let entraToken = '';

          if (authType === 'entra-id') {
             // If we have options, we should try to validate connection using Entra ID (setup mode)
             if (options?.baseUrl && options?.deploymentName) {
                 const tokenResult = await getAzureEntraToken();
                 if (!tokenResult.success) {
                     return { valid: false, error: tokenResult.error };
                 }
                 entraToken = tokenResult.token;
             } else {
                 // No options means validating existing config which is entra-id (background check)
                 // We skip actual validation here to avoid overhead
                 return { valid: true };
             }
          }

          if (!baseUrl || !deploymentName) {
            console.log('[API Key] Skipping validation for azure-foundry provider (missing config or options)');
            return { valid: true };
          }

          /* eslint-disable-next-line no-case-declarations */
          const cleanBaseUrl = baseUrl.replace(/\/+$/, '');
          /* eslint-disable-next-line no-case-declarations */
          const testUrl = `${cleanBaseUrl}/openai/deployments/${deploymentName}/chat/completions?api-version=2023-05-15`;

          /* eslint-disable-next-line no-case-declarations */
          const headers: Record<string, string> = {
            'Content-Type': 'application/json',
          };

          if (authType === 'entra-id') {
             if (!entraToken) {
               return { valid: false, error: 'Missing Entra ID access token for Azure Foundry validation request' };
             }
             headers['Authorization'] = `Bearer ${entraToken}`;
          } else {
             headers['api-key'] = sanitizedKey;
          }

          // Try max_completion_tokens first (newer models like GPT-4o, GPT-5)
          response = await fetchWithTimeout(
            testUrl,
            {
              method: 'POST',
              headers,
              body: JSON.stringify({
                messages: [{ role: 'user', content: 'test' }],
                max_completion_tokens: 5
              }),
            },
            API_KEY_VALIDATION_TIMEOUT_MS
          );

           // If max_completion_tokens not supported, try max_tokens (older models)
          if (!response.ok) {
            const firstErrorData = await response.json().catch(() => ({}));
            const firstErrorMessage = (firstErrorData as { error?: { message?: string } })?.error?.message || '';
            console.log('[Azure Foundry] First attempt failed:', firstErrorMessage);
            
            if (firstErrorMessage.includes('max_completion_tokens')) {
              console.log('[Azure Foundry] Retrying with max_tokens for older model');
              response = await fetchWithTimeout(
                testUrl,
                {
                  method: 'POST',
                  headers,
                  body: JSON.stringify({
                    messages: [{ role: 'user', content: 'test' }],
                    max_tokens: 5
                  }),
                },
                API_KEY_VALIDATION_TIMEOUT_MS
              );
            } else {
              // Return the error from the first attempt
              console.warn(`[API Key] Validation failed for ${provider}`, { status: response.status, error: firstErrorMessage });
              return { valid: false, error: firstErrorMessage || `API returned status ${response.status}` };
            }
          }
          
        case 'minimax':
          // MiniMax uses Anthropic-compatible API
          response = await fetchWithTimeout(
            'https://api.minimax.io/anthropic/v1/messages',
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${sanitizedKey}`,
                'anthropic-version': '2023-06-01',
              },
              body: JSON.stringify({
                model: 'MiniMax-M2',
                max_tokens: 1,
                messages: [{ role: 'user', content: 'test' }],
              }),
            },
            API_KEY_VALIDATION_TIMEOUT_MS
          );

          break;

        default:
          // For 'custom' provider, skip validation
          console.log('[API Key] Skipping validation for custom provider');
          return { valid: true };
      }

      if (response.ok) {
        console.log(`[API Key] Validation succeeded for ${provider}`);
        return { valid: true };
      }

      const errorData = await response.json().catch(() => ({}));
      const errorMessage = (errorData as { error?: { message?: string } })?.error?.message || `API returned status ${response.status}`;

      console.warn(`[API Key] Validation failed for ${provider}`, { status: response.status, error: errorMessage });
      return { valid: false, error: errorMessage };
    } catch (error) {
      console.error(`[API Key] Validation error for ${provider}`, { error: error instanceof Error ? error.message : String(error) });
      if (error instanceof Error && error.name === 'AbortError') {
        return { valid: false, error: 'Request timed out. Please check your internet connection and try again.' };
      }
      return { valid: false, error: 'Failed to validate API key. Check your internet connection.' };
    }
  });

  // Bedrock: Validate AWS credentials
  handle('bedrock:validate', async (_event: IpcMainInvokeEvent, credentials: string) => {
    console.log('[Bedrock] Validation requested');

    try {
      const parsed = JSON.parse(credentials);
      let client: BedrockClient;

      if (parsed.authType === 'accessKeys') {
        // Access key authentication
        const awsCredentials: { accessKeyId: string; secretAccessKey: string; sessionToken?: string } = {
          accessKeyId: parsed.accessKeyId,
          secretAccessKey: parsed.secretAccessKey,
        };
        if (parsed.sessionToken) {
          awsCredentials.sessionToken = parsed.sessionToken;
        }
        client = new BedrockClient({
          region: parsed.region || 'us-east-1',
          credentials: awsCredentials,
        });
      } else if (parsed.authType === 'profile') {
        // AWS Profile authentication
        client = new BedrockClient({
          region: parsed.region || 'us-east-1',
          credentials: fromIni({ profile: parsed.profileName || 'default' }),
        });
      } else {
        return { valid: false, error: t('errors:bedrock.invalidAuthType') };
      }

      // Test by listing foundation models
      const command = new ListFoundationModelsCommand({});
      await client.send(command);

      console.log('[Bedrock] Validation succeeded');
      return { valid: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Validation failed';
      console.warn('[Bedrock] Validation failed:', message);

      // Provide user-friendly error messages
      if (message.includes('UnrecognizedClientException') || message.includes('InvalidSignatureException')) {
        return { valid: false, error: t('errors:bedrock.invalidAwsCredentials') };
      }
      if (message.includes('AccessDeniedException')) {
        return { valid: false, error: t('errors:bedrock.accessDenied') };
      }
      if (message.includes('could not be found')) {
        return { valid: false, error: t('errors:bedrock.profileNotFound') };
      }

      return { valid: false, error: message };
    }
  });

  // Fetch available Bedrock models
  handle('bedrock:fetch-models', async (_event: IpcMainInvokeEvent, credentialsJson: string) => {
    try {
      const credentials = JSON.parse(credentialsJson) as BedrockCredentials;

      // Create Bedrock client (same pattern as validate)
      let bedrockClient: BedrockClient;
      if (credentials.authType === 'accessKeys') {
        bedrockClient = new BedrockClient({
          region: credentials.region || 'us-east-1',
          credentials: {
            accessKeyId: credentials.accessKeyId,
            secretAccessKey: credentials.secretAccessKey,
            sessionToken: credentials.sessionToken,
          },
        });
      } else {
        bedrockClient = new BedrockClient({
          region: credentials.region || 'us-east-1',
          credentials: fromIni({ profile: credentials.profileName }),
        });
      }

      // Fetch all foundation models
      const command = new ListFoundationModelsCommand({});
      const response = await bedrockClient.send(command);

      // Transform to standard format, filtering for text output models
      // Use modelId for display name to avoid duplicates (multiple versions share the same modelName)
      const models = (response.modelSummaries || [])
        .filter(m => m.outputModalities?.includes('TEXT'))
        .map(m => ({
          id: `amazon-bedrock/${m.modelId}`,
          name: m.modelId || 'Unknown',
          provider: m.providerName || 'Unknown',
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

      return { success: true, models };
    } catch (error) {
      console.error('[Bedrock] Failed to fetch models:', error);
      return { success: false, error: normalizeIpcError(error), models: [] };
    }
  });

  // Bedrock: Save credentials
  handle('bedrock:save', async (_event: IpcMainInvokeEvent, credentials: string) => {
    const parsed = JSON.parse(credentials);

    // Validate structure
    if (parsed.authType === 'accessKeys') {
      if (!parsed.accessKeyId || !parsed.secretAccessKey) {
        throw new Error(t('errors:bedrock.accessKeyRequired'));
      }
    } else if (parsed.authType === 'profile') {
      if (!parsed.profileName) {
        throw new Error(t('errors:bedrock.profileNameRequired'));
      }
    } else {
      throw new Error(t('errors:bedrock.invalidAuthType'));
    }

    // Store the credentials
    storeApiKey('bedrock', credentials);

    return {
      id: 'local-bedrock',
      provider: 'bedrock',
      label: parsed.authType === 'accessKeys' ? 'AWS Access Keys' : `AWS Profile: ${parsed.profileName}`,
      keyPrefix: parsed.authType === 'accessKeys' ? `${parsed.accessKeyId.substring(0, 8)}...` : parsed.profileName,
      isActive: true,
      createdAt: new Date().toISOString(),
    };
  });

  // Bedrock: Get credentials
  handle('bedrock:get-credentials', async (_event: IpcMainInvokeEvent) => {
    const stored = getApiKey('bedrock');
    if (!stored) return null;
    try {
      return JSON.parse(stored);
    } catch {
      return null;
    }
  });

  // API Key: Clear API key
  handle('api-key:clear', async (_event: IpcMainInvokeEvent) => {
    await deleteApiKey('anthropic');
    console.log('[API Key] Key cleared');
  });

  // OpenCode CLI: Check if installed
  handle('opencode:check', async (_event: IpcMainInvokeEvent) => {
    // E2E test bypass: return mock CLI status when E2E skip auth is enabled
    if (isE2ESkipAuthEnabled()) {
      return {
        installed: true,
        version: '1.0.0-test',
        installCommand: 'npm install -g opencode-ai',
      };
    }

    const installed = await isOpenCodeCliInstalled();
    const version = installed ? await getOpenCodeCliVersion() : null;
    return {
      installed,
      version,
      installCommand: 'npm install -g opencode-ai',
    };
  });

  // OpenCode CLI: Get version
  handle('opencode:version', async (_event: IpcMainInvokeEvent) => {
    return getOpenCodeCliVersion();
  });

  // Model: Get selected model
  handle('model:get', async (_event: IpcMainInvokeEvent) => {
    return getSelectedModel();
  });

  // Model: Set selected model
  handle('model:set', async (_event: IpcMainInvokeEvent, model: SelectedModel) => {
    if (!model || typeof model.provider !== 'string' || typeof model.model !== 'string') {
      throw new Error(t('errors:model.invalidConfig'));
    }
    setSelectedModel(model);
  });

  // Ollama: Test connection and get models
  /**
   * Test tool support for a single Ollama model by making a function call request.
   * Ollama supports OpenAI-compatible API at /v1/chat/completions
   */
  async function testOllamaModelToolSupport(
    baseUrl: string,
    modelId: string
  ): Promise<ToolSupportStatus> {
    // Use a time-based tool that the model cannot answer without calling
    // Combined with tool_choice: 'required' to force tool usage if supported
    const testPayload = {
      model: modelId,
      messages: [
        { role: 'user', content: 'What is the current time? You must use the get_current_time tool.' }
      ],
      tools: [
        {
          type: 'function',
          function: {
            name: 'get_current_time',
            description: 'Gets the current time. Must be called to know what time it is.',
            parameters: {
              type: 'object',
              properties: {
                timezone: {
                  type: 'string',
                  description: 'Timezone (e.g., UTC, America/New_York)'
                }
              },
              required: []
            }
          }
        }
      ],
      tool_choice: 'required',
      max_tokens: 100,
    };

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

      const response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testPayload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        // Check if error indicates tools aren't supported
        const errorText = await response.text();
        if (errorText.includes('tool') || errorText.includes('function') || errorText.includes('does not support')) {
          console.log(`[Ollama] Model ${modelId} does not support tools (error response)`);
          return 'unsupported';
        }
        console.warn(`[Ollama] Tool test failed for ${modelId}: ${response.status}`);
        return 'unknown';
      }

      const data = await response.json() as {
        choices?: Array<{
          message?: {
            tool_calls?: Array<{ function?: { name: string } }>;
          };
          finish_reason?: string;
        }>;
      };

      // Check if the response contains tool calls
      const choice = data.choices?.[0];
      if (choice?.message?.tool_calls && choice.message.tool_calls.length > 0) {
        console.log(`[Ollama] Model ${modelId} supports tools (made tool call)`);
        return 'supported';
      }

      // Check finish_reason - 'tool_calls' indicates tool support even if not used
      if (choice?.finish_reason === 'tool_calls') {
        console.log(`[Ollama] Model ${modelId} supports tools (finish_reason)`);
        return 'supported';
      }

      // Model responded but didn't use tools despite tool_choice: 'required'
      // This likely means the model doesn't actually support tools (just ignored the param)
      console.log(`[Ollama] Model ${modelId} did not make tool call despite required - marking as unknown`);
      return 'unknown';
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          console.warn(`[Ollama] Tool test timed out for ${modelId}`);
          return 'unknown';
        }
        // Check for tool-related errors in the message
        if (error.message.includes('tool') || error.message.includes('function')) {
          console.log(`[Ollama] Model ${modelId} does not support tools (exception)`);
          return 'unsupported';
        }
      }
      console.warn(`[Ollama] Tool test error for ${modelId}:`, error);
      return 'unknown';
    }
  }

  handle('ollama:test-connection', async (_event: IpcMainInvokeEvent, url: string) => {
    const sanitizedUrl = sanitizeString(url, 'ollamaUrl', 256);

    // Validate URL format and protocol
    try {
      const parsed = new URL(sanitizedUrl);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return { success: false, error: t('errors:ollama.protocolNotAllowed') };
      }
    } catch {
      return { success: false, error: t('errors:ollama.invalidUrl') };
    }

    try {
      const response = await fetchWithTimeout(
        `${sanitizedUrl}/api/tags`,
        { method: 'GET' },
        API_KEY_VALIDATION_TIMEOUT_MS
      );

      if (!response.ok) {
        throw new Error(`Ollama returned status ${response.status}`);
      }

      const data = await response.json() as { models?: Array<{ name: string; size: number }> };
      const rawModels = data.models || [];

      if (rawModels.length === 0) {
        return { success: true, models: [] };
      }

      console.log(`[Ollama] Found ${rawModels.length} models, testing tool support...`);

      // Test tool support for each model
      const models: OllamaModel[] = [];
      for (const m of rawModels) {
        const toolSupport = await testOllamaModelToolSupport(sanitizedUrl, m.name);
        models.push({
          id: m.name,
          displayName: m.name,
          size: m.size,
          toolSupport,
        });
        console.log(`[Ollama] Model ${m.name}: toolSupport=${toolSupport}`);
      }

      console.log(`[Ollama] Connection successful, found ${models.length} models`);
      return { success: true, models };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Connection failed';
      console.warn('[Ollama] Connection failed:', message);

      if (error instanceof Error && error.name === 'AbortError') {
        return { success: false, error: t('errors:ollama.connectionTimeout') };
      }
      return { success: false, error: t('errors:ollama.cannotConnect', { message }) };
    }
  });

  // Ollama: Get stored config
  handle('ollama:get-config', async (_event: IpcMainInvokeEvent) => {
    return getOllamaConfig();
  });

  // Ollama: Set config
  handle('ollama:set-config', async (_event: IpcMainInvokeEvent, config: OllamaConfig | null) => {
    if (config !== null) {
      if (typeof config.baseUrl !== 'string' || typeof config.enabled !== 'boolean') {
        throw new Error(t('errors:ollama.invalidConfig'));
      }
      // Validate URL format and protocol
      try {
        const parsed = new URL(config.baseUrl);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          throw new Error(t('errors:ollama.protocolNotAllowed'));
        }
      } catch (e) {
        if (e instanceof Error && e.message.includes('http')) {
          throw e; // Re-throw our protocol error
        }
        throw new Error(t('errors:ollama.invalidUrl'));
      }
      // Validate optional lastValidated if present
      if (config.lastValidated !== undefined && typeof config.lastValidated !== 'number') {
        throw new Error(t('errors:ollama.invalidConfig'));
      }
      // Validate optional models array if present
      if (config.models !== undefined) {
        if (!Array.isArray(config.models)) {
          throw new Error(t('errors:ollama.modelsArray'));
        }
        for (const model of config.models) {
          if (typeof model.id !== 'string' || typeof model.displayName !== 'string' || typeof model.size !== 'number') {
            throw new Error(t('errors:ollama.invalidModelFormat'));
          }
        }
      }
    }
    setOllamaConfig(config);
    console.log('[Ollama] Config saved:', config);
  });

  // Azure Foundry: Get config
  handle('azure-foundry:get-config', async (_event: IpcMainInvokeEvent) => {
    return getAzureFoundryConfig();
  });

  // Azure Foundry: Set config
  handle('azure-foundry:set-config', async (_event: IpcMainInvokeEvent, config: AzureFoundryConfig | null) => {
    if (config !== null) {
      // Validate required fields
      if (typeof config.baseUrl !== 'string' || !config.baseUrl.trim()) {
        throw new Error('Invalid Azure Foundry configuration: baseUrl is required');
      }
      if (typeof config.deploymentName !== 'string' || !config.deploymentName.trim()) {
        throw new Error('Invalid Azure Foundry configuration: deploymentName is required');
      }
      if (config.authType !== 'api-key' && config.authType !== 'entra-id') {
        throw new Error('Invalid Azure Foundry configuration: authType must be api-key or entra-id');
      }
      if (typeof config.enabled !== 'boolean') {
        throw new Error('Invalid Azure Foundry configuration: enabled must be a boolean');
      }
      // Validate URL format
      try {
        const parsed = new URL(config.baseUrl);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          throw new Error('Invalid Azure Foundry configuration: Only http and https URLs are allowed');
        }
      } catch {
        throw new Error('Invalid Azure Foundry configuration: Invalid base URL format');
      }
    }
    setAzureFoundryConfig(config);
    console.log('[Azure Foundry] Config saved:', config);
  });

  // Azure Foundry: Test connection (for new provider settings architecture)
  handle('azure-foundry:test-connection', async (
    _event: IpcMainInvokeEvent,
    config: { endpoint: string; deploymentName: string; authType: 'api-key' | 'entra-id'; apiKey?: string }
  ) => {
    const { endpoint, deploymentName, authType, apiKey } = config;

    // Validate URL format
    let baseUrl: string;
    try {
      const parsed = new URL(endpoint);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return { success: false, error: 'Only http and https URLs are allowed' };
      }
      baseUrl = endpoint.replace(/\/$/, '');
    } catch {
      return { success: false, error: 'Invalid endpoint URL format' };
    }

    try {
      let authHeader: string;

      if (authType === 'api-key') {
        if (!apiKey) {
          return { success: false, error: 'API key is required for API key authentication' };
        }
        authHeader = apiKey;
      } else {
        // Entra ID authentication - uses cached token with auto-refresh
        const tokenResult = await getAzureEntraToken();
        if (!tokenResult.success) {
          return { success: false, error: tokenResult.error };
        }
        authHeader = `Bearer ${tokenResult.token}`;
      }

      // Test connection with a minimal chat completion request
      const testUrl = `${baseUrl}/openai/deployments/${deploymentName}/chat/completions?api-version=2024-02-15-preview`;

      // Build headers based on auth type
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (authType === 'api-key') {
        headers['api-key'] = authHeader;
      } else {
        headers['Authorization'] = authHeader;
      }

      const response = await fetchWithTimeout(
        testUrl,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            messages: [{ role: 'user', content: 'Hi' }],
            max_completion_tokens: 5,
          }),
        },
        API_KEY_VALIDATION_TIMEOUT_MS
      );

      if (!response.ok) {
        // Try with max_tokens for older models
        const retryResponse = await fetchWithTimeout(
          testUrl,
          {
            method: 'POST',
            headers,
            body: JSON.stringify({
              messages: [{ role: 'user', content: 'Hi' }],
              max_tokens: 5,
            }),
          },
          API_KEY_VALIDATION_TIMEOUT_MS
        );

        if (!retryResponse.ok) {
          const errorData = await retryResponse.json().catch(() => ({}));
          const errorMessage = (errorData as { error?: { message?: string } })?.error?.message || `API returned status ${retryResponse.status}`;
          return { success: false, error: errorMessage };
        }
      }

      console.log('[Azure Foundry] Connection test successful for deployment:', deploymentName);
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Connection failed';
      console.warn('[Azure Foundry] Connection test failed:', message);

      if (error instanceof Error && error.name === 'AbortError') {
        return { success: false, error: 'Request timed out. Check your endpoint URL and network connection.' };
      }
      return { success: false, error: message };
    }
  });

  // Azure Foundry: Save config (for new provider settings architecture)
  handle('azure-foundry:save-config', async (
    _event: IpcMainInvokeEvent,
    config: { endpoint: string; deploymentName: string; authType: 'api-key' | 'entra-id'; apiKey?: string }
  ) => {
    const { endpoint, deploymentName, authType, apiKey } = config;

    // Store API key in secure storage if provided
    if (authType === 'api-key' && apiKey) {
      storeApiKey('azure-foundry', apiKey);
    }

    // Save config to app settings (for legacy support and config generation)
    const azureConfig: AzureFoundryConfig = {
      baseUrl: endpoint,
      deploymentName,
      authType,
      enabled: true,
      lastValidated: Date.now(),
    };
    setAzureFoundryConfig(azureConfig);

    console.log('[Azure Foundry] Config saved for new provider settings:', {
      endpoint,
      deploymentName,
      authType,
      hasApiKey: !!apiKey,
    });
  });

  // OpenRouter: Fetch available models
  handle('openrouter:fetch-models', async (_event: IpcMainInvokeEvent) => {
    const apiKey = getApiKey('openrouter');
    if (!apiKey) {
      return { success: false, error: 'No OpenRouter API key configured' };
    }

    try {
      const response = await fetchWithTimeout(
        'https://openrouter.ai/api/v1/models',
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
          },
        },
        API_KEY_VALIDATION_TIMEOUT_MS
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = (errorData as { error?: { message?: string } })?.error?.message || `API returned status ${response.status}`;
        return { success: false, error: errorMessage };
      }

      const data = await response.json() as { data?: Array<{ id: string; name: string; context_length?: number }> };
      const models = (data.data || []).map((m) => {
        // Extract provider from model ID (e.g., "anthropic/claude-3.5-sonnet" -> "anthropic")
        const provider = m.id.split('/')[0] || 'unknown';
        return {
          id: m.id,
          name: m.name || m.id,
          provider,
          contextLength: m.context_length || 0,
        };
      });

      console.log(`[OpenRouter] Fetched ${models.length} models`);
      return { success: true, models };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch models';
      console.warn('[OpenRouter] Fetch failed:', message);

      if (error instanceof Error && error.name === 'AbortError') {
        return { success: false, error: 'Request timed out. Check your internet connection.' };
      }
      return { success: false, error: `Failed to fetch models: ${message}` };
    }
  });

  // LiteLLM: Test connection and fetch models
  handle('litellm:test-connection', async (_event: IpcMainInvokeEvent, url: string, apiKey?: string) => {
    const sanitizedUrl = sanitizeString(url, 'litellmUrl', 256);
    const sanitizedApiKey = apiKey ? sanitizeString(apiKey, 'apiKey', 256) : undefined;

    // Validate URL format and protocol
    try {
      const parsed = new URL(sanitizedUrl);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return { success: false, error: 'Only http and https URLs are allowed' };
      }
    } catch {
      return { success: false, error: 'Invalid URL format' };
    }

    try {
      const headers: Record<string, string> = {};
      if (sanitizedApiKey) {
        headers['Authorization'] = `Bearer ${sanitizedApiKey}`;
      }

      const response = await fetchWithTimeout(
        `${sanitizedUrl}/v1/models`,
        { method: 'GET', headers },
        API_KEY_VALIDATION_TIMEOUT_MS
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = (errorData as { error?: { message?: string } })?.error?.message || `API returned status ${response.status}`;
        return { success: false, error: errorMessage };
      }

      const data = await response.json() as { data?: Array<{ id: string; object: string; created?: number; owned_by?: string }> };
      const models = (data.data || []).map((m) => {
        // Extract provider from model ID (e.g., "openai/gpt-4" -> "openai")
        const provider = m.id.split('/')[0] || m.owned_by || 'unknown';
        return {
          id: m.id,
          name: m.id, // LiteLLM uses id as name
          provider,
          contextLength: 0, // LiteLLM doesn't provide this in /v1/models
        };
      });

      console.log(`[LiteLLM] Connection successful, found ${models.length} models`);
      return { success: true, models };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Connection failed';
      console.warn('[LiteLLM] Connection failed:', message);

      if (error instanceof Error && error.name === 'AbortError') {
        return { success: false, error: 'Connection timed out. Make sure LiteLLM proxy is running.' };
      }
      return { success: false, error: `Cannot connect to LiteLLM: ${message}` };
    }
  });

  // LiteLLM: Fetch models from configured proxy
  handle('litellm:fetch-models', async (_event: IpcMainInvokeEvent) => {
    const config = getLiteLLMConfig();
    if (!config || !config.baseUrl) {
      return { success: false, error: 'No LiteLLM proxy configured' };
    }

    const apiKey = getApiKey('litellm');

    try {
      const headers: Record<string, string> = {};
      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }

      const response = await fetchWithTimeout(
        `${config.baseUrl}/v1/models`,
        { method: 'GET', headers },
        API_KEY_VALIDATION_TIMEOUT_MS
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = (errorData as { error?: { message?: string } })?.error?.message || `API returned status ${response.status}`;
        return { success: false, error: errorMessage };
      }

      const data = await response.json() as { data?: Array<{ id: string; object: string; created?: number; owned_by?: string }> };
      const models = (data.data || []).map((m) => {
        // Extract provider from model ID (e.g., "anthropic/claude-sonnet" -> "anthropic")
        const parts = m.id.split('/');
        const provider = parts.length > 1 ? parts[0] : (m.owned_by !== 'openai' ? m.owned_by : 'unknown') || 'unknown';

        // Generate display name (e.g., "anthropic/claude-sonnet" -> "Anthropic: Claude Sonnet")
        const modelPart = parts.length > 1 ? parts.slice(1).join('/') : m.id;
        const providerDisplay = provider.charAt(0).toUpperCase() + provider.slice(1);
        const modelDisplay = modelPart
          .split('-')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');
        const displayName = parts.length > 1 ? `${providerDisplay}: ${modelDisplay}` : modelDisplay;

        return {
          id: m.id,
          name: displayName,
          provider,
          contextLength: 0,
        };
      });

      console.log(`[LiteLLM] Fetched ${models.length} models`);
      return { success: true, models };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch models';
      console.warn('[LiteLLM] Fetch failed:', message);

      if (error instanceof Error && error.name === 'AbortError') {
        return { success: false, error: 'Request timed out. Check your LiteLLM proxy.' };
      }
      return { success: false, error: `Failed to fetch models: ${message}` };
    }
  });

  // LiteLLM: Get stored config
  handle('litellm:get-config', async (_event: IpcMainInvokeEvent) => {
    return getLiteLLMConfig();
  });

  // LiteLLM: Set config
  handle('litellm:set-config', async (_event: IpcMainInvokeEvent, config: LiteLLMConfig | null) => {
    if (config !== null) {
      if (typeof config.baseUrl !== 'string' || typeof config.enabled !== 'boolean') {
        throw new Error('Invalid LiteLLM configuration');
      }
      // Validate URL format and protocol
      try {
        const parsed = new URL(config.baseUrl);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          throw new Error('Only http and https URLs are allowed');
        }
      } catch (e) {
        if (e instanceof Error && e.message.includes('http')) {
          throw e; // Re-throw our protocol error
        }
        throw new Error('Invalid base URL format');
      }
      // Validate optional lastValidated if present
      if (config.lastValidated !== undefined && typeof config.lastValidated !== 'number') {
        throw new Error('Invalid LiteLLM configuration');
      }
      // Validate optional models array if present
      if (config.models !== undefined) {
        if (!Array.isArray(config.models)) {
          throw new Error('Invalid LiteLLM configuration: models must be an array');
        }
        for (const model of config.models) {
          if (typeof model.id !== 'string' || typeof model.name !== 'string' || typeof model.provider !== 'string') {
            throw new Error('Invalid LiteLLM configuration: invalid model format');
          }
        }
      }
    }
    setLiteLLMConfig(config);
    console.log('[LiteLLM] Config saved:', config);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // LM Studio Handlers
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Test tool support for a single LM Studio model by making a function call request.
   * Returns 'supported', 'unsupported', or 'unknown' based on the response.
   */
  async function testLMStudioModelToolSupport(
    baseUrl: string,
    modelId: string
  ): Promise<ToolSupportStatus> {
    // Use a time-based tool that the model cannot answer without calling
    // Combined with tool_choice: 'required' to force tool usage if supported
    const testPayload = {
      model: modelId,
      messages: [
        { role: 'user', content: 'What is the current time? You must use the get_current_time tool.' }
      ],
      tools: [
        {
          type: 'function',
          function: {
            name: 'get_current_time',
            description: 'Gets the current time. Must be called to know what time it is.',
            parameters: {
              type: 'object',
              properties: {
                timezone: {
                  type: 'string',
                  description: 'Timezone (e.g., UTC, America/New_York)'
                }
              },
              required: []
            }
          }
        }
      ],
      tool_choice: 'required',
      max_tokens: 100,
    };

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

      const response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testPayload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        // Check if error indicates tools aren't supported
        const errorText = await response.text();
        if (errorText.includes('tool') || errorText.includes('function')) {
          console.log(`[LM Studio] Model ${modelId} does not support tools (error response)`);
          return 'unsupported';
        }
        console.warn(`[LM Studio] Tool test failed for ${modelId}: ${response.status}`);
        return 'unknown';
      }

      const data = await response.json() as {
        choices?: Array<{
          message?: {
            tool_calls?: Array<{ function?: { name: string } }>;
          };
          finish_reason?: string;
        }>;
      };

      // Check if the response contains tool calls
      const choice = data.choices?.[0];
      if (choice?.message?.tool_calls && choice.message.tool_calls.length > 0) {
        console.log(`[LM Studio] Model ${modelId} supports tools (made tool call)`);
        return 'supported';
      }

      // Check finish_reason - 'tool_calls' indicates tool support even if not used
      if (choice?.finish_reason === 'tool_calls') {
        console.log(`[LM Studio] Model ${modelId} supports tools (finish_reason)`);
        return 'supported';
      }

      // Model responded but didn't use tools despite tool_choice: 'required'
      // This likely means the model doesn't actually support tools (just ignored the param)
      console.log(`[LM Studio] Model ${modelId} did not make tool call despite required - marking as unknown`);
      return 'unknown';
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          console.warn(`[LM Studio] Tool test timed out for ${modelId}`);
          return 'unknown';
        }
        // Check for tool-related errors in the message
        if (error.message.includes('tool') || error.message.includes('function')) {
          console.log(`[LM Studio] Model ${modelId} does not support tools (exception)`);
          return 'unsupported';
        }
      }
      console.warn(`[LM Studio] Tool test error for ${modelId}:`, error);
      return 'unknown';
    }
  }

  // LM Studio: Test connection and fetch models with tool support detection
  handle('lmstudio:test-connection', async (_event: IpcMainInvokeEvent, url: string) => {
    const sanitizedUrl = sanitizeString(url, 'lmstudioUrl', 256);

    // Validate URL format and protocol
    try {
      const parsed = new URL(sanitizedUrl);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return { success: false, error: 'Only http and https URLs are allowed' };
      }
    } catch {
      return { success: false, error: 'Invalid URL format' };
    }

    try {
      // First, fetch available models
      const response = await fetchWithTimeout(
        `${sanitizedUrl}/v1/models`,
        { method: 'GET' },
        API_KEY_VALIDATION_TIMEOUT_MS
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = (errorData as { error?: { message?: string } })?.error?.message || `API returned status ${response.status}`;
        return { success: false, error: errorMessage };
      }

      const data = await response.json() as { data?: Array<{ id: string; object: string; owned_by?: string }> };
      const rawModels = data.data || [];

      if (rawModels.length === 0) {
        return { success: false, error: 'No models loaded in LM Studio. Please load a model first.' };
      }

      console.log(`[LM Studio] Found ${rawModels.length} models, testing tool support...`);

      // Test tool support for each model
      const models: Array<{ id: string; name: string; toolSupport: ToolSupportStatus }> = [];

      for (const m of rawModels) {
        // Format display name from model ID
        const displayName = m.id
          .replace(/-/g, ' ')
          .replace(/\b\w/g, (c) => c.toUpperCase());

        // Test tool support
        const toolSupport = await testLMStudioModelToolSupport(sanitizedUrl, m.id);

        models.push({
          id: m.id,
          name: displayName,
          toolSupport,
        });

        console.log(`[LM Studio] Model ${m.id}: toolSupport=${toolSupport}`);
      }

      console.log(`[LM Studio] Connection successful, found ${models.length} models`);
      return { success: true, models };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Connection failed';
      console.warn('[LM Studio] Connection failed:', message);

      if (error instanceof Error && error.name === 'AbortError') {
        return { success: false, error: 'Connection timed out. Make sure LM Studio is running.' };
      }
      return { success: false, error: `Cannot connect to LM Studio: ${message}` };
    }
  });

  // LM Studio: Fetch models from configured instance
  handle('lmstudio:fetch-models', async (_event: IpcMainInvokeEvent) => {
    const config = getLMStudioConfig();
    if (!config || !config.baseUrl) {
      return { success: false, error: 'No LM Studio configured' };
    }

    try {
      const response = await fetchWithTimeout(
        `${config.baseUrl}/v1/models`,
        { method: 'GET' },
        API_KEY_VALIDATION_TIMEOUT_MS
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = (errorData as { error?: { message?: string } })?.error?.message || `API returned status ${response.status}`;
        return { success: false, error: errorMessage };
      }

      const data = await response.json() as { data?: Array<{ id: string; object: string; owned_by?: string }> };
      const rawModels = data.data || [];

      // Test tool support for each model
      const models: Array<{ id: string; name: string; toolSupport: ToolSupportStatus }> = [];

      for (const m of rawModels) {
        const displayName = m.id
          .replace(/-/g, ' ')
          .replace(/\b\w/g, (c) => c.toUpperCase());

        const toolSupport = await testLMStudioModelToolSupport(config.baseUrl, m.id);

        models.push({
          id: m.id,
          name: displayName,
          toolSupport,
        });
      }

      console.log(`[LM Studio] Fetched ${models.length} models`);
      return { success: true, models };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch models';
      console.warn('[LM Studio] Fetch failed:', message);

      if (error instanceof Error && error.name === 'AbortError') {
        return { success: false, error: 'Request timed out. Check your LM Studio server.' };
      }
      return { success: false, error: `Failed to fetch models: ${message}` };
    }
  });

  // LM Studio: Get stored config
  handle('lmstudio:get-config', async (_event: IpcMainInvokeEvent) => {
    return getLMStudioConfig();
  });

  // LM Studio: Set config
  handle('lmstudio:set-config', async (_event: IpcMainInvokeEvent, config: LMStudioConfig | null) => {
    if (config !== null) {
      if (typeof config.baseUrl !== 'string' || typeof config.enabled !== 'boolean') {
        throw new Error('Invalid LM Studio configuration');
      }
      // Validate URL format and protocol
      try {
        const parsed = new URL(config.baseUrl);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          throw new Error('Only http and https URLs are allowed');
        }
      } catch (e) {
        if (e instanceof Error && e.message.includes('http')) {
          throw e; // Re-throw our protocol error
        }
        throw new Error('Invalid base URL format');
      }
      // Validate optional lastValidated if present
      if (config.lastValidated !== undefined && typeof config.lastValidated !== 'number') {
        throw new Error('Invalid LM Studio configuration');
      }
      // Validate optional models array if present
      if (config.models !== undefined) {
        if (!Array.isArray(config.models)) {
          throw new Error('Invalid LM Studio configuration: models must be an array');
        }
        for (const model of config.models) {
          if (typeof model.id !== 'string' || typeof model.name !== 'string') {
            throw new Error('Invalid LM Studio configuration: invalid model format');
          }
        }
      }
    }
    setLMStudioConfig(config);
    console.log('[LM Studio] Config saved:', config);
  });

  // API Keys: Get all API keys (with masked values)
  handle('api-keys:all', async (_event: IpcMainInvokeEvent) => {
    const keys = await getAllApiKeys();
    // Return masked versions for UI
    const masked: Record<string, { exists: boolean; prefix?: string }> = {};
    for (const [provider, key] of Object.entries(keys)) {
      masked[provider] = {
        exists: Boolean(key),
        prefix: key ? key.substring(0, 8) + '...' : undefined,
      };
    }
    return masked;
  });

  // API Keys: Check if any key exists
  handle('api-keys:has-any', async (_event: IpcMainInvokeEvent) => {
    // In E2E mock mode, pretend we have API keys
    if (isMockTaskEventsEnabled()) {
      return true;
    }
    const hasKey = await hasAnyApiKey();
    if (hasKey) return true;
    return getOpenAiOauthStatus().connected;
  });

  // Settings: Get debug mode setting
  handle('settings:debug-mode', async (_event: IpcMainInvokeEvent) => {
    return getDebugMode();
  });

  // Settings: Set debug mode setting
  handle('settings:set-debug-mode', async (_event: IpcMainInvokeEvent, enabled: boolean) => {
    if (typeof enabled !== 'boolean') {
      throw new Error(t('errors:settings.invalidDebugFlag'));
    }
    setDebugMode(enabled);
    // Broadcast the change to all renderer windows
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('settings:debug-mode-changed', { enabled });
    }
  });

  // Settings: Get all app settings
  handle('settings:app-settings', async (_event: IpcMainInvokeEvent) => {
    return getAppSettings();
  });

  // Settings: Get OpenAI base URL override
  handle('settings:openai-base-url:get', async (_event: IpcMainInvokeEvent) => {
    return getOpenAiBaseUrl();
  });

  // Settings: Set OpenAI base URL override
  handle('settings:openai-base-url:set', async (_event: IpcMainInvokeEvent, baseUrl: string) => {
    if (typeof baseUrl !== 'string') {
      throw new Error('Invalid base URL');
    }

    const trimmed = baseUrl.trim();
    if (!trimmed) {
      setOpenAiBaseUrl('');
      return;
    }

    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      throw new Error('Invalid URL');
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('Only http and https URLs are allowed');
    }

    // Store without trailing slashes for consistent downstream URL joining.
    setOpenAiBaseUrl(trimmed.replace(/\/+$/, ''));
  });

  // OpenAI OAuth (ChatGPT) status
  handle('opencode:auth:openai:status', async (_event: IpcMainInvokeEvent) => {
    return getOpenAiOauthStatus();
  });

  // OpenAI OAuth (ChatGPT) login
  handle('opencode:auth:openai:login', async (_event: IpcMainInvokeEvent) => {
    const result = await loginOpenAiWithChatGpt();
    return { ok: true, ...result };
  });

  // Onboarding: Get onboarding complete status
  // Also checks for existing task history to handle upgrades from pre-onboarding versions
  handle('onboarding:complete', async (_event: IpcMainInvokeEvent) => {
    // E2E test bypass: skip onboarding when E2E skip auth is enabled
    if (isE2ESkipAuthEnabled()) {
      return true;
    }

    // If onboarding is already marked complete, return true
    if (getOnboardingComplete()) {
      return true;
    }

    // Check if this is an existing user (has task history)
    // If so, mark onboarding as complete and skip the wizard
    const tasks = getTasks();
    if (tasks.length > 0) {
      setOnboardingComplete(true);
      return true;
    }

    return false;
  });

  // Onboarding: Set onboarding complete status
  handle('onboarding:set-complete', async (_event: IpcMainInvokeEvent, complete: boolean) => {
    setOnboardingComplete(complete);
  });

  // Shell: Open URL in external browser
  // Only allows http/https URLs for security
  handle('shell:open-external', async (_event: IpcMainInvokeEvent, url: string) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error(t('errors:url.protocolNotAllowed'));
      }
      await shell.openExternal(url);
    } catch (error) {
      console.error('Failed to open external URL:', error);
      throw error;
    }
  });

  // ==================== i18n Handlers ====================

  // Initialize i18n with stored language preference
  const storedLanguagePref = getLanguage();
  initializeI18n(storedLanguagePref === 'auto' ? null : storedLanguagePref);

  // i18n: Get current language
  handle('i18n:get-language', async (_event: IpcMainInvokeEvent) => {
    return getLanguage();
  });

  // i18n: Set language
  handle('i18n:set-language', async (_event: IpcMainInvokeEvent, language: UILanguage) => {
    if (language !== 'auto' && !SUPPORTED_LANGUAGES.includes(language as SupportedLanguage)) {
      throw new Error(t('errors:i18n.unsupportedLanguage'));
    }
    setLanguage(language);

    // Update i18n module
    if (language === 'auto') {
      initializeI18n(null);
    } else {
      setI18nLanguage(language as SupportedLanguage);
    }

    // Broadcast language change to all renderer windows
    const resolvedLanguage = getI18nLanguage();
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('i18n:language-changed', {
        language,
        resolvedLanguage,
      });
    }

    console.log(`[i18n] Language set to: ${language} (resolved: ${resolvedLanguage})`);
  });

  // i18n: Get all translations for a language
  handle('i18n:get-translations', async (_event: IpcMainInvokeEvent, language?: string) => {
    let targetLanguage: SupportedLanguage;

    if (language && SUPPORTED_LANGUAGES.includes(language as SupportedLanguage)) {
      targetLanguage = language as SupportedLanguage;
    } else {
      // Use the currently resolved language
      targetLanguage = getI18nLanguage();
    }

    return {
      language: targetLanguage,
      translations: getAllTranslations(targetLanguage),
    };
  });

  // i18n: Get supported languages list
  handle('i18n:get-supported-languages', async (_event: IpcMainInvokeEvent) => {
    return SUPPORTED_LANGUAGES;
  });

  // i18n: Get resolved language (actual language being used)
  handle('i18n:get-resolved-language', async (_event: IpcMainInvokeEvent) => {
    return getI18nLanguage();
  });

  // ==================== End i18n Handlers ====================

  // Log event handler - now just returns ok (no external logging)
  handle(
    'log:event',
    async (_event: IpcMainInvokeEvent, _payload: { level?: string; message?: string; context?: Record<string, unknown> }) => {
      // No-op: external logging removed
      return { ok: true };
    }
  );

  // Speech-to-Text: Check if ElevenLabs is configured
  handle('speech:is-configured', async (_event: IpcMainInvokeEvent) => {
    return isElevenLabsConfigured();
  });

  // Speech-to-Text: Get configuration status
  handle('speech:get-config', async (_event: IpcMainInvokeEvent) => {
    const apiKey = getApiKey('elevenlabs');
    return {
      enabled: Boolean(apiKey && apiKey.trim()),
      hasApiKey: Boolean(apiKey),
      apiKeyPrefix: apiKey ? apiKey.substring(0, 8) + '...' : undefined,
    };
  });

  // Speech-to-Text: Validate API key (makes actual API call to ElevenLabs)
  handle('speech:validate', async (_event: IpcMainInvokeEvent, apiKey?: string) => {
    return validateElevenLabsApiKey(apiKey);
  });

  // Speech-to-Text: Transcribe audio (receives audio data from renderer, calls ElevenLabs API)
  handle('speech:transcribe', async (_event: IpcMainInvokeEvent, audioData: ArrayBuffer, mimeType?: string) => {
    console.log('[IPC] speech:transcribe received:', {
      audioDataType: typeof audioData,
      audioDataByteLength: audioData?.byteLength,
      mimeType,
    });
    // Convert ArrayBuffer to Buffer for the service
    const buffer = Buffer.from(audioData);
    console.log('[IPC] Converted to buffer:', { bufferLength: buffer.length });
    return transcribeAudio(buffer, mimeType);
  });
  // Provider Settings
  handle('provider-settings:get', async () => {
    return getProviderSettings();
  });

  handle('provider-settings:set-active', async (_event: IpcMainInvokeEvent, providerId: ProviderId | null) => {
    setActiveProvider(providerId);
  });

  handle('provider-settings:get-connected', async (_event: IpcMainInvokeEvent, providerId: ProviderId) => {
    return getConnectedProvider(providerId);
  });

  handle('provider-settings:set-connected', async (_event: IpcMainInvokeEvent, providerId: ProviderId, provider: ConnectedProvider) => {
    setConnectedProvider(providerId, provider);
  });

  handle('provider-settings:remove-connected', async (_event: IpcMainInvokeEvent, providerId: ProviderId) => {
    removeConnectedProvider(providerId);
  });

  handle('provider-settings:update-model', async (_event: IpcMainInvokeEvent, providerId: ProviderId, modelId: string | null) => {
    updateProviderModel(providerId, modelId);
  });

  handle('provider-settings:set-debug', async (_event: IpcMainInvokeEvent, enabled: boolean) => {
    setProviderDebugMode(enabled);
  });

  handle('provider-settings:get-debug', async () => {
    return getProviderDebugMode();
  });

  // Logs: Export application logs
  handle('logs:export', async (event: IpcMainInvokeEvent) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) throw new Error('No window found');

    // Flush pending logs before export
    const collector = getLogCollector();
    collector.flush();

    const logPath = collector.getCurrentLogPath();
    const logDir = collector.getLogDir();

    // Generate default filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const defaultFilename = `openwork-logs-${timestamp}.txt`;

    // Show save dialog
    const result = await dialog.showSaveDialog(window, {
      title: 'Export Application Logs',
      defaultPath: defaultFilename,
      filters: [
        { name: 'Text Files', extensions: ['txt'] },
        { name: 'Log Files', extensions: ['log'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });

    if (result.canceled || !result.filePath) {
      return { success: false, reason: 'cancelled' };
    }

    try {
      // Check if current log file exists
      if (fs.existsSync(logPath)) {
        // Copy the log file to the selected location
        fs.copyFileSync(logPath, result.filePath);
      } else {
        // No logs yet - create empty file with header
        const header = `Openwork Application Logs\nExported: ${new Date().toISOString()}\nLog Directory: ${logDir}\n\nNo logs recorded yet.\n`;
        fs.writeFileSync(result.filePath, header);
      }

      return { success: true, path: result.filePath };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: message };
    }
  });
}

function createTaskId(): string {
  return `task_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function createMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Extract base64 screenshots from tool output
 * Returns cleaned text (with images replaced by placeholders) and extracted attachments
 */
function extractScreenshots(output: string): {
  cleanedText: string;
  attachments: Array<{ type: 'screenshot' | 'json'; data: string; label?: string }>;
} {
  const attachments: Array<{ type: 'screenshot' | 'json'; data: string; label?: string }> = [];

  // Match data URLs (data:image/png;base64,...)
  const dataUrlRegex = /data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+/g;
  let match;
  while ((match = dataUrlRegex.exec(output)) !== null) {
    attachments.push({
      type: 'screenshot',
      data: match[0],
      label: 'Browser screenshot',
    });
  }

  // Also check for raw base64 PNG (starts with iVBORw0)
  // This pattern matches PNG base64 that isn't already a data URL
  const rawBase64Regex = /(?<![;,])(?:^|["\s])?(iVBORw0[A-Za-z0-9+/=]{100,})(?:["\s]|$)/g;
  while ((match = rawBase64Regex.exec(output)) !== null) {
    const base64Data = match[1];
    // Wrap in data URL if it's valid base64 PNG
    if (base64Data && base64Data.length > 100) {
      attachments.push({
        type: 'screenshot',
        data: `data:image/png;base64,${base64Data}`,
        label: 'Browser screenshot',
      });
    }
  }

  // Clean the text - replace image data with placeholder
  let cleanedText = output
    .replace(dataUrlRegex, '[Screenshot captured]')
    .replace(rawBase64Regex, '[Screenshot captured]');

  // Also clean up common JSON wrappers around screenshots
  cleanedText = cleanedText
    .replace(/"[Screenshot captured]"/g, '"[Screenshot]"')
    .replace(/\[Screenshot captured\]\[Screenshot captured\]/g, '[Screenshot captured]');

  return { cleanedText, attachments };
}

/**
 * Sanitize tool output to remove technical details that confuse users
 */
function sanitizeToolOutput(text: string, isError: boolean): string {
  let result = text;

  // Strip any remaining ANSI escape codes
  result = result.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
  // Also strip any leftover escape sequences that may have been partially matched
  result = result.replace(/\x1B\[2m|\x1B\[22m|\x1B\[0m/g, '');

  // Remove WebSocket URLs
  result = result.replace(/ws:\/\/[^\s\]]+/g, '[connection]');

  // Remove "Call log:" sections and everything after
  result = result.replace(/\s*Call log:[\s\S]*/i, '');

  // Simplify common Playwright/CDP errors for users
  if (isError) {
    // Timeout errors: extract just the timeout duration
    const timeoutMatch = result.match(/timed? ?out after (\d+)ms/i);
    if (timeoutMatch) {
      const seconds = Math.round(parseInt(timeoutMatch[1]) / 1000);
      return `Timed out after ${seconds}s`;
    }

    // "browserType.connectOverCDP: Protocol error (X): Y" → "Y"
    const protocolMatch = result.match(/Protocol error \([^)]+\):\s*(.+)/i);
    if (protocolMatch) {
      result = protocolMatch[1].trim();
    }

    // "Error executing code: X" → just the meaningful part
    result = result.replace(/^Error executing code:\s*/i, '');

    // Clean up "browserType.connectOverCDP:" prefix
    result = result.replace(/browserType\.connectOverCDP:\s*/i, '');

    // Remove stack traces (lines starting with "at ")
    result = result.replace(/\s+at\s+.+/g, '');

    // Remove error class names like "CodeExecutionTimeoutError:"
    result = result.replace(/\w+Error:\s*/g, '');
  }

  return result.trim();
}

function toTaskMessage(message: OpenCodeMessage): TaskMessage | null {
  // OpenCode format: step_start, text, tool_call, tool_use, tool_result, step_finish

  // Handle text content
  if (message.type === 'text') {
    if (message.part.text) {
      return {
        id: createMessageId(),
        type: 'assistant',
        content: message.part.text,
        timestamp: new Date().toISOString(),
      };
    }
    return null;
  }

  // Handle tool calls (legacy format - just shows tool is starting)
  if (message.type === 'tool_call') {
    return {
      id: createMessageId(),
      type: 'tool',
      content: `Using tool: ${message.part.tool}`,
      toolName: message.part.tool,
      toolInput: message.part.input,
      timestamp: new Date().toISOString(),
    };
  }

  // Handle tool_use messages (combined tool call + result)
  if (message.type === 'tool_use') {
    const toolUseMsg = message as import('@accomplish/shared').OpenCodeToolUseMessage;
    const toolName = toolUseMsg.part.tool || 'unknown';
    const toolInput = toolUseMsg.part.state?.input;
    const toolOutput = toolUseMsg.part.state?.output || '';
    const status = toolUseMsg.part.state?.status;

    // Only create message for completed/error status (not pending/running)
    if (status === 'completed' || status === 'error') {
      // Extract screenshots from tool output
      const { cleanedText, attachments } = extractScreenshots(toolOutput);

      // Sanitize output - more aggressive for errors
      const isError = status === 'error';
      const sanitizedText = sanitizeToolOutput(cleanedText, isError);

      // Truncate long outputs for display
      const displayText = sanitizedText.length > 500
        ? sanitizedText.substring(0, 500) + '...'
        : sanitizedText;

      return {
        id: createMessageId(),
        type: 'tool',
        content: displayText || `Tool ${toolName} ${status}`,
        toolName,
        toolInput,
        timestamp: new Date().toISOString(),
        attachments: attachments.length > 0 ? attachments : undefined,
      };
    }
    return null;
  }

  return null;
}
