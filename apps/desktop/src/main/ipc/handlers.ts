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
  validateBedrockCredentials,
  fetchBedrockModels,
  validateAzureFoundry,
  testAzureFoundryConnection,
  fetchOpenRouterModels,
  testLiteLLMConnection,
  fetchLiteLLMModels,
  validateHttpUrl,
  sanitizeString,
  generateTaskSummary,
  toTaskMessage,
  queueMessage,
  flushAndCleanupBatcher,
  validateTaskConfig,
} from '@accomplish/agent-core';
import { createTaskId, createMessageId } from '@accomplish/agent-core';
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
  getActiveProviderModel,
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
  testOllamaModelToolSupport,
  testOllamaConnection,
  testLMStudioConnection,
  fetchLMStudioModels,
  validateLMStudioConfig,
} from '@accomplish/agent-core';
import { safeParseJson } from '@accomplish/agent-core';
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
} from '@accomplish/agent-core';
import { loginOpenAiWithChatGpt } from '../opencode/auth-browser';
import type { ProviderId, ConnectedProvider, BedrockCredentials } from '@accomplish/agent-core';
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
} from '@accomplish/agent-core';
import { DEFAULT_PROVIDERS, ALLOWED_API_KEY_PROVIDERS, STANDARD_VALIDATION_PROVIDERS } from '@accomplish/agent-core';
import {
  normalizeIpcError,
  permissionResponseSchema,
  resumeSessionSchema,
  taskConfigSchema,
  validate,
} from './validation';
import { createTaskCallbacks } from './task-callbacks';
import {
  isMockTaskEventsEnabled,
  createMockTask,
  executeMockTaskFlow,
  detectScenarioFromPrompt,
} from '../test-utils/mock-task-flow';
import { skillsManager } from '../skills';

const API_KEY_VALIDATION_TIMEOUT_MS = 15000;

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

    const activeModel = getActiveProviderModel();
    const selectedModel = activeModel || getSelectedModel();
    if (selectedModel?.model) {
      validatedConfig.modelId = selectedModel.model;
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

    generateTaskSummary(validatedConfig.prompt, getApiKey)
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

    const activeModelForResume = getActiveProviderModel();
    const selectedModelForResume = activeModelForResume || getSelectedModel();

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
      modelId: selectedModelForResume?.model,
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

      const result = await validateApiKey(provider as import('@accomplish/agent-core').ProviderType, sanitizedKey, {
        timeout: API_KEY_VALIDATION_TIMEOUT_MS,
        baseUrl: provider === 'openai' ? getOpenAiBaseUrl().trim() || undefined : undefined,
        zaiRegion: provider === 'zai' ? (options?.region as import('@accomplish/agent-core').ZaiRegion) || 'international' : undefined,
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
      const result = await validateAzureFoundry(config, {
        apiKey: key,
        baseUrl: options?.baseUrl,
        deploymentName: options?.deploymentName,
        authType: options?.authType,
        timeout: API_KEY_VALIDATION_TIMEOUT_MS,
      });

      if (result.valid) {
        console.log(`[API Key] Validation succeeded for ${provider}`);
      } else {
        console.warn(`[API Key] Validation failed for ${provider}`, { error: result.error });
      }

      return result;
    }

    console.log(`[API Key] Skipping validation for ${provider} (local/custom provider)`);
    return { valid: true };
  });

  handle('bedrock:validate', async (_event: IpcMainInvokeEvent, credentials: string) => {
    console.log('[Bedrock] Validation requested');
    return validateBedrockCredentials(credentials);
  });

  handle('bedrock:fetch-models', async (_event: IpcMainInvokeEvent, credentialsJson: string) => {
    try {
      const credentials = JSON.parse(credentialsJson) as BedrockCredentials;
      const result = await fetchBedrockModels(credentials);
      if (!result.success && result.error) {
        return { success: false, error: normalizeIpcError(result.error), models: [] };
      }
      return result;
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

  handle('ollama:test-connection', async (_event: IpcMainInvokeEvent, url: string) => {
    return testOllamaConnection(url);
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
    return testAzureFoundryConnection({
      endpoint: config.endpoint,
      deploymentName: config.deploymentName,
      authType: config.authType,
      apiKey: config.apiKey,
      timeout: API_KEY_VALIDATION_TIMEOUT_MS,
    });
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
    return fetchOpenRouterModels(apiKey || '', API_KEY_VALIDATION_TIMEOUT_MS);
  });

  handle('litellm:test-connection', async (_event: IpcMainInvokeEvent, url: string, apiKey?: string) => {
    return testLiteLLMConnection(url, apiKey);
  });

  handle('litellm:fetch-models', async (_event: IpcMainInvokeEvent) => {
    const config = getLiteLLMConfig();
    const apiKey = getApiKey('litellm');
    return fetchLiteLLMModels({ config, apiKey: apiKey || undefined });
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

  handle('lmstudio:test-connection', async (_event: IpcMainInvokeEvent, url: string) => {
    return testLMStudioConnection({ url });
  });

  handle('lmstudio:fetch-models', async (_event: IpcMainInvokeEvent) => {
    const config = getLMStudioConfig();
    if (!config || !config.baseUrl) {
      return { success: false, error: 'No LM Studio configured' };
    }

    return fetchLMStudioModels({ baseUrl: config.baseUrl });
  });

  handle('lmstudio:get-config', async (_event: IpcMainInvokeEvent) => {
    return getLMStudioConfig();
  });

  handle('lmstudio:set-config', async (_event: IpcMainInvokeEvent, config: LMStudioConfig | null) => {
    if (config !== null) {
      validateLMStudioConfig(config);
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

  handle('skills:list', async () => {
    return skillsManager.getAll();
  });

  handle('skills:list-enabled', async () => {
    return skillsManager.getEnabled();
  });

  handle('skills:set-enabled', async (_event, id: string, enabled: boolean) => {
    await skillsManager.setEnabled(id, enabled);
  });

  handle('skills:get-content', async (_event, id: string) => {
    return skillsManager.getContent(id);
  });

  handle('skills:pick-file', async () => {
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

  handle('skills:add-from-file', async (_event, filePath: string) => {
    return skillsManager.addFromFile(filePath);
  });

  handle('skills:add-from-github', async (_event, rawUrl: string) => {
    return skillsManager.addFromGitHub(rawUrl);
  });

  handle('skills:delete', async (_event, id: string) => {
    await skillsManager.delete(id);
  });

  handle('skills:resync', async () => {
    await skillsManager.resync();
    return skillsManager.getAll();
  });

  handle('skills:open-in-editor', async (_event, filePath: string) => {
    await shell.openPath(filePath);
  });

  handle('skills:show-in-folder', async (_event, filePath: string) => {
    shell.showItemInFolder(filePath);
  });
}
