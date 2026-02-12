/**
 * Preload Script for Local Renderer
 *
 * This preload script exposes a secure API to the local React renderer
 * for communicating with the Electron main process via IPC.
 */

import { contextBridge, ipcRenderer } from 'electron';
import type { ProviderType, Skill, TodoItem, McpConnector } from '@accomplish_ai/agent-core';

// Expose the accomplish API to the renderer
const accomplishAPI = {
  // App info
  getVersion: (): Promise<string> => ipcRenderer.invoke('app:version'),
  getPlatform: (): Promise<string> => ipcRenderer.invoke('app:platform'),

  // Shell
  openExternal: (url: string): Promise<void> =>
    ipcRenderer.invoke('shell:open-external', url),

  // Task operations
  startTask: (config: { description: string }): Promise<unknown> =>
    ipcRenderer.invoke('task:start', config),
  cancelTask: (taskId: string): Promise<void> =>
    ipcRenderer.invoke('task:cancel', taskId),
  interruptTask: (taskId: string): Promise<void> =>
    ipcRenderer.invoke('task:interrupt', taskId),
  getTask: (taskId: string): Promise<unknown> =>
    ipcRenderer.invoke('task:get', taskId),
  listTasks: (): Promise<unknown[]> => ipcRenderer.invoke('task:list'),
  deleteTask: (taskId: string): Promise<void> =>
    ipcRenderer.invoke('task:delete', taskId),
  clearTaskHistory: (): Promise<void> => ipcRenderer.invoke('task:clear-history'),
  getTodosForTask: (taskId: string): Promise<TodoItem[]> =>
    ipcRenderer.invoke('task:get-todos', taskId),

  // Permission responses
  respondToPermission: (response: { taskId: string; allowed: boolean }): Promise<void> =>
    ipcRenderer.invoke('permission:respond', response),

  // Session management
  resumeSession: (sessionId: string, prompt: string, taskId?: string): Promise<unknown> =>
    ipcRenderer.invoke('session:resume', sessionId, prompt, taskId),

  // Settings
  getApiKeys: (): Promise<unknown[]> => ipcRenderer.invoke('settings:api-keys'),
  addApiKey: (
    provider: ProviderType,
    key: string,
    label?: string
  ): Promise<unknown> =>
    ipcRenderer.invoke('settings:add-api-key', provider, key, label),
  removeApiKey: (id: string): Promise<void> =>
    ipcRenderer.invoke('settings:remove-api-key', id),
  getDebugMode: (): Promise<boolean> =>
    ipcRenderer.invoke('settings:debug-mode'),
  setDebugMode: (enabled: boolean): Promise<void> =>
    ipcRenderer.invoke('settings:set-debug-mode', enabled),
  getAppSettings: (): Promise<{ debugMode: boolean; onboardingComplete: boolean }> =>
    ipcRenderer.invoke('settings:app-settings'),
  getOpenAiBaseUrl: (): Promise<string> =>
    ipcRenderer.invoke('settings:openai-base-url:get'),
  setOpenAiBaseUrl: (baseUrl: string): Promise<void> =>
    ipcRenderer.invoke('settings:openai-base-url:set', baseUrl),
  getOpenAiOauthStatus: (): Promise<{ connected: boolean; expires?: number }> =>
    ipcRenderer.invoke('opencode:auth:openai:status'),
  loginOpenAiWithChatGpt: (): Promise<{ ok: boolean; openedUrl?: string }> =>
    ipcRenderer.invoke('opencode:auth:openai:login'),

  // API Key management (new simplified handlers)
  hasApiKey: (): Promise<boolean> =>
    ipcRenderer.invoke('api-key:exists'),
  setApiKey: (key: string): Promise<void> =>
    ipcRenderer.invoke('api-key:set', key),
  getApiKey: (): Promise<string | null> =>
    ipcRenderer.invoke('api-key:get'),
  validateApiKey: (key: string): Promise<{ valid: boolean; error?: string }> =>
    ipcRenderer.invoke('api-key:validate', key),
  validateApiKeyForProvider: (provider: string, key: string, options?: Record<string, any>): Promise<{ valid: boolean; error?: string }> =>
    ipcRenderer.invoke('api-key:validate-provider', provider, key, options),
  clearApiKey: (): Promise<void> =>
    ipcRenderer.invoke('api-key:clear'),

  // Onboarding
  getOnboardingComplete: (): Promise<boolean> =>
    ipcRenderer.invoke('onboarding:complete'),
  setOnboardingComplete: (complete: boolean): Promise<void> =>
    ipcRenderer.invoke('onboarding:set-complete', complete),

  // OpenCode CLI status
  checkOpenCodeCli: (): Promise<{
    installed: boolean;
    version: string | null;
    installCommand: string;
  }> => ipcRenderer.invoke('opencode:check'),
  getOpenCodeVersion: (): Promise<string | null> =>
    ipcRenderer.invoke('opencode:version'),

  // Model selection
  getSelectedModel: (): Promise<{ provider: string; model: string; baseUrl?: string; deploymentName?: string } | null> =>
    ipcRenderer.invoke('model:get'),
  setSelectedModel: (model: { provider: string; model: string; baseUrl?: string; deploymentName?: string }): Promise<void> =>
    ipcRenderer.invoke('model:set', model),

  // Multi-provider API keys
  getAllApiKeys: (): Promise<Record<string, { exists: boolean; prefix?: string }>> =>
    ipcRenderer.invoke('api-keys:all'),
  hasAnyApiKey: (): Promise<boolean> =>
    ipcRenderer.invoke('api-keys:has-any'),

  // Ollama configuration
  testOllamaConnection: (url: string): Promise<{
    success: boolean;
    models?: Array<{ id: string; displayName: string; size: number; toolSupport?: 'supported' | 'unsupported' | 'unknown' }>;
    error?: string;
  }> => ipcRenderer.invoke('ollama:test-connection', url),

  getOllamaConfig: (): Promise<{ baseUrl: string; enabled: boolean; lastValidated?: number; models?: Array<{ id: string; displayName: string; size: number; toolSupport?: 'supported' | 'unsupported' | 'unknown' }> } | null> =>
    ipcRenderer.invoke('ollama:get-config'),

  setOllamaConfig: (config: { baseUrl: string; enabled: boolean; lastValidated?: number; models?: Array<{ id: string; displayName: string; size: number; toolSupport?: 'supported' | 'unsupported' | 'unknown' }> } | null): Promise<void> =>
    ipcRenderer.invoke('ollama:set-config', config),

  // Azure Foundry configuration
  getAzureFoundryConfig: (): Promise<{ baseUrl: string; deploymentName: string; authType: 'api-key' | 'entra-id'; enabled: boolean; lastValidated?: number } | null> =>
    ipcRenderer.invoke('azure-foundry:get-config'),

  setAzureFoundryConfig: (config: { baseUrl: string; deploymentName: string; authType: 'api-key' | 'entra-id'; enabled: boolean; lastValidated?: number } | null): Promise<void> =>
    ipcRenderer.invoke('azure-foundry:set-config', config),

  testAzureFoundryConnection: (config: { endpoint: string; deploymentName: string; authType: 'api-key' | 'entra-id'; apiKey?: string }): Promise<{
    success: boolean;
    error?: string;
  }> => ipcRenderer.invoke('azure-foundry:test-connection', config),

  saveAzureFoundryConfig: (config: { endpoint: string; deploymentName: string; authType: 'api-key' | 'entra-id'; apiKey?: string }): Promise<void> =>
    ipcRenderer.invoke('azure-foundry:save-config', config),

  // OpenRouter configuration
  fetchOpenRouterModels: (): Promise<{
    success: boolean;
    models?: Array<{ id: string; name: string; provider: string; contextLength: number }>;
    error?: string;
  }> => ipcRenderer.invoke('openrouter:fetch-models'),

  // LiteLLM configuration
  testLiteLLMConnection: (url: string, apiKey?: string): Promise<{
    success: boolean;
    models?: Array<{ id: string; name: string; provider: string; contextLength: number }>;
    error?: string;
  }> => ipcRenderer.invoke('litellm:test-connection', url, apiKey),

  fetchLiteLLMModels: (): Promise<{
    success: boolean;
    models?: Array<{ id: string; name: string; provider: string; contextLength: number }>;
    error?: string;
  }> => ipcRenderer.invoke('litellm:fetch-models'),

  getLiteLLMConfig: (): Promise<{ baseUrl: string; enabled: boolean; lastValidated?: number; models?: Array<{ id: string; name: string; provider: string; contextLength: number }> } | null> =>
    ipcRenderer.invoke('litellm:get-config'),

  setLiteLLMConfig: (config: { baseUrl: string; enabled: boolean; lastValidated?: number; models?: Array<{ id: string; name: string; provider: string; contextLength: number }> } | null): Promise<void> =>
    ipcRenderer.invoke('litellm:set-config', config),

  // LM Studio configuration
  testLMStudioConnection: (url: string): Promise<{
    success: boolean;
    models?: Array<{ id: string; name: string; toolSupport: 'supported' | 'unsupported' | 'unknown' }>;
    error?: string;
  }> => ipcRenderer.invoke('lmstudio:test-connection', url),

  fetchLMStudioModels: (): Promise<{
    success: boolean;
    models?: Array<{ id: string; name: string; toolSupport: 'supported' | 'unsupported' | 'unknown' }>;
    error?: string;
  }> => ipcRenderer.invoke('lmstudio:fetch-models'),

  getLMStudioConfig: (): Promise<{
    baseUrl: string;
    enabled: boolean;
    lastValidated?: number;
    models?: Array<{ id: string; name: string; toolSupport: 'supported' | 'unsupported' | 'unknown' }>;
  } | null> => ipcRenderer.invoke('lmstudio:get-config'),

  setLMStudioConfig: (config: {
    baseUrl: string;
    enabled: boolean;
    lastValidated?: number;
    models?: Array<{ id: string; name: string; toolSupport: 'supported' | 'unsupported' | 'unknown' }>;
  } | null): Promise<void> => ipcRenderer.invoke('lmstudio:set-config', config),

  // Bedrock
  validateBedrockCredentials: (credentials: string) =>
    ipcRenderer.invoke('bedrock:validate', credentials),
  saveBedrockCredentials: (credentials: string) =>
    ipcRenderer.invoke('bedrock:save', credentials),
  getBedrockCredentials: () =>
    ipcRenderer.invoke('bedrock:get-credentials'),
  fetchBedrockModels: (credentials: string): Promise<{ success: boolean; models: Array<{ id: string; name: string; provider: string }>; error?: string }> =>
    ipcRenderer.invoke('bedrock:fetch-models', credentials),

  // Vertex AI
  validateVertexCredentials: (credentials: string) =>
    ipcRenderer.invoke('vertex:validate', credentials),
  saveVertexCredentials: (credentials: string) =>
    ipcRenderer.invoke('vertex:save', credentials),
  getVertexCredentials: () =>
    ipcRenderer.invoke('vertex:get-credentials'),
  fetchVertexModels: (credentials: string): Promise<{ success: boolean; models: Array<{ id: string; name: string; provider: string }>; error?: string }> =>
    ipcRenderer.invoke('vertex:fetch-models', credentials),
  detectVertexProject: (): Promise<{ success: boolean; projectId: string | null }> =>
    ipcRenderer.invoke('vertex:detect-project'),
  listVertexProjects: (): Promise<{ success: boolean; projects: Array<{ projectId: string; name: string }>; error?: string }> =>
    ipcRenderer.invoke('vertex:list-projects'),

  // E2E Testing
  isE2EMode: (): Promise<boolean> =>
    ipcRenderer.invoke('app:is-e2e-mode'),

  // New Provider Settings API
  getProviderSettings: (): Promise<unknown> =>
    ipcRenderer.invoke('provider-settings:get'),
  setActiveProvider: (providerId: string | null): Promise<void> =>
    ipcRenderer.invoke('provider-settings:set-active', providerId),
  getConnectedProvider: (providerId: string): Promise<unknown> =>
    ipcRenderer.invoke('provider-settings:get-connected', providerId),
  setConnectedProvider: (providerId: string, provider: unknown): Promise<void> =>
    ipcRenderer.invoke('provider-settings:set-connected', providerId, provider),
  removeConnectedProvider: (providerId: string): Promise<void> =>
    ipcRenderer.invoke('provider-settings:remove-connected', providerId),
  updateProviderModel: (providerId: string, modelId: string | null): Promise<void> =>
    ipcRenderer.invoke('provider-settings:update-model', providerId, modelId),
  setProviderDebugMode: (enabled: boolean): Promise<void> =>
    ipcRenderer.invoke('provider-settings:set-debug', enabled),
  getProviderDebugMode: (): Promise<boolean> =>
    ipcRenderer.invoke('provider-settings:get-debug'),

  // Event subscriptions
  onTaskUpdate: (callback: (event: unknown) => void) => {
    const listener = (_: unknown, event: unknown) => callback(event);
    ipcRenderer.on('task:update', listener);
    return () => ipcRenderer.removeListener('task:update', listener);
  },
  // Batched task updates for performance - multiple messages in single IPC call
  onTaskUpdateBatch: (callback: (event: { taskId: string; messages: unknown[] }) => void) => {
    const listener = (_: unknown, event: { taskId: string; messages: unknown[] }) => callback(event);
    ipcRenderer.on('task:update:batch', listener);
    return () => ipcRenderer.removeListener('task:update:batch', listener);
  },
  onPermissionRequest: (callback: (request: unknown) => void) => {
    const listener = (_: unknown, request: unknown) => callback(request);
    ipcRenderer.on('permission:request', listener);
    return () => ipcRenderer.removeListener('permission:request', listener);
  },
  onTaskProgress: (callback: (progress: unknown) => void) => {
    const listener = (_: unknown, progress: unknown) => callback(progress);
    ipcRenderer.on('task:progress', listener);
    return () => ipcRenderer.removeListener('task:progress', listener);
  },
  onDebugLog: (callback: (log: unknown) => void) => {
    const listener = (_: unknown, log: unknown) => callback(log);
    ipcRenderer.on('debug:log', listener);
    return () => ipcRenderer.removeListener('debug:log', listener);
  },
  // Debug mode setting changes
  onDebugModeChange: (callback: (data: { enabled: boolean }) => void) => {
    const listener = (_: unknown, data: { enabled: boolean }) => callback(data);
    ipcRenderer.on('settings:debug-mode-changed', listener);
    return () => ipcRenderer.removeListener('settings:debug-mode-changed', listener);
  },
  // Task status changes (e.g., queued -> running)
  onTaskStatusChange: (callback: (data: { taskId: string; status: string }) => void) => {
    const listener = (_: unknown, data: { taskId: string; status: string }) => callback(data);
    ipcRenderer.on('task:status-change', listener);
    return () => ipcRenderer.removeListener('task:status-change', listener);
  },
  // Task summary updates (AI-generated summary)
  onTaskSummary: (callback: (data: { taskId: string; summary: string }) => void) => {
    const listener = (_: unknown, data: { taskId: string; summary: string }) => callback(data);
    ipcRenderer.on('task:summary', listener);
    return () => ipcRenderer.removeListener('task:summary', listener);
  },
  // Todo updates from OpenCode todowrite tool
  onTodoUpdate: (callback: (data: { taskId: string; todos: Array<{ id: string; content: string; status: string; priority: string }> }) => void) => {
    const listener = (_: unknown, data: { taskId: string; todos: Array<{ id: string; content: string; status: string; priority: string }> }) => callback(data);
    ipcRenderer.on('todo:update', listener);
    return () => ipcRenderer.removeListener('todo:update', listener);
  },
  // Auth error events (e.g., OAuth token expired)
  onAuthError: (callback: (data: { providerId: string; message: string }) => void) => {
    const listener = (_: unknown, data: { providerId: string; message: string }) => callback(data);
    ipcRenderer.on('auth:error', listener);
    return () => ipcRenderer.removeListener('auth:error', listener);
  },

  logEvent: (payload: { level?: string; message: string; context?: Record<string, unknown> }) =>
    ipcRenderer.invoke('log:event', payload),

  // Export application logs
  exportLogs: (): Promise<{ success: boolean; path?: string; error?: string; reason?: string }> =>
    ipcRenderer.invoke('logs:export'),

  // Speech-to-Text API
  speechIsConfigured: (): Promise<boolean> =>
    ipcRenderer.invoke('speech:is-configured'),
  speechGetConfig: (): Promise<{ enabled: boolean; hasApiKey: boolean; apiKeyPrefix?: string }> =>
    ipcRenderer.invoke('speech:get-config'),
  speechValidate: (apiKey?: string): Promise<{ valid: boolean; error?: string }> =>
    ipcRenderer.invoke('speech:validate', apiKey),
  speechTranscribe: (audioData: ArrayBuffer, mimeType?: string): Promise<{
    success: true;
    result: { text: string; confidence?: number; duration: number; timestamp: number };
  } | {
    success: false;
    error: { code: string; message: string };
  }> => ipcRenderer.invoke('speech:transcribe', audioData, mimeType),

  // Skills management
  getSkills: (): Promise<Skill[]> => ipcRenderer.invoke('skills:list'),
  getEnabledSkills: (): Promise<Skill[]> => ipcRenderer.invoke('skills:list-enabled'),
  setSkillEnabled: (id: string, enabled: boolean): Promise<void> =>
    ipcRenderer.invoke('skills:set-enabled', id, enabled),
  getSkillContent: (id: string): Promise<string | null> =>
    ipcRenderer.invoke('skills:get-content', id),
  pickSkillFile: (): Promise<string | null> =>
    ipcRenderer.invoke('skills:pick-file'),
  addSkillFromFile: (filePath: string): Promise<Skill> =>
    ipcRenderer.invoke('skills:add-from-file', filePath),
  addSkillFromGitHub: (rawUrl: string): Promise<Skill> =>
    ipcRenderer.invoke('skills:add-from-github', rawUrl),
  deleteSkill: (id: string): Promise<void> => ipcRenderer.invoke('skills:delete', id),
  resyncSkills: (): Promise<Skill[]> => ipcRenderer.invoke('skills:resync'),
  openSkillInEditor: (filePath: string): Promise<void> => ipcRenderer.invoke('skills:open-in-editor', filePath),
  showSkillInFolder: (filePath: string): Promise<void> => ipcRenderer.invoke('skills:show-in-folder', filePath),

  // MCP Connectors
  getConnectors: (): Promise<McpConnector[]> => ipcRenderer.invoke('connectors:list'),
  addConnector: (name: string, url: string): Promise<McpConnector> =>
    ipcRenderer.invoke('connectors:add', name, url),
  deleteConnector: (id: string): Promise<void> => ipcRenderer.invoke('connectors:delete', id),
  setConnectorEnabled: (id: string, enabled: boolean): Promise<void> =>
    ipcRenderer.invoke('connectors:set-enabled', id, enabled),
  startConnectorOAuth: (connectorId: string): Promise<{ state: string; authUrl: string }> =>
    ipcRenderer.invoke('connectors:start-oauth', connectorId),
  completeConnectorOAuth: (state: string, code: string): Promise<McpConnector> =>
    ipcRenderer.invoke('connectors:complete-oauth', state, code),
  disconnectConnector: (connectorId: string): Promise<void> =>
    ipcRenderer.invoke('connectors:disconnect', connectorId),
  onMcpAuthCallback: (callback: (url: string) => void) => {
    const listener = (_: unknown, url: string) => callback(url);
    ipcRenderer.on('auth:mcp-callback', listener);
    return () => { ipcRenderer.removeListener('auth:mcp-callback', listener); };
  },
};

// Expose the API to the renderer
contextBridge.exposeInMainWorld('accomplish', accomplishAPI);

// Also expose shell info for compatibility checks
const packageVersion = process.env.npm_package_version;
if (!packageVersion) {
  throw new Error('Package version is not defined. Build is misconfigured.');
}
contextBridge.exposeInMainWorld('accomplishShell', {
  version: packageVersion,
  platform: process.platform,
  isElectron: true,
});

// Type declarations
export type AccomplishAPI = typeof accomplishAPI;
