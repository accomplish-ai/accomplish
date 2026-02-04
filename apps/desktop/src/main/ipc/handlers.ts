import { ipcMain, BrowserWindow, shell, app, dialog } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import { URL } from 'url';
import fs from 'fs';
import {
  isOpenCodeCliInstalled,
  getOpenCodeCliVersion,
  getTaskManager,
  disposeTaskManager,
} from '../opencode';
import { getLogCollector } from '../logging';
import {
  getAzureEntraToken,
  getTasks,
  getTask,
  saveTask,
  updateTaskStatus,
  updateTaskSummary,
  addTaskMessage,
  deleteTask,
  clearHistory,
  getTodosForTask,
  validateApiKey,
  fetchWithTimeout,
  validateHttpUrl,
  createTaskId,
  createMessageId,
  sanitizeString,
} from '@accomplish/core';
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
  getAzureFoundryConfig,
  setAzureFoundryConfig,
  getLiteLLMConfig,
  setLiteLLMConfig,
  getLMStudioConfig,
  setLMStudioConfig,
} from '@accomplish/core';
import { safeParseJson } from '@accomplish/core';
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
  getOpenAiOauthStatus,
} from '@accomplish/core';
import { loginOpenAiWithChatGpt } from '../opencode/auth-browser';
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
  SelectedModel,
  OllamaConfig,
  AzureFoundryConfig,
  LiteLLMConfig,
  LMStudioConfig,
  ToolSupportStatus,
} from '@accomplish/shared';
import { DEFAULT_PROVIDERS } from '@accomplish/shared';
import {
  normalizeIpcError,
  permissionResponseSchema,
  resumeSessionSchema,
  taskConfigSchema,
  validate,
} from './validation';
import { createTaskCallbacks } from './task-callbacks';
import { BedrockClient, ListFoundationModelsCommand } from '@aws-sdk/client-bedrock';
import { fromIni } from '@aws-sdk/credential-providers';
import {
  isMockTaskEventsEnabled,
  createMockTask,
  executeMockTaskFlow,
  detectScenarioFromPrompt,
} from '../test-utils/mock-task-flow';
import { skillsManager } from '../skills';

const ALLOWED_API_KEY_PROVIDERS = new Set(['anthropic', 'openai', 'openrouter', 'google', 'xai', 'deepseek', 'moonshot', 'zai', 'azure-foundry', 'custom', 'bedrock', 'litellm', 'minimax', 'lmstudio', 'elevenlabs']);
const API_KEY_VALIDATION_TIMEOUT_MS = 15000;

// Standard providers that can be validated using core's validateApiKey
const STANDARD_VALIDATION_PROVIDERS = new Set([
  'anthropic', 'openai', 'google', 'xai', 'deepseek', 'openrouter', 'moonshot', 'zai', 'minimax'
]);

interface OllamaModel {
  id: string;
  displayName: string;
  size: number;
  toolSupport?: ToolSupportStatus;
}

const MESSAGE_BATCH_DELAY_MS = 50;

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

      forwardToRenderer('task:update:batch', {
        taskId,
        messages: batcher.pendingMessages,
      });

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
    throw new Error('Untrusted window');
  }

  const focused = BrowserWindow.getFocusedWindow();
  if (BrowserWindow.getAllWindows().length > 1 && focused && focused.id !== window.id) {
    throw new Error('IPC request must originate from the focused window');
  }

  return window;
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
      'systemPromptAppend'
    );
  }
  if (config.outputSchema && typeof config.outputSchema === 'object') {
    validated.outputSchema = config.outputSchema;
  }

  return validated;
}

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

