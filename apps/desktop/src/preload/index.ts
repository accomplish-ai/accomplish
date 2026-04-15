/**
 * Preload Script for Local Renderer
 *
 * This preload script exposes a secure API to the local React renderer
 * for communicating with the Electron main process via IPC.
 */

import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { MessagingConnectionStatus } from '@accomplish_ai/agent-core/common';
import type {
  ProviderType,
  Skill,
  TodoItem,
  McpConnector,
  Workspace,
  WorkspaceCreateInput,
  WorkspaceUpdateInput,
  KnowledgeNote,
  KnowledgeNoteCreateInput,
  KnowledgeNoteUpdateInput,
} from '@accomplish_ai/agent-core';
import type { CloudBrowserConfig, GoogleAccount } from '@accomplish_ai/agent-core/common';

// Safe analytics IPC invoke — silently catches "No handler" errors for OSS builds
// where analytics IPC handlers are not registered.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const analyticsInvoke = (channel: string, ...args: any[]): Promise<void> =>
  ipcRenderer.invoke(channel, ...args).catch(() => {});

// Expose the accomplish API to the renderer
const accomplishAPI = {
  // Utility for safely extracting native paths from DOM File objects in drop events
  getFilePath: (file: File): string => webUtils.getPathForFile(file),
  // App info
  getVersion: (): Promise<string> => ipcRenderer.invoke('app:version'),
  getPlatform: (): Promise<string> => ipcRenderer.invoke('app:platform'),

  // Shell
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('shell:open-external', url),

  // Task operations
  startTask: (config: { description: string }): Promise<unknown> =>
    ipcRenderer.invoke('task:start', config),
  cancelTask: (taskId: string): Promise<void> => ipcRenderer.invoke('task:cancel', taskId),
  interruptTask: (taskId: string): Promise<void> => ipcRenderer.invoke('task:interrupt', taskId),
  getTask: (taskId: string): Promise<unknown> => ipcRenderer.invoke('task:get', taskId),
  listTasks: (): Promise<unknown[]> => ipcRenderer.invoke('task:list'),
  deleteTask: (taskId: string): Promise<void> => ipcRenderer.invoke('task:delete', taskId),
  clearTaskHistory: (): Promise<void> => ipcRenderer.invoke('task:clear-history'),
  getTodosForTask: (taskId: string): Promise<TodoItem[]> =>
    ipcRenderer.invoke('task:get-todos', taskId),

  // Permission responses
  respondToPermission: (response: { taskId: string; allowed: boolean }): Promise<void> =>
    ipcRenderer.invoke('permission:respond', response),

  // Session management
  resumeSession: (
    sessionId: string,
    prompt: string,
    taskId?: string,
    attachments?: unknown[],
  ): Promise<unknown> =>
    ipcRenderer.invoke('session:resume', sessionId, prompt, taskId, attachments),

  // Settings
  getApiKeys: (): Promise<unknown[]> => ipcRenderer.invoke('settings:api-keys'),
  addApiKey: (provider: ProviderType, key: string, label?: string): Promise<unknown> =>
    ipcRenderer.invoke('settings:add-api-key', provider, key, label),
  removeApiKey: (id: string): Promise<void> => ipcRenderer.invoke('settings:remove-api-key', id),
  getNotificationsEnabled: (): Promise<boolean> =>
    ipcRenderer.invoke('settings:notifications-enabled'),
  setNotificationsEnabled: (enabled: boolean): Promise<void> =>
    ipcRenderer.invoke('settings:set-notifications-enabled', enabled),
  getDebugMode: (): Promise<boolean> => ipcRenderer.invoke('settings:debug-mode'),
  setDebugMode: (enabled: boolean): Promise<void> =>
    ipcRenderer.invoke('settings:set-debug-mode', enabled),
  getTheme: (): Promise<string> => ipcRenderer.invoke('settings:theme'),
  setTheme: (theme: string): Promise<void> => ipcRenderer.invoke('settings:set-theme', theme),
  getLanguage: (): Promise<string> => ipcRenderer.invoke('settings:language'),
  setLanguage: (language: string): Promise<void> =>
    ipcRenderer.invoke('settings:set-language', language),
  onThemeChange: (callback: (data: { theme: string; resolved: string }) => void) => {
    const listener = (_: unknown, data: { theme: string; resolved: string }) => callback(data);
    ipcRenderer.on('settings:theme-changed', listener);
    return () => ipcRenderer.removeListener('settings:theme-changed', listener);
  },
  getAppSettings: (): Promise<{
    debugMode: boolean;
    onboardingComplete: boolean;
    theme: string;
    language: string;
  }> => ipcRenderer.invoke('settings:app-settings'),
  getCloudBrowserConfig: (): Promise<CloudBrowserConfig | null> =>
    ipcRenderer.invoke('settings:cloud-browser-config:get'),
  setCloudBrowserConfig: (config: CloudBrowserConfig | null): Promise<void> =>
    ipcRenderer.invoke('settings:cloud-browser-config:set', config ? JSON.stringify(config) : null),
  getOpenAiBaseUrl: (): Promise<string> => ipcRenderer.invoke('settings:openai-base-url:get'),
  setOpenAiBaseUrl: (baseUrl: string): Promise<void> =>
    ipcRenderer.invoke('settings:openai-base-url:set', baseUrl),
  getOpenAiOauthStatus: (): Promise<{ connected: boolean; expires?: number }> =>
    ipcRenderer.invoke('opencode:auth:openai:status'),
  loginOpenAiWithChatGpt: (): Promise<{ ok: boolean; openedUrl?: string }> =>
    ipcRenderer.invoke('opencode:auth:openai:login'),
  getSlackMcpOauthStatus: (): Promise<{ connected: boolean; pendingAuthorization: boolean }> =>
    ipcRenderer.invoke('opencode:auth:slack:status'),
  loginSlackMcp: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('opencode:auth:slack:login'),
  logoutSlackMcp: (): Promise<void> => ipcRenderer.invoke('opencode:auth:slack:logout'),
  getCopilotOAuthStatus: (): Promise<{
    connected: boolean;
    username?: string;
    expiresAt?: number;
  }> => ipcRenderer.invoke('opencode:auth:copilot:status'),
  loginGithubCopilot: (): Promise<{
    ok: boolean;
    userCode?: string;
    verificationUri?: string;
    expiresIn?: number;
  }> => ipcRenderer.invoke('opencode:auth:copilot:login'),
  logoutGithubCopilot: (): Promise<void> => ipcRenderer.invoke('opencode:auth:copilot:logout'),

  // API Key management (new simplified handlers)
  hasApiKey: (): Promise<boolean> => ipcRenderer.invoke('api-key:exists'),
  setApiKey: (key: string): Promise<void> => ipcRenderer.invoke('api-key:set', key),
  getApiKey: (): Promise<string | null> => ipcRenderer.invoke('api-key:get'),
  validateApiKey: (key: string): Promise<{ valid: boolean; error?: string }> =>
    ipcRenderer.invoke('api-key:validate', key),
  validateApiKeyForProvider: (
    provider: string,
    key: string,
    options?: Record<string, unknown>,
  ): Promise<{ valid: boolean; error?: string }> =>
    ipcRenderer.invoke('api-key:validate-provider', provider, key, options),
  clearApiKey: (): Promise<void> => ipcRenderer.invoke('api-key:clear'),

  // Onboarding
  getOnboardingComplete: (): Promise<boolean> => ipcRenderer.invoke('onboarding:complete'),
  setOnboardingComplete: (complete: boolean): Promise<void> =>
    ipcRenderer.invoke('onboarding:set-complete', complete),

  // OpenCode CLI status
  checkOpenCodeCli: (): Promise<{
    installed: boolean;
    version: string | null;
    installCommand: string;
  }> => ipcRenderer.invoke('opencode:check'),
  getOpenCodeVersion: (): Promise<string | null> => ipcRenderer.invoke('opencode:version'),

  // Model selection
  getSelectedModel: (): Promise<{
    provider: string;
    model: string;
    baseUrl?: string;
    deploymentName?: string;
  } | null> => ipcRenderer.invoke('model:get'),
  setSelectedModel: (model: {
    provider: string;
    model: string;
    baseUrl?: string;
    deploymentName?: string;
  }): Promise<void> => ipcRenderer.invoke('model:set', model),

  // Multi-provider API keys
  getAllApiKeys: (): Promise<Record<string, { exists: boolean; prefix?: string }>> =>
    ipcRenderer.invoke('api-keys:all'),
  hasAnyApiKey: (): Promise<boolean> => ipcRenderer.invoke('api-keys:has-any'),

  // Ollama configuration
  testOllamaConnection: (
    url: string,
  ): Promise<{
    success: boolean;
    models?: Array<{
      id: string;
      displayName: string;
      size: number;
      toolSupport?: 'supported' | 'unsupported' | 'unknown';
    }>;
    error?: string;
  }> => ipcRenderer.invoke('ollama:test-connection', url),

  getOllamaConfig: (): Promise<{
    baseUrl: string;
    enabled: boolean;
    lastValidated?: number;
    models?: Array<{
      id: string;
      displayName: string;
      size: number;
      toolSupport?: 'supported' | 'unsupported' | 'unknown';
    }>;
  } | null> => ipcRenderer.invoke('ollama:get-config'),

  setOllamaConfig: (
    config: {
      baseUrl: string;
      enabled: boolean;
      lastValidated?: number;
      models?: Array<{
        id: string;
        displayName: string;
        size: number;
        toolSupport?: 'supported' | 'unsupported' | 'unknown';
      }>;
    } | null,
  ): Promise<void> => ipcRenderer.invoke('ollama:set-config', config),

  // Azure Foundry configuration
  getAzureFoundryConfig: (): Promise<{
    baseUrl: string;
    deploymentName: string;
    authType: 'api-key' | 'entra-id';
    enabled: boolean;
    lastValidated?: number;
  } | null> => ipcRenderer.invoke('azure-foundry:get-config'),

  setAzureFoundryConfig: (
    config: {
      baseUrl: string;
      deploymentName: string;
      authType: 'api-key' | 'entra-id';
      enabled: boolean;
      lastValidated?: number;
    } | null,
  ): Promise<void> => ipcRenderer.invoke('azure-foundry:set-config', config),

  testAzureFoundryConnection: (config: {
    endpoint: string;
    deploymentName: string;
    authType: 'api-key' | 'entra-id';
    apiKey?: string;
  }): Promise<{
    success: boolean;
    error?: string;
  }> => ipcRenderer.invoke('azure-foundry:test-connection', config),

  saveAzureFoundryConfig: (config: {
    endpoint: string;
    deploymentName: string;
    authType: 'api-key' | 'entra-id';
    apiKey?: string;
  }): Promise<void> => ipcRenderer.invoke('azure-foundry:save-config', config),

  // Dynamic model fetching (generic, config-driven)
  fetchProviderModels: (
    providerId: string,
    options?: { baseUrl?: string; zaiRegion?: string },
  ): Promise<{
    success: boolean;
    models?: Array<{ id: string; name: string }>;
    error?: string;
  }> => ipcRenderer.invoke('provider:fetch-models', providerId, options),

  // OpenRouter configuration
  fetchOpenRouterModels: (): Promise<{
    success: boolean;
    models?: Array<{ id: string; name: string; provider: string; contextLength: number }>;
    error?: string;
  }> => ipcRenderer.invoke('openrouter:fetch-models'),

  // LiteLLM configuration
  testLiteLLMConnection: (
    url: string,
    apiKey?: string,
  ): Promise<{
    success: boolean;
    models?: Array<{ id: string; name: string; provider: string; contextLength: number }>;
    error?: string;
  }> => ipcRenderer.invoke('litellm:test-connection', url, apiKey),

  fetchLiteLLMModels: (): Promise<{
    success: boolean;
    models?: Array<{ id: string; name: string; provider: string; contextLength: number }>;
    error?: string;
  }> => ipcRenderer.invoke('litellm:fetch-models'),

  getLiteLLMConfig: (): Promise<{
    baseUrl: string;
    enabled: boolean;
    lastValidated?: number;
    models?: Array<{ id: string; name: string; provider: string; contextLength: number }>;
  } | null> => ipcRenderer.invoke('litellm:get-config'),

  setLiteLLMConfig: (
    config: {
      baseUrl: string;
      enabled: boolean;
      lastValidated?: number;
      models?: Array<{ id: string; name: string; provider: string; contextLength: number }>;
    } | null,
  ): Promise<void> => ipcRenderer.invoke('litellm:set-config', config),

  // LM Studio configuration
  testLMStudioConnection: (
    url: string,
  ): Promise<{
    success: boolean;
    models?: Array<{
      id: string;
      name: string;
      toolSupport: 'supported' | 'unsupported' | 'unknown';
    }>;
    error?: string;
  }> => ipcRenderer.invoke('lmstudio:test-connection', url),

  fetchLMStudioModels: (): Promise<{
    success: boolean;
    models?: Array<{
      id: string;
      name: string;
      toolSupport: 'supported' | 'unsupported' | 'unknown';
    }>;
    error?: string;
  }> => ipcRenderer.invoke('lmstudio:fetch-models'),

  getLMStudioConfig: (): Promise<{
    baseUrl: string;
    enabled: boolean;
    lastValidated?: number;
    models?: Array<{
      id: string;
      name: string;
      toolSupport: 'supported' | 'unsupported' | 'unknown';
    }>;
  } | null> => ipcRenderer.invoke('lmstudio:get-config'),

  setLMStudioConfig: (
    config: {
      baseUrl: string;
      enabled: boolean;
      lastValidated?: number;
      models?: Array<{
        id: string;
        name: string;
        toolSupport: 'supported' | 'unsupported' | 'unknown';
      }>;
    } | null,
  ): Promise<void> => ipcRenderer.invoke('lmstudio:set-config', config),

  // NVIDIA NIM configuration
  testNimConnection: (
    url: string,
    apiKey: string,
  ): Promise<{
    success: boolean;
    models?: Array<{ id: string; name: string; provider: string; contextLength: number }>;
    error?: string;
  }> => ipcRenderer.invoke('nim:test-connection', url, apiKey),

  fetchNimModels: (): Promise<{
    success: boolean;
    models?: Array<{ id: string; name: string; provider: string; contextLength: number }>;
    error?: string;
  }> => ipcRenderer.invoke('nim:fetch-models'),

  // Custom OpenAI-compatible endpoint configuration
  testCustomConnection: (
    baseUrl: string,
    apiKey?: string,
  ): Promise<{
    success: boolean;
    error?: string;
  }> => ipcRenderer.invoke('custom:test-connection', baseUrl, apiKey),

  // Bedrock
  validateBedrockCredentials: (credentials: string) =>
    ipcRenderer.invoke('bedrock:validate', credentials),
  saveBedrockCredentials: (credentials: string) => ipcRenderer.invoke('bedrock:save', credentials),
  getBedrockCredentials: () => ipcRenderer.invoke('bedrock:get-credentials'),
  fetchBedrockModels: (
    credentials: string,
  ): Promise<{
    success: boolean;
    models: Array<{ id: string; name: string; provider: string }>;
    error?: string;
  }> => ipcRenderer.invoke('bedrock:fetch-models', credentials),

  // Vertex AI
  validateVertexCredentials: (credentials: string) =>
    ipcRenderer.invoke('vertex:validate', credentials),
  saveVertexCredentials: (credentials: string) => ipcRenderer.invoke('vertex:save', credentials),
  getVertexCredentials: () => ipcRenderer.invoke('vertex:get-credentials'),
  fetchVertexModels: (
    credentials: string,
  ): Promise<{
    success: boolean;
    models: Array<{ id: string; name: string; provider: string }>;
    error?: string;
  }> => ipcRenderer.invoke('vertex:fetch-models', credentials),
  detectVertexProject: (): Promise<{ success: boolean; projectId: string | null }> =>
    ipcRenderer.invoke('vertex:detect-project'),
  listVertexProjects: (): Promise<{
    success: boolean;
    projects: Array<{ projectId: string; name: string }>;
    error?: string;
  }> => ipcRenderer.invoke('vertex:list-projects'),

  // E2E Testing
  isE2EMode: (): Promise<boolean> => ipcRenderer.invoke('app:is-e2e-mode'),

  // New Provider Settings API
  getProviderSettings: (): Promise<unknown> => ipcRenderer.invoke('provider-settings:get'),
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
  getProviderDebugMode: (): Promise<boolean> => ipcRenderer.invoke('provider-settings:get-debug'),

  // Event subscriptions
  onTaskUpdate: (callback: (event: unknown) => void) => {
    const listener = (_: unknown, event: unknown) => callback(event);
    ipcRenderer.on('task:update', listener);
    return () => ipcRenderer.removeListener('task:update', listener);
  },
  // Batched task updates for performance - multiple messages in single IPC call
  onTaskUpdateBatch: (callback: (event: { taskId: string; messages: unknown[] }) => void) => {
    const listener = (_: unknown, event: { taskId: string; messages: unknown[] }) =>
      callback(event);
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
  onTodoUpdate: (
    callback: (data: {
      taskId: string;
      todos: Array<{ id: string; content: string; status: string; priority: string }>;
    }) => void,
  ) => {
    const listener = (
      _: unknown,
      data: {
        taskId: string;
        todos: Array<{ id: string; content: string; status: string; priority: string }>;
      },
    ) => callback(data);
    ipcRenderer.on('todo:update', listener);
    return () => ipcRenderer.removeListener('todo:update', listener);
  },
  // Auth error events (e.g., OAuth token expired)
  onAuthError: (callback: (data: { providerId: string; message: string }) => void) => {
    const listener = (_: unknown, data: { providerId: string; message: string }) => callback(data);
    ipcRenderer.on('auth:error', listener);
    return () => ipcRenderer.removeListener('auth:error', listener);
  },

  // ─── Browser Preview API (ENG-695) ─────────────────────────────────────────
  // Contributed by dhruvawani17 (PR #489) and samarthsinh2660 (PR #414).

  /**
   * Subscribe to live browser frame events emitted by dev-browser-mcp via CDP screencast.
   * Returns an unsubscribe function.
   */
  onBrowserFrame: (
    callback: (event: {
      taskId: string;
      pageName: string;
      frame: string;
      timestamp: number;
    }) => void,
  ) => {
    const listener = (_: unknown, event: unknown) =>
      callback(
        event as {
          taskId: string;
          pageName: string;
          frame: string;
          timestamp: number;
        },
      );
    ipcRenderer.on('browser:frame', listener);
    return () => ipcRenderer.removeListener('browser:frame', listener);
  },

  /** Subscribe to browser navigation events (URL changes). */
  onBrowserNavigate: (
    callback: (event: { taskId: string; pageName: string; url: string }) => void,
  ) => {
    const listener = (_: unknown, event: unknown) =>
      callback(event as { taskId: string; pageName: string; url: string });
    ipcRenderer.on('browser:navigate', listener);
    return () => ipcRenderer.removeListener('browser:navigate', listener);
  },

  /** Subscribe to browser status change events (starting / streaming / stopped / error). */
  onBrowserStatus: (
    callback: (event: {
      taskId: string;
      pageName: string;
      status: string;
      message?: string;
    }) => void,
  ) => {
    const listener = (_: unknown, event: unknown) =>
      callback(
        event as {
          taskId: string;
          pageName: string;
          status: string;
          message?: string;
        },
      );
    ipcRenderer.on('browser:status', listener);
    return () => ipcRenderer.removeListener('browser:status', listener);
  },

  /** Start a browser preview stream for a given task and page. */
  startBrowserPreview: (taskId: string, pageName?: string): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('browser-preview:start', taskId, pageName),

  /** Stop the browser preview stream for a given task. */
  stopBrowserPreview: (taskId: string): Promise<{ stopped: boolean }> =>
    ipcRenderer.invoke('browser-preview:stop', taskId),

  /** Check whether any browser preview stream is currently active. */
  getBrowserPreviewStatus: (): Promise<{ active: boolean }> =>
    ipcRenderer.invoke('browser-preview:status'),

  // ───────────────────────────────────────────────────────────────────────────

  logEvent: (payload: { level?: string; message: string; context?: Record<string, unknown> }) =>
    ipcRenderer.invoke('log:event', payload),

  // Export application logs
  exportLogs: (): Promise<{ success: boolean; path?: string; error?: string; reason?: string }> =>
    ipcRenderer.invoke('logs:export'),

  // Speech-to-Text API
  speechIsConfigured: (): Promise<boolean> => ipcRenderer.invoke('speech:is-configured'),
  speechGetConfig: (): Promise<{ enabled: boolean; hasApiKey: boolean; apiKeyPrefix?: string }> =>
    ipcRenderer.invoke('speech:get-config'),
  speechValidate: (apiKey?: string): Promise<{ valid: boolean; error?: string }> =>
    ipcRenderer.invoke('speech:validate', apiKey),
  speechTranscribe: (
    audioData: ArrayBuffer,
    mimeType?: string,
  ): Promise<
    | {
        success: true;
        result: { text: string; confidence?: number; duration: number; timestamp: number };
      }
    | {
        success: false;
        error: { code: string; message: string };
      }
  > => ipcRenderer.invoke('speech:transcribe', audioData, mimeType),

  // Skills management
  getSkills: (): Promise<Skill[]> => ipcRenderer.invoke('skills:list'),
  getEnabledSkills: (): Promise<Skill[]> => ipcRenderer.invoke('skills:list-enabled'),
  setSkillEnabled: (id: string, enabled: boolean): Promise<void> =>
    ipcRenderer.invoke('skills:set-enabled', id, enabled),
  getSkillContent: (id: string): Promise<string | null> =>
    ipcRenderer.invoke('skills:get-content', id),
  getUserSkillsPath: (): Promise<string> => ipcRenderer.invoke('skills:get-user-skills-path'),
  pickSkillFolder: (): Promise<string | null> => ipcRenderer.invoke('skills:pick-folder'),
  addSkillFromFolder: (folderPath: string): Promise<Skill | null> =>
    ipcRenderer.invoke('skills:add-from-folder', folderPath),
  addSkillFromGitHub: (rawUrl: string): Promise<Skill> =>
    ipcRenderer.invoke('skills:add-from-github', rawUrl),
  deleteSkill: (id: string): Promise<void> => ipcRenderer.invoke('skills:delete', id),
  resyncSkills: (): Promise<Skill[]> => ipcRenderer.invoke('skills:resync'),
  openSkillInEditor: (filePath: string): Promise<void> =>
    ipcRenderer.invoke('skills:open-in-editor', filePath),
  showSkillInFolder: (filePath: string): Promise<void> =>
    ipcRenderer.invoke('skills:show-in-folder', filePath),

  // Daemon
  getDaemonSocketPath: (): Promise<string> => ipcRenderer.invoke('daemon:get-socket-path'),

  // Daemon control
  daemonPing: (): Promise<{ status: string; uptime: number }> => ipcRenderer.invoke('daemon:ping'),
  daemonRestart: (): Promise<{ success: boolean }> => ipcRenderer.invoke('daemon:restart'),
  daemonStop: (): Promise<{ success: boolean }> => ipcRenderer.invoke('daemon:stop'),
  daemonStart: (): Promise<{ success: boolean }> => ipcRenderer.invoke('daemon:start'),

  // Close behavior
  getCloseBehavior: (): Promise<string> => ipcRenderer.invoke('daemon:get-close-behavior'),
  setCloseBehavior: (behavior: string): Promise<void> =>
    ipcRenderer.invoke('daemon:set-close-behavior', behavior),

  // Daemon connection events
  onDaemonDisconnected: (callback: () => void): (() => void) => {
    const listener = () => callback();
    ipcRenderer.on('daemon:disconnected', listener);
    return () => ipcRenderer.removeListener('daemon:disconnected', listener);
  },
  onDaemonReconnected: (callback: () => void): (() => void) => {
    const listener = () => callback();
    ipcRenderer.on('daemon:reconnected', listener);
    return () => ipcRenderer.removeListener('daemon:reconnected', listener);
  },
  onDaemonReconnectFailed: (callback: () => void): (() => void) => {
    const listener = () => callback();
    ipcRenderer.on('daemon:reconnect-failed', listener);
    return () => ipcRenderer.removeListener('daemon:reconnect-failed', listener);
  },

  // Favorites
  addFavorite: (taskId: string): Promise<void> => ipcRenderer.invoke('favorites:add', taskId),
  removeFavorite: (taskId: string): Promise<void> => ipcRenderer.invoke('favorites:remove', taskId),
  listFavorites: (): Promise<unknown[]> => ipcRenderer.invoke('favorites:list'),
  isFavorite: (taskId: string): Promise<boolean> => ipcRenderer.invoke('favorites:has', taskId),

  // File attachments
  pickFolder: (): Promise<string | null> => ipcRenderer.invoke('files:pick-folder'),
  pickFiles: (): Promise<import('@accomplish_ai/agent-core/common').FileAttachmentInfo[]> =>
    ipcRenderer.invoke('files:pick'),
  processDroppedFiles: (
    paths: string[],
  ): Promise<import('@accomplish_ai/agent-core/common').FileAttachmentInfo[]> =>
    ipcRenderer.invoke('files:process-dropped', paths),

  // Sandbox configuration
  getSandboxConfig: (): Promise<{
    mode: 'disabled' | 'native' | 'docker';
    allowedPaths: string[];
    networkRestricted: boolean;
    allowedHosts: string[];
    dockerImage?: string;
    networkPolicy?: { allowOutbound: boolean; allowedHosts?: string[] };
  }> => ipcRenderer.invoke('sandbox:get-config'),
  setSandboxConfig: (config: {
    mode: 'disabled' | 'native' | 'docker';
    allowedPaths: string[];
    networkRestricted: boolean;
    allowedHosts: string[];
    dockerImage?: string;
    networkPolicy?: { allowOutbound: boolean; allowedHosts?: string[] };
  }): Promise<void> => ipcRenderer.invoke('sandbox:set-config', config),

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
    return () => {
      ipcRenderer.removeListener('auth:mcp-callback', listener);
    };
  },

  // HuggingFace Local configuration (ENG-687)
  startHuggingFaceServer: (
    modelId: string,
  ): Promise<{ success: boolean; port?: number; error?: string }> =>
    ipcRenderer.invoke('huggingface-local:start-server', modelId),
  stopHuggingFaceServer: (): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('huggingface-local:stop-server'),
  getHuggingFaceServerStatus: (): Promise<{
    running: boolean;
    port: number | null;
    loadedModel: string | null;
    isLoading: boolean;
  }> => ipcRenderer.invoke('huggingface-local:server-status'),
  getHuggingFaceLocalConfig: (): Promise<{
    selectedModelId: string | null;
    serverPort: number | null;
    enabled: boolean;
  } | null> => ipcRenderer.invoke('huggingface-local:get-config'),
  setHuggingFaceLocalConfig: (
    config: {
      selectedModelId: string | null;
      serverPort: number | null;
      enabled: boolean;
    } | null,
  ): Promise<void> => ipcRenderer.invoke('huggingface-local:set-config', config),
  testHuggingFaceConnection: (): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('huggingface-local:test-connection'),
  downloadHuggingFaceModel: (modelId: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('huggingface-local:download-model', modelId),
  listHuggingFaceModels: (): Promise<{
    cached: Array<{ id: string; displayName: string; sizeBytes?: number; downloaded: boolean }>;
    suggested: Array<{ id: string; displayName: string; sizeBytes?: number; downloaded: boolean }>;
  }> => ipcRenderer.invoke('huggingface-local:list-models'),
  deleteHuggingFaceModel: (modelId: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('huggingface-local:delete-model', modelId),
  onHuggingFaceDownloadProgress: (
    callback: (progress: {
      modelId: string;
      status: 'downloading' | 'complete' | 'error';
      progress: number;
      error?: string;
    }) => void,
  ) => {
    const listener = (
      _: unknown,
      progress: {
        modelId: string;
        status: 'downloading' | 'complete' | 'error';
        progress: number;
        error?: string;
      },
    ) => callback(progress);
    ipcRenderer.on('huggingface-local:download-progress', listener);
    return () => {
      ipcRenderer.removeListener('huggingface-local:download-progress', listener);
    };
  },

  // Debug bug reporting
  captureScreenshot: (): Promise<{
    success: boolean;
    data?: string;
    width?: number;
    height?: number;
    error?: string;
  }> => ipcRenderer.invoke('debug:capture-screenshot'),

  captureAxtree: (): Promise<{ success: boolean; data?: string; error?: string }> =>
    ipcRenderer.invoke('debug:capture-axtree'),

  generateBugReport: (data: {
    taskId?: string;
    taskPrompt?: string;
    taskStatus?: string;
    taskCreatedAt?: string;
    taskCompletedAt?: string;
    messages?: unknown[];
    debugLogs?: unknown[];
    screenshot?: string;
    axtree?: string;
    appVersion?: string;
    platform?: string;
  }): Promise<{ success: boolean; path?: string; error?: string; reason?: string }> =>
    ipcRenderer.invoke('debug:generate-bug-report', data),

  // Workspace management
  listWorkspaces: (): Promise<Workspace[]> => ipcRenderer.invoke('workspace:list'),
  getActiveWorkspaceId: (): Promise<string | null> => ipcRenderer.invoke('workspace:get-active'),
  switchWorkspace: (workspaceId: string): Promise<{ success: boolean; reason?: string }> =>
    ipcRenderer.invoke('workspace:switch', workspaceId),
  createWorkspace: (input: WorkspaceCreateInput): Promise<Workspace> =>
    ipcRenderer.invoke('workspace:create', input),
  updateWorkspace: (id: string, input: WorkspaceUpdateInput): Promise<Workspace | null> =>
    ipcRenderer.invoke('workspace:update', id, input),
  deleteWorkspace: (id: string): Promise<boolean> => ipcRenderer.invoke('workspace:delete', id),

  // Knowledge Notes
  listKnowledgeNotes: (workspaceId: string): Promise<KnowledgeNote[]> =>
    ipcRenderer.invoke('knowledge-notes:list', workspaceId),
  createKnowledgeNote: (input: KnowledgeNoteCreateInput): Promise<KnowledgeNote> =>
    ipcRenderer.invoke('knowledge-notes:create', input),
  updateKnowledgeNote: (
    id: string,
    workspaceId: string,
    input: KnowledgeNoteUpdateInput,
  ): Promise<KnowledgeNote | null> =>
    ipcRenderer.invoke('knowledge-notes:update', id, workspaceId, input),
  deleteKnowledgeNote: (id: string, workspaceId: string): Promise<boolean> =>
    ipcRenderer.invoke('knowledge-notes:delete', id, workspaceId),

  // Workspace event subscriptions
  onWorkspaceChanged: (callback: (data: { workspaceId: string }) => void) => {
    const listener = (_: unknown, data: { workspaceId: string }) => callback(data);
    ipcRenderer.on('workspace:changed', listener);
    return () => ipcRenderer.removeListener('workspace:changed', listener);
  },
  onWorkspaceDeleted: (callback: (data: { workspaceId: string }) => void) => {
    const listener = (_: unknown, data: { workspaceId: string }) => callback(data);
    ipcRenderer.on('workspace:deleted', listener);
    return () => ipcRenderer.removeListener('workspace:deleted', listener);
  },

  // ── WhatsApp Integration (ENG-684) ─────────────────────────────────────────
  // Contributed by aryan877 (PR #595), kartikangiras (PR #455)
  getWhatsAppConfig: (): Promise<{
    providerId: string;
    enabled: boolean;
    status: MessagingConnectionStatus;
    phoneNumber?: string;
    lastConnectedAt?: number;
    qrCode?: string;
    qrIssuedAt?: number;
  } | null> => ipcRenderer.invoke('integrations:whatsapp:get-config'),

  connectWhatsApp: (): Promise<void> => ipcRenderer.invoke('integrations:whatsapp:connect'),

  disconnectWhatsApp: (): Promise<void> => ipcRenderer.invoke('integrations:whatsapp:disconnect'),

  setWhatsAppEnabled: (enabled: boolean): Promise<void> =>
    ipcRenderer.invoke('integrations:whatsapp:set-enabled', enabled),

  onWhatsAppQR: (callback: (qr: string) => void): (() => void) => {
    const listener = (_: unknown, qr: string) => callback(qr);
    ipcRenderer.on('integrations:whatsapp:qr', listener);
    return () => ipcRenderer.removeListener('integrations:whatsapp:qr', listener);
  },

  onWhatsAppStatus: (callback: (status: MessagingConnectionStatus) => void): (() => void) => {
    const listener = (_: unknown, status: MessagingConnectionStatus) => callback(status);
    ipcRenderer.on('integrations:whatsapp:status', listener);
    return () => ipcRenderer.removeListener('integrations:whatsapp:status', listener);
  },

  // ── Scheduler ─────────────────────────────────────────────────────────────
  listSchedules: (workspaceId?: string): Promise<unknown[]> =>
    ipcRenderer.invoke('scheduler:list', workspaceId),
  createSchedule: (cron: string, prompt: string, workspaceId?: string): Promise<unknown> =>
    ipcRenderer.invoke('scheduler:create', cron, prompt, workspaceId),
  deleteSchedule: (scheduleId: string): Promise<void> =>
    ipcRenderer.invoke('scheduler:delete', scheduleId),
  setScheduleEnabled: (scheduleId: string, enabled: boolean): Promise<void> =>
    ipcRenderer.invoke('scheduler:set-enabled', scheduleId, enabled),
  isAutoStartEnabled: (): Promise<boolean> => ipcRenderer.invoke('daemon:is-auto-start-enabled'),

  // ── Accomplish AI Free Tier ──────────────────────────────────────────────
  accomplishAiConnect: (): Promise<unknown> => ipcRenderer.invoke('accomplish-ai:connect'),
  accomplishAiEnsureReady: (): Promise<unknown> => ipcRenderer.invoke('accomplish-ai:ensure-ready'),
  accomplishAiDisconnect: (): Promise<void> => ipcRenderer.invoke('accomplish-ai:disconnect'),
  accomplishAiGetUsage: (): Promise<unknown> => ipcRenderer.invoke('accomplish-ai:get-usage'),
  accomplishAiGetStatus: (): Promise<{ connected: boolean }> =>
    ipcRenderer.invoke('accomplish-ai:get-status'),
  onAccomplishAiUsageUpdate: (callback: (usage: unknown) => void) => {
    const listener = (_: unknown, usage: unknown) => callback(usage);
    ipcRenderer.on('accomplish-ai:usage-updated', listener);
    return () => ipcRenderer.removeListener('accomplish-ai:usage-updated', listener);
  },

  // ── Build Capabilities ───────────────────────────────────────────────────
  getBuildCapabilities: (): Promise<{ hasFreeMode: boolean; hasAnalytics: boolean }> =>
    ipcRenderer.invoke('app:get-build-capabilities'),

  // ── App Close Dialog ────────────────────────────────────────────────────
  onCloseRequested: (callback: () => void): (() => void) => {
    const listener = () => callback();
    ipcRenderer.on('app:close-requested', listener);
    return () => ipcRenderer.removeListener('app:close-requested', listener);
  },
  respondToClose: (decision: 'keep-daemon' | 'stop-daemon' | 'cancel'): void => {
    ipcRenderer.send('app:close-response', decision);
  },

  // ── Google Workspace Accounts ────────────────────────────────────────────
  gws: {
    listAccounts: (): Promise<GoogleAccount[]> => ipcRenderer.invoke('gws:accounts:list'),
    startAuth: (label: string): Promise<{ state: string; authUrl: string }> =>
      ipcRenderer.invoke('gws:accounts:start-auth', label),
    completeAuth: (state: string, code: string): Promise<GoogleAccount> =>
      ipcRenderer.invoke('gws:accounts:complete-auth', state, code),
    removeAccount: (id: string): Promise<void> => ipcRenderer.invoke('gws:accounts:remove', id),
    updateLabel: (id: string, label: string): Promise<void> =>
      ipcRenderer.invoke('gws:accounts:update-label', id, label),
    cancelAuth: (state: string): Promise<void> =>
      ipcRenderer.invoke('gws:accounts:cancel-auth', state),
    onStatusChanged: (callback: (id: string, status: string) => void): (() => void) => {
      const listener = (_: unknown, id: string, status: string) => callback(id, status);
      ipcRenderer.on('gws:account:status-changed', listener);
      return () => ipcRenderer.removeListener('gws:account:status-changed', listener);
    },
  },

  // ── Analytics ─────────────────────────────────────────────────────────────
  // Renderer-side analytics bridge. Each method invokes a main-process IPC handler
  // that calls the corresponding typed event helper.
  // When analytics is disabled (OSS builds), handlers aren't registered — the
  // analyticsInvoke wrapper catches the "No handler" rejection silently.
  analytics: {
    track: (eventName: string, params?: Record<string, string | number | boolean>): Promise<void> =>
      analyticsInvoke('analytics:track', eventName, params),
    trackPageView: (pagePath: string, pageTitle?: string): Promise<void> =>
      analyticsInvoke('analytics:page-view', pagePath, pageTitle),

    // Engagement
    trackSubmitTask: (): Promise<void> => analyticsInvoke('analytics:submit-task'),
    trackNewTask: (): Promise<void> => analyticsInvoke('analytics:new-task'),
    trackOpenSettings: (): Promise<void> => analyticsInvoke('analytics:open-settings'),

    // Settings
    trackSaveApiKey: (
      provider: string,
      success: boolean,
      connectionMethod?: string,
    ): Promise<void> =>
      analyticsInvoke('analytics:save-api-key', provider, success, connectionMethod),
    trackSelectProvider: (provider: string): Promise<void> =>
      analyticsInvoke('analytics:select-provider', provider),
    trackSelectModel: (model: string, provider?: string): Promise<void> =>
      analyticsInvoke('analytics:select-model', model, provider),
    trackToggleDebugMode: (enabled: boolean): Promise<void> =>
      analyticsInvoke('analytics:toggle-debug-mode', enabled),

    // Task Lifecycle
    trackTaskStart: (taskId: string, sessionId: string, taskType: string): Promise<void> =>
      analyticsInvoke('analytics:task-start', taskId, sessionId, taskType),
    trackTaskComplete: (
      taskId: string,
      sessionId: string,
      taskType: string,
      durationMs: number,
      totalSteps: number,
      hadErrors: boolean,
    ): Promise<void> =>
      ipcRenderer.invoke(
        'analytics:task-complete',
        taskId,
        sessionId,
        taskType,
        durationMs,
        totalSteps,
        hadErrors,
      ),
    trackTaskError: (
      taskId: string,
      sessionId: string,
      taskType: string,
      durationMs: number,
      totalSteps: number,
      errorType: string,
    ): Promise<void> =>
      ipcRenderer.invoke(
        'analytics:task-error',
        taskId,
        sessionId,
        taskType,
        durationMs,
        totalSteps,
        errorType,
      ),
    trackPermissionRequested: (
      taskId: string,
      sessionId: string,
      taskType: string,
      permissionType: string,
    ): Promise<void> =>
      ipcRenderer.invoke(
        'analytics:permission-requested',
        taskId,
        sessionId,
        taskType,
        permissionType,
      ),
    trackPermissionResponse: (
      taskId: string,
      sessionId: string,
      taskType: string,
      permissionType: string,
      granted: boolean,
    ): Promise<void> =>
      ipcRenderer.invoke(
        'analytics:permission-response',
        taskId,
        sessionId,
        taskType,
        permissionType,
        granted,
      ),
    trackToolUsed: (
      taskId: string,
      sessionId: string,
      taskType: string,
      toolName: string,
    ): Promise<void> =>
      analyticsInvoke('analytics:tool-used', taskId, sessionId, taskType, toolName),
    trackUserInteraction: (
      taskId: string,
      sessionId: string,
      taskType: string,
      interactionType: string,
      usedSuggestion: boolean,
    ): Promise<void> =>
      ipcRenderer.invoke(
        'analytics:user-interaction',
        taskId,
        sessionId,
        taskType,
        interactionType,
        usedSuggestion,
      ),

    // Session
    trackAppClose: (): Promise<void> => analyticsInvoke('analytics:app-close'),
    trackAppBackgrounded: (): Promise<void> => analyticsInvoke('analytics:app-backgrounded'),
    trackAppForegrounded: (): Promise<void> => analyticsInvoke('analytics:app-foregrounded'),

    // Model Selection
    trackModelSelectionStep: (
      step: string,
      isOnboarding: boolean,
      provider?: string,
      model?: string,
    ): Promise<void> =>
      analyticsInvoke('analytics:model-selection-step', step, isOnboarding, provider, model),
    trackModelSelectionComplete: (
      provider: string,
      isOnboarding: boolean,
      model?: string,
    ): Promise<void> =>
      analyticsInvoke('analytics:model-selection-complete', provider, isOnboarding, model),
    trackModelSelectionAbandoned: (lastStep: string, isOnboarding: boolean): Promise<void> =>
      analyticsInvoke('analytics:model-selection-abandoned', lastStep, isOnboarding),

    // Feature Usage
    trackHistoryViewed: (): Promise<void> => analyticsInvoke('analytics:history-viewed'),
    trackTaskFromHistory: (): Promise<void> => analyticsInvoke('analytics:task-from-history'),
    trackHistoryCleared: (): Promise<void> => analyticsInvoke('analytics:history-cleared'),
    trackTaskDetailsExpanded: (): Promise<void> =>
      analyticsInvoke('analytics:task-details-expanded'),
    trackOutputCopied: (): Promise<void> => analyticsInvoke('analytics:output-copied'),

    // Provider Lifecycle
    trackProviderDisconnected: (provider: string): Promise<void> =>
      analyticsInvoke('analytics:provider-disconnected', provider),
    trackHelpLinkClicked: (provider: string): Promise<void> =>
      analyticsInvoke('analytics:help-link-clicked', provider),

    // Skills
    trackSkillAction: (params: {
      action: string;
      skill_name?: string;
      enabled?: boolean;
      filter?: string;
      source?: string;
    }): Promise<void> => analyticsInvoke('analytics:skill-action', params),

    // Voice
    trackSaveVoiceApiKey: (success: boolean): Promise<void> =>
      analyticsInvoke('analytics:save-voice-api-key', success),

    // Debug
    trackExportLogs: (): Promise<void> => analyticsInvoke('analytics:export-logs'),
    trackThreadExported: (): Promise<void> => analyticsInvoke('analytics:thread-exported'),

    // Task Launcher
    trackTaskLauncherAction: (action: string): Promise<void> =>
      analyticsInvoke('analytics:task-launcher-action', action),

    // Task Feedback
    trackTaskFeedback: (
      taskId: string,
      sessionId: string,
      rating: string,
      taskStatus: string,
      feedbackStage: string,
      feedbackReason?: string,
      feedbackText?: string,
    ): Promise<void> =>
      ipcRenderer.invoke(
        'analytics:task-feedback',
        taskId,
        sessionId,
        rating,
        taskStatus,
        feedbackStage,
        feedbackReason,
        feedbackText,
      ),

    // Agent Control
    trackStopAgent: (taskId: string, sessionId: string): Promise<void> =>
      analyticsInvoke('analytics:stop-agent', taskId, sessionId),

    // Provider Box
    trackProviderBoxClicked: (params: {
      provider_id: string;
      is_connected: boolean;
      is_onboarding: boolean;
    }): Promise<void> => analyticsInvoke('analytics:provider-box-clicked', params),
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