export function registerIPCHandlers(): void {
  const taskManager = getTaskManager();

  let permissionApiInitialized = false;

  handle('task:start', async (event: IpcMainInvokeEvent, config: TaskConfig) => {
    const window = assertTrustedWindow(BrowserWindow.fromWebContents(event.sender));
    const sender = event.sender;
    const validatedConfig = validateTaskConfig(config);

    if (!isMockTaskEventsEnabled() && !hasReadyProvider()) {
      throw new Error('No provider is ready. Please connect a provider and select a model in Settings.');
    }

    if (!permissionApiInitialized) {
      initPermissionApi(window, () => taskManager.getActiveTaskId());
      startPermissionApiServer();
      startQuestionApiServer();
      permissionApiInitialized = true;
    }

    const taskId = createTaskId();

    if (isMockTaskEventsEnabled()) {
      const mockTask = createMockTask(taskId, validatedConfig.prompt);
      const scenario = detectScenarioFromPrompt(validatedConfig.prompt);

      saveTask(mockTask);

      void executeMockTaskFlow(window, {
        taskId,
        prompt: validatedConfig.prompt,
        scenario,
        delayMs: 50,
      });

      return mockTask;
    }

    const callbacks = createTaskCallbacks({
      taskId,
      window,
      sender,
      toTaskMessage,
      queueMessage,
      flushAndCleanupBatcher,
    });

    const task = await taskManager.startTask(taskId, validatedConfig, callbacks);

    const initialUserMessage: TaskMessage = {
      id: createMessageId(),
      type: 'user',
      content: validatedConfig.prompt,
      timestamp: new Date().toISOString(),
    };
    task.messages = [initialUserMessage];

    saveTask(task);

    generateTaskSummary(validatedConfig.prompt)
      .then((summary) => {
        updateTaskSummary(taskId, summary);
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
      updateTaskStatus(taskId, 'cancelled', new Date().toISOString());
      return;
    }

    if (taskManager.hasActiveTask(taskId)) {
      await taskManager.cancelTask(taskId);
      updateTaskStatus(taskId, 'cancelled', new Date().toISOString());
    }
  });

  handle('task:interrupt', async (_event: IpcMainInvokeEvent, taskId?: string) => {
    if (!taskId) return;

    if (taskManager.hasActiveTask(taskId)) {
      await taskManager.interruptTask(taskId);
    }
  });

  handle('task:get', async (_event: IpcMainInvokeEvent, taskId: string) => {
    return getTask(taskId) || null;
  });

  handle('task:list', async (_event: IpcMainInvokeEvent) => {
    return getTasks();
  });

  handle('task:delete', async (_event: IpcMainInvokeEvent, taskId: string) => {
    deleteTask(taskId);
  });

  handle('task:clear-history', async (_event: IpcMainInvokeEvent) => {
    clearHistory();
  });

  handle('task:get-todos', async (_event: IpcMainInvokeEvent, taskId: string) => {
    return getTodosForTask(taskId);
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

  handle('session:resume', async (event: IpcMainInvokeEvent, sessionId: string, prompt: string, existingTaskId?: string) => {
    const window = assertTrustedWindow(BrowserWindow.fromWebContents(event.sender));
    const sender = event.sender;
    const validatedSessionId = sanitizeString(sessionId, 'sessionId', 128);
    const validatedPrompt = sanitizeString(prompt, 'prompt');
    const validatedExistingTaskId = existingTaskId
      ? sanitizeString(existingTaskId, 'taskId', 128)
      : undefined;

    if (!isMockTaskEventsEnabled() && !hasReadyProvider()) {
      throw new Error('No provider is ready. Please connect a provider and select a model in Settings.');
    }

    const taskId = validatedExistingTaskId || createTaskId();

    if (validatedExistingTaskId) {
      const userMessage: TaskMessage = {
        id: createMessageId(),
        type: 'user',
        content: validatedPrompt,
        timestamp: new Date().toISOString(),
      };
      addTaskMessage(validatedExistingTaskId, userMessage);
    }

    const callbacks = createTaskCallbacks({
      taskId,
      window,
      sender,
      toTaskMessage,
      queueMessage,
      flushAndCleanupBatcher,
    });

    const task = await taskManager.startTask(taskId, {
      prompt: validatedPrompt,
      sessionId: validatedSessionId,
      taskId,
    }, callbacks);

    if (validatedExistingTaskId) {
      updateTaskStatus(validatedExistingTaskId, task.status, new Date().toISOString());
    }

    return task;
  });

  handle('settings:api-keys', async (_event: IpcMainInvokeEvent) => {
    const storedCredentials = await listStoredCredentials();

    const keys = storedCredentials
      .filter((credential) => credential.account.startsWith('apiKey:'))
      .map((credential) => {
        const provider = credential.account.replace('apiKey:', '');

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

  handle(
    'settings:add-api-key',
    async (_event: IpcMainInvokeEvent, provider: string, key: string, label?: string) => {
      if (!ALLOWED_API_KEY_PROVIDERS.has(provider)) {
        throw new Error('Unsupported API key provider');
      }
      const sanitizedKey = sanitizeString(key, 'apiKey', 256);
      const sanitizedLabel = label ? sanitizeString(label, 'label', 128) : undefined;

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

  handle('settings:remove-api-key', async (_event: IpcMainInvokeEvent, id: string) => {
    const sanitizedId = sanitizeString(id, 'id', 128);
    const provider = sanitizedId.replace('local-', '');
    await deleteApiKey(provider);
  });

  handle('api-key:exists', async (_event: IpcMainInvokeEvent) => {
    const apiKey = await getApiKey('anthropic');
    return Boolean(apiKey);
  });

  handle('api-key:set', async (_event: IpcMainInvokeEvent, key: string) => {
    const sanitizedKey = sanitizeString(key, 'apiKey', 256);
    await storeApiKey('anthropic', sanitizedKey);
  });

  handle('api-key:get', async (_event: IpcMainInvokeEvent) => {
    return getApiKey('anthropic');
  });

  handle('api-key:validate', async (_event: IpcMainInvokeEvent, key: string) => {
    const sanitizedKey = sanitizeString(key, 'apiKey', 256);
    console.log('[API Key] Validation requested for provider: anthropic');

    const result = await validateApiKey('anthropic', sanitizedKey, {
      timeout: API_KEY_VALIDATION_TIMEOUT_MS,
    });

    if (result.valid) {
      console.log('[API Key] Validation succeeded');
    } else {
      console.warn('[API Key] Validation failed', { error: result.error });
    }

    return result;
  });

  handle('api-key:validate-provider', async (_event: IpcMainInvokeEvent, provider: string, key: string, options?: Record<string, any>) => {
    if (!ALLOWED_API_KEY_PROVIDERS.has(provider)) {
      return { valid: false, error: 'Unsupported provider' };
    }

    console.log(`[API Key] Validation requested for provider: ${provider}`);

    // For standard providers, delegate to core's validateApiKey
    if (STANDARD_VALIDATION_PROVIDERS.has(provider)) {
      let sanitizedKey: string;
      try {
        sanitizedKey = sanitizeString(key, 'apiKey', 256);
      } catch (e) {
        return { valid: false, error: e instanceof Error ? e.message : 'Invalid API key' };
      }

      const result = await validateApiKey(provider as import('@accomplish/shared').ProviderType, sanitizedKey, {
        timeout: API_KEY_VALIDATION_TIMEOUT_MS,
        baseUrl: provider === 'openai' ? getOpenAiBaseUrl().trim() || undefined : undefined,
        zaiRegion: provider === 'zai' ? (options?.region as import('@accomplish/shared').ZaiRegion) || 'international' : undefined,
      });

      if (result.valid) {
        console.log(`[API Key] Validation succeeded for ${provider}`);
      } else {
        console.warn(`[API Key] Validation failed for ${provider}`, { error: result.error });
      }

      return result;
    }

    // Handle azure-foundry with special Entra ID handling
    if (provider === 'azure-foundry') {
      const config = getAzureFoundryConfig();
      const baseUrl = options?.baseUrl || config?.baseUrl;
      const deploymentName = options?.deploymentName || config?.deploymentName;
      const authType = options?.authType || config?.authType || 'api-key';

      let entraToken = '';
      let sanitizedKey = '';

      if (authType === 'entra-id') {
        if (options?.baseUrl && options?.deploymentName) {
          const tokenResult = await getAzureEntraToken();
          if (!tokenResult.success) {
            return { valid: false, error: tokenResult.error };
          }
          entraToken = tokenResult.token;
        } else {
          return { valid: true };
        }
      } else {
        try {
          sanitizedKey = sanitizeString(key, 'apiKey', 256);
        } catch (e) {
          return { valid: false, error: e instanceof Error ? e.message : 'Invalid API key' };
        }
      }

      if (!baseUrl || !deploymentName) {
        console.log('[API Key] Skipping validation for azure-foundry provider (missing config or options)');
        return { valid: true };
      }

      const cleanBaseUrl = baseUrl.replace(/\/+$/, '');
      const testUrl = `${cleanBaseUrl}/openai/deployments/${deploymentName}/chat/completions?api-version=2023-05-15`;

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

      try {
        let response = await fetchWithTimeout(
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

        if (!response.ok) {
          const firstErrorData = await response.json().catch(() => ({}));
          const firstErrorMessage = (firstErrorData as { error?: { message?: string } })?.error?.message || '';

          if (firstErrorMessage.includes('max_completion_tokens')) {
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
            return { valid: false, error: firstErrorMessage || `API returned status ${response.status}` };
          }
        }

        if (response.ok) {
          console.log(`[API Key] Validation succeeded for ${provider}`);
          return { valid: true };
        }

        const errorData = await response.json().catch(() => ({}));
        const errorMessage = (errorData as { error?: { message?: string } })?.error?.message || `API returned status ${response.status}`;
        console.warn(`[API Key] Validation failed for ${provider}`, { error: errorMessage });
        return { valid: false, error: errorMessage };
      } catch (error) {
        console.error(`[API Key] Validation error for ${provider}`, { error: error instanceof Error ? error.message : String(error) });
        if (error instanceof Error && error.name === 'AbortError') {
          return { valid: false, error: 'Request timed out. Please check your internet connection and try again.' };
        }
        return { valid: false, error: 'Failed to validate API key. Check your internet connection.' };
      }
    }

    // For local servers and other providers that don't need validation
    // (ollama, lmstudio, litellm, bedrock, elevenlabs, custom)
    console.log(`[API Key] Skipping validation for ${provider} (local/custom provider)`);
    return { valid: true };
  });

  handle('bedrock:validate', async (_event: IpcMainInvokeEvent, credentials: string) => {
    console.log('[Bedrock] Validation requested');

    const parseResult = safeParseJson<BedrockCredentials>(credentials);
    if (!parseResult.success) {
      console.warn('[Bedrock] Failed to parse credentials:', parseResult.error);
      return { valid: false, error: 'Failed to parse credentials' };
    }
    const parsed = parseResult.data;
    let client: BedrockClient;
    let cleanupEnv: (() => void) | null = null;

    if (parsed.authType === 'apiKey') {
      const originalToken = process.env.AWS_BEARER_TOKEN_BEDROCK;
      process.env.AWS_BEARER_TOKEN_BEDROCK = parsed.apiKey;
      cleanupEnv = () => {
        if (originalToken !== undefined) {
          process.env.AWS_BEARER_TOKEN_BEDROCK = originalToken;
        } else {
          delete process.env.AWS_BEARER_TOKEN_BEDROCK;
        }
      };
      client = new BedrockClient({
        region: parsed.region || 'us-east-1',
      });
    } else if (parsed.authType === 'accessKeys') {
      if (!parsed.accessKeyId || !parsed.secretAccessKey) {
        return { valid: false, error: 'Access Key ID and Secret Access Key are required' };
      }
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
      client = new BedrockClient({
        region: parsed.region || 'us-east-1',
        credentials: fromIni({ profile: parsed.profileName || 'default' }),
      });
    } else {
      return { valid: false, error: 'Invalid authentication type' };
    }

    try {
      const command = new ListFoundationModelsCommand({});
      await client.send(command);

      return { valid: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Validation failed';

      if (message.includes('UnrecognizedClientException') || message.includes('InvalidSignatureException')) {
        return { valid: false, error: 'Invalid AWS credentials. Please check your Access Key ID and Secret Access Key.' };
      }
      if (message.includes('AccessDeniedException')) {
        return { valid: false, error: 'Access denied. Ensure your AWS credentials have Bedrock permissions.' };
      }
      if (message.includes('could not be found')) {
        return { valid: false, error: 'AWS profile not found. Check your ~/.aws/credentials file.' };
      }
      if (message.includes('InvalidBearerTokenException') || message.includes('bearer token')) {
        return { valid: false, error: 'Invalid Bedrock API key. Please check your API key and try again.' };
      }

      return { valid: false, error: message };
    } finally {
      cleanupEnv?.();
    }
  });

  handle('bedrock:fetch-models', async (_event: IpcMainInvokeEvent, credentialsJson: string) => {
    try {
      const credentials = JSON.parse(credentialsJson) as BedrockCredentials;

      let bedrockClient: BedrockClient;
      let originalToken: string | undefined;

      if (credentials.authType === 'apiKey') {
        originalToken = process.env.AWS_BEARER_TOKEN_BEDROCK;
        process.env.AWS_BEARER_TOKEN_BEDROCK = credentials.apiKey;
        bedrockClient = new BedrockClient({
          region: credentials.region || 'us-east-1',
        });
      } else if (credentials.authType === 'accessKeys') {
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

      try {
        const command = new ListFoundationModelsCommand({});
        const response = await bedrockClient.send(command);

        const models = (response.modelSummaries || [])
          .filter(m => m.outputModalities?.includes('TEXT'))
          .map(m => ({
            id: `amazon-bedrock/${m.modelId}`,
            name: m.modelId || 'Unknown',
            provider: m.providerName || 'Unknown',
          }))
          .sort((a, b) => a.name.localeCompare(b.name));

        return { success: true, models };
      } finally {
        if (credentials.authType === 'apiKey') {
          if (originalToken !== undefined) {
            process.env.AWS_BEARER_TOKEN_BEDROCK = originalToken;
          } else {
            delete process.env.AWS_BEARER_TOKEN_BEDROCK;
          }
        }
      }
    } catch (error) {
      console.error('[Bedrock] Failed to fetch models:', error);
      return { success: false, error: normalizeIpcError(error), models: [] };
    }
  });

  handle('bedrock:save', async (_event: IpcMainInvokeEvent, credentials: string) => {
    const parsed = JSON.parse(credentials);

    if (parsed.authType === 'apiKey') {
      if (!parsed.apiKey) {
        throw new Error('API Key is required');
      }
    } else if (parsed.authType === 'accessKeys') {
      if (!parsed.accessKeyId || !parsed.secretAccessKey) {
        throw new Error('Access Key ID and Secret Access Key are required');
      }
    } else if (parsed.authType === 'profile') {
      if (!parsed.profileName) {
        throw new Error('Profile name is required');
      }
    } else {
      throw new Error('Invalid authentication type');
    }

    storeApiKey('bedrock', credentials);

    let label: string;
    let keyPrefix: string;
    if (parsed.authType === 'apiKey') {
      label = 'Bedrock API Key';
      keyPrefix = `${parsed.apiKey.substring(0, 8)}...`;
    } else if (parsed.authType === 'accessKeys') {
      label = 'AWS Access Keys';
      keyPrefix = `${parsed.accessKeyId.substring(0, 8)}...`;
    } else {
      label = `AWS Profile: ${parsed.profileName}`;
      keyPrefix = parsed.profileName;
    }

    return {
      id: 'local-bedrock',
      provider: 'bedrock',
      label,
      keyPrefix,
      isActive: true,
      createdAt: new Date().toISOString(),
    };
  });

  handle('bedrock:get-credentials', async (_event: IpcMainInvokeEvent) => {
    const stored = getApiKey('bedrock');
    if (!stored) return null;
    try {
      return JSON.parse(stored);
    } catch {
      return null;
    }
  });

  handle('api-key:clear', async (_event: IpcMainInvokeEvent) => {
    await deleteApiKey('anthropic');
  });

  handle('opencode:check', async (_event: IpcMainInvokeEvent) => {
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

  handle('opencode:version', async (_event: IpcMainInvokeEvent) => {
    return getOpenCodeCliVersion();
  });

  handle('model:get', async (_event: IpcMainInvokeEvent) => {
    return getSelectedModel();
  });

  handle('model:set', async (_event: IpcMainInvokeEvent, model: SelectedModel) => {
    if (!model || typeof model.provider !== 'string' || typeof model.model !== 'string') {
      throw new Error('Invalid model configuration');
    }
    setSelectedModel(model);
  });

  async function testOllamaModelToolSupport(
    baseUrl: string,
    modelId: string
  ): Promise<ToolSupportStatus> {
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
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testPayload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
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

      const choice = data.choices?.[0];
      if (choice?.message?.tool_calls && choice.message.tool_calls.length > 0) {
        console.log(`[Ollama] Model ${modelId} supports tools (made tool call)`);
        return 'supported';
      }

      if (choice?.finish_reason === 'tool_calls') {
        console.log(`[Ollama] Model ${modelId} supports tools (finish_reason)`);
        return 'supported';
      }
      return 'unknown';
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          console.warn(`[Ollama] Tool test timed out for ${modelId}`);
          return 'unknown';
        }
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

    try {
      validateHttpUrl(sanitizedUrl, 'Ollama URL');
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : 'Invalid URL format' };
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

      const models: OllamaModel[] = [];
      for (const m of rawModels) {
        const toolSupport = await testOllamaModelToolSupport(sanitizedUrl, m.name);
        models.push({
          id: m.name,
          displayName: m.name,
          size: m.size,
          toolSupport,
        });
      }

      return { success: true, models };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Connection failed';

      if (error instanceof Error && error.name === 'AbortError') {
        return { success: false, error: 'Connection timed out. Make sure Ollama is running.' };
      }
      return { success: false, error: `Cannot connect to Ollama: ${message}` };
    }
  });

  handle('ollama:get-config', async (_event: IpcMainInvokeEvent) => {
    return getOllamaConfig();
  });

  handle('ollama:set-config', async (_event: IpcMainInvokeEvent, config: OllamaConfig | null) => {
    if (config !== null) {
      if (typeof config.baseUrl !== 'string' || typeof config.enabled !== 'boolean') {
        throw new Error('Invalid Ollama configuration');
      }
      validateHttpUrl(config.baseUrl, 'Ollama base URL');
      if (config.lastValidated !== undefined && typeof config.lastValidated !== 'number') {
        throw new Error('Invalid Ollama configuration');
      }
      if (config.models !== undefined) {
        if (!Array.isArray(config.models)) {
          throw new Error('Invalid Ollama configuration: models must be an array');
        }
        for (const model of config.models) {
          if (typeof model.id !== 'string' || typeof model.displayName !== 'string' || typeof model.size !== 'number') {
            throw new Error('Invalid Ollama configuration: invalid model format');
          }
        }
      }
    }
    setOllamaConfig(config);
  });

  handle('azure-foundry:get-config', async (_event: IpcMainInvokeEvent) => {
    return getAzureFoundryConfig();
  });

  handle('azure-foundry:set-config', async (_event: IpcMainInvokeEvent, config: AzureFoundryConfig | null) => {
    if (config !== null) {
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
      try {
        validateHttpUrl(config.baseUrl, 'Azure Foundry base URL');
      } catch {
        throw new Error('Invalid Azure Foundry configuration: Invalid base URL format');
      }
    }
    setAzureFoundryConfig(config);
  });

  handle('azure-foundry:test-connection', async (
    _event: IpcMainInvokeEvent,
    config: { endpoint: string; deploymentName: string; authType: 'api-key' | 'entra-id'; apiKey?: string }
  ) => {
    const { endpoint, deploymentName, authType, apiKey } = config;

    let baseUrl: string;
    try {
      validateHttpUrl(endpoint, 'Azure Foundry endpoint');
      baseUrl = endpoint.replace(/\/$/, '');
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : 'Invalid endpoint URL format' };
    }

    try {
      let authHeader: string;

      if (authType === 'api-key') {
        if (!apiKey) {
          return { success: false, error: 'API key is required for API key authentication' };
        }
        authHeader = apiKey;
      } else {
        const tokenResult = await getAzureEntraToken();
        if (!tokenResult.success) {
          return { success: false, error: tokenResult.error };
        }
        authHeader = `Bearer ${tokenResult.token}`;
      }

      const testUrl = `${baseUrl}/openai/deployments/${deploymentName}/chat/completions?api-version=2024-02-15-preview`;

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

  handle('azure-foundry:save-config', async (
    _event: IpcMainInvokeEvent,
    config: { endpoint: string; deploymentName: string; authType: 'api-key' | 'entra-id'; apiKey?: string }
  ) => {
    const { endpoint, deploymentName, authType, apiKey } = config;

    if (authType === 'api-key' && apiKey) {
      storeApiKey('azure-foundry', apiKey);
    }

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

  handle('litellm:test-connection', async (_event: IpcMainInvokeEvent, url: string, apiKey?: string) => {
    const sanitizedUrl = sanitizeString(url, 'litellmUrl', 256);
    const sanitizedApiKey = apiKey ? sanitizeString(apiKey, 'apiKey', 256) : undefined;

    try {
      validateHttpUrl(sanitizedUrl, 'LiteLLM URL');
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : 'Invalid URL format' };
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
        const provider = m.id.split('/')[0] || m.owned_by || 'unknown';
        return {
          id: m.id,
          name: m.id,
          provider,
          contextLength: 0,
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
        const parts = m.id.split('/');
        const provider = parts.length > 1 ? parts[0] : (m.owned_by !== 'openai' ? m.owned_by : 'unknown') || 'unknown';

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

  handle('litellm:get-config', async (_event: IpcMainInvokeEvent) => {
    return getLiteLLMConfig();
  });

  handle('litellm:set-config', async (_event: IpcMainInvokeEvent, config: LiteLLMConfig | null) => {
    if (config !== null) {
      if (typeof config.baseUrl !== 'string' || typeof config.enabled !== 'boolean') {
        throw new Error('Invalid LiteLLM configuration');
      }
      validateHttpUrl(config.baseUrl, 'LiteLLM base URL');
      if (config.lastValidated !== undefined && typeof config.lastValidated !== 'number') {
        throw new Error('Invalid LiteLLM configuration');
      }
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
  });

  async function testLMStudioModelToolSupport(
    baseUrl: string,
    modelId: string
  ): Promise<ToolSupportStatus> {
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
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testPayload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
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

      const choice = data.choices?.[0];
      if (choice?.message?.tool_calls && choice.message.tool_calls.length > 0) {
        console.log(`[LM Studio] Model ${modelId} supports tools (made tool call)`);
        return 'supported';
      }

      if (choice?.finish_reason === 'tool_calls') {
        console.log(`[LM Studio] Model ${modelId} supports tools (finish_reason)`);
        return 'supported';
      }

      return 'unknown';
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          console.warn(`[LM Studio] Tool test timed out for ${modelId}`);
          return 'unknown';
        }
        if (error.message.includes('tool') || error.message.includes('function')) {
          console.log(`[LM Studio] Model ${modelId} does not support tools (exception)`);
          return 'unsupported';
        }
      }
      console.warn(`[LM Studio] Tool test error for ${modelId}:`, error);
      return 'unknown';
    }
  }

  handle('lmstudio:test-connection', async (_event: IpcMainInvokeEvent, url: string) => {
    const sanitizedUrl = sanitizeString(url, 'lmstudioUrl', 256);

    try {
      validateHttpUrl(sanitizedUrl, 'LM Studio URL');
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : 'Invalid URL format' };
    }

    try {
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

      const models: Array<{ id: string; name: string; toolSupport: ToolSupportStatus }> = [];

      for (const m of rawModels) {
        const displayName = m.id
          .replace(/-/g, ' ')
          .replace(/\b\w/g, (c) => c.toUpperCase());

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

  handle('lmstudio:get-config', async (_event: IpcMainInvokeEvent) => {
    return getLMStudioConfig();
  });

  handle('lmstudio:set-config', async (_event: IpcMainInvokeEvent, config: LMStudioConfig | null) => {
    if (config !== null) {
      if (typeof config.baseUrl !== 'string' || typeof config.enabled !== 'boolean') {
        throw new Error('Invalid LM Studio configuration');
      }
      validateHttpUrl(config.baseUrl, 'LM Studio base URL');
      if (config.lastValidated !== undefined && typeof config.lastValidated !== 'number') {
        throw new Error('Invalid LM Studio configuration');
      }
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
  });

  handle('api-keys:all', async (_event: IpcMainInvokeEvent) => {
    const keys = await getAllApiKeys();
    const masked: Record<string, { exists: boolean; prefix?: string }> = {};
    for (const [provider, key] of Object.entries(keys)) {
      masked[provider] = {
        exists: Boolean(key),
        prefix: key ? key.substring(0, 8) + '...' : undefined,
      };
    }
    return masked;
  });

  handle('api-keys:has-any', async (_event: IpcMainInvokeEvent) => {
    if (isMockTaskEventsEnabled()) {
      return true;
    }
    const hasKey = await hasAnyApiKey();
    if (hasKey) return true;
    return getOpenAiOauthStatus().connected;
  });

  handle('settings:debug-mode', async (_event: IpcMainInvokeEvent) => {
    return getDebugMode();
  });

  handle('settings:set-debug-mode', async (_event: IpcMainInvokeEvent, enabled: boolean) => {
    if (typeof enabled !== 'boolean') {
      throw new Error('Invalid debug mode flag');
    }
    setDebugMode(enabled);
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('settings:debug-mode-changed', { enabled });
    }
  });

  handle('settings:app-settings', async (_event: IpcMainInvokeEvent) => {
    return getAppSettings();
  });

  handle('settings:openai-base-url:get', async (_event: IpcMainInvokeEvent) => {
    return getOpenAiBaseUrl();
  });

  handle('settings:openai-base-url:set', async (_event: IpcMainInvokeEvent, baseUrl: string) => {
    if (typeof baseUrl !== 'string') {
      throw new Error('Invalid base URL');
    }

    const trimmed = baseUrl.trim();
    if (!trimmed) {
      setOpenAiBaseUrl('');
      return;
    }

    validateHttpUrl(trimmed, 'OpenAI base URL');
    setOpenAiBaseUrl(trimmed.replace(/\/+$/, ''));
  });

  handle('opencode:auth:openai:status', async (_event: IpcMainInvokeEvent) => {
    return getOpenAiOauthStatus();
  });

  handle('opencode:auth:openai:login', async (_event: IpcMainInvokeEvent) => {
    const result = await loginOpenAiWithChatGpt();
    return { ok: true, ...result };
  });

  handle('onboarding:complete', async (_event: IpcMainInvokeEvent) => {
    if (isE2ESkipAuthEnabled()) {
      return true;
    }

    if (getOnboardingComplete()) {
      return true;
    }

    const tasks = getTasks();
    if (tasks.length > 0) {
      setOnboardingComplete(true);
      return true;
    }

    return false;
  });

  handle('onboarding:set-complete', async (_event: IpcMainInvokeEvent, complete: boolean) => {
    setOnboardingComplete(complete);
  });

  handle('shell:open-external', async (_event: IpcMainInvokeEvent, url: string) => {
    try {
      validateHttpUrl(url, 'External URL');
      await shell.openExternal(url);
    } catch (error) {
      console.error('Failed to open external URL:', error);
      throw error;
    }
  });

  handle(
    'log:event',
    async (_event: IpcMainInvokeEvent, _payload: { level?: string; message?: string; context?: Record<string, unknown> }) => {
      return { ok: true };
    }
  );

  handle('speech:is-configured', async (_event: IpcMainInvokeEvent) => {
    return isElevenLabsConfigured();
  });

  handle('speech:get-config', async (_event: IpcMainInvokeEvent) => {
    const apiKey = getApiKey('elevenlabs');
    return {
      enabled: Boolean(apiKey && apiKey.trim()),
      hasApiKey: Boolean(apiKey),
      apiKeyPrefix: apiKey ? apiKey.substring(0, 8) + '...' : undefined,
    };
  });

  handle('speech:validate', async (_event: IpcMainInvokeEvent, apiKey?: string) => {
    return validateElevenLabsApiKey(apiKey);
  });

  handle('speech:transcribe', async (_event: IpcMainInvokeEvent, audioData: ArrayBuffer, mimeType?: string) => {
    console.log('[IPC] speech:transcribe received:', {
      audioDataType: typeof audioData,
      audioDataByteLength: audioData?.byteLength,
      mimeType,
    });
    const buffer = Buffer.from(audioData);
    console.log('[IPC] Converted to buffer:', { bufferLength: buffer.length });
    return transcribeAudio(buffer, mimeType);
  });
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

  handle('logs:export', async (event: IpcMainInvokeEvent) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) throw new Error('No window found');

    const collector = getLogCollector();
    collector.flush();

    const logPath = collector.getCurrentLogPath();
    const logDir = collector.getLogDir();

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const defaultFilename = `accomplish-logs-${timestamp}.txt`;

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
      if (fs.existsSync(logPath)) {
        fs.copyFileSync(logPath, result.filePath);
      } else {
        const header = `Accomplish Application Logs\nExported: ${new Date().toISOString()}\nLog Directory: ${logDir}\n\nNo logs recorded yet.\n`;
        fs.writeFileSync(result.filePath, header);
      }

      return { success: true, path: result.filePath };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: message };
    }
  });

  ipcMain.handle('skills:list', async () => {
    return skillsManager.getAll();
  });

  ipcMain.handle('skills:list-enabled', async () => {
    return skillsManager.getEnabled();
  });

  ipcMain.handle('skills:set-enabled', async (_, id: string, enabled: boolean) => {
    await skillsManager.setEnabled(id, enabled);
  });

  ipcMain.handle('skills:get-content', async (_, id: string) => {
    return skillsManager.getContent(id);
  });

  ipcMain.handle('skills:pick-file', async () => {
    const mainWindow = BrowserWindow.getAllWindows()[0];
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select a SKILL.md file',
      filters: [
        { name: 'Skill Files', extensions: ['md'] },
        { name: 'All Files', extensions: ['*'] },
      ],
      properties: ['openFile'],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0];
  });

  ipcMain.handle('skills:add-from-file', async (_, filePath: string) => {
    return skillsManager.addFromFile(filePath);
  });

  ipcMain.handle('skills:add-from-github', async (_, rawUrl: string) => {
    return skillsManager.addFromGitHub(rawUrl);
  });

  ipcMain.handle('skills:delete', async (_, id: string) => {
    await skillsManager.delete(id);
  });

  ipcMain.handle('skills:resync', async () => {
    await skillsManager.resync();
    return skillsManager.getAll();
  });

  ipcMain.handle('skills:open-in-editor', async (_, filePath: string) => {
    await shell.openPath(filePath);
  });

  ipcMain.handle('skills:show-in-folder', async (_, filePath: string) => {
    shell.showItemInFolder(filePath);
  });
}

function extractScreenshots(output: string): {
  cleanedText: string;
  attachments: Array<{ type: 'screenshot' | 'json'; data: string; label?: string }>;
} {
  const attachments: Array<{ type: 'screenshot' | 'json'; data: string; label?: string }> = [];

  const dataUrlRegex = /data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+/g;
  let match;
  while ((match = dataUrlRegex.exec(output)) !== null) {
    attachments.push({
      type: 'screenshot',
      data: match[0],
      label: 'Browser screenshot',
    });
  }

  const rawBase64Regex = /(?<![;,])(?:^|["\s])?(iVBORw0[A-Za-z0-9+/=]{100,})(?:["\s]|$)/g;
  while ((match = rawBase64Regex.exec(output)) !== null) {
    const base64Data = match[1];
    if (base64Data && base64Data.length > 100) {
      attachments.push({
        type: 'screenshot',
        data: `data:image/png;base64,${base64Data}`,
        label: 'Browser screenshot',
      });
    }
  }

  let cleanedText = output
    .replace(dataUrlRegex, '[Screenshot captured]')
    .replace(rawBase64Regex, '[Screenshot captured]');

  cleanedText = cleanedText
    .replace(/"[Screenshot captured]"/g, '"[Screenshot]"')
    .replace(/\[Screenshot captured\]\[Screenshot captured\]/g, '[Screenshot captured]');

  return { cleanedText, attachments };
}

function sanitizeToolOutput(text: string, isError: boolean): string {
  let result = text;

  result = result.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
  result = result.replace(/\x1B\[2m|\x1B\[22m|\x1B\[0m/g, '');

  result = result.replace(/ws:\/\/[^\s\]]+/g, '[connection]');

  result = result.replace(/\s*Call log:[\s\S]*/i, '');

  if (isError) {
    const timeoutMatch = result.match(/timed? ?out after (\d+)ms/i);
    if (timeoutMatch) {
      const seconds = Math.round(parseInt(timeoutMatch[1]) / 1000);
      return `Timed out after ${seconds}s`;
    }

    const protocolMatch = result.match(/Protocol error \([^)]+\):\s*(.+)/i);
    if (protocolMatch) {
      result = protocolMatch[1].trim();
    }

    result = result.replace(/^Error executing code:\s*/i, '');
    result = result.replace(/browserType\.connectOverCDP:\s*/i, '');
    result = result.replace(/\s+at\s+.+/g, '');
    result = result.replace(/\w+Error:\s*/g, '');
  }

  return result.trim();
}

function toTaskMessage(message: OpenCodeMessage): TaskMessage | null {
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

  if (message.type === 'tool_use') {
    const toolUseMsg = message as import('@accomplish/shared').OpenCodeToolUseMessage;
    const toolName = toolUseMsg.part.tool || 'unknown';
    const toolInput = toolUseMsg.part.state?.input;
    const toolOutput = toolUseMsg.part.state?.output || '';
    const status = toolUseMsg.part.state?.status;

    if (status === 'completed' || status === 'error') {
      const { cleanedText, attachments } = extractScreenshots(toolOutput);
      const isError = status === 'error';
      const sanitizedText = sanitizeToolOutput(cleanedText, isError);
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
