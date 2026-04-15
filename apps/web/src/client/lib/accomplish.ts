/**
 * Accomplish API - Interface to the Electron main process
 *
 * This module provides type-safe access to the accomplish API
 * exposed by the preload script via contextBridge.
 */

import type {
  Task,
  TaskConfig,
  TaskUpdateEvent,
  TaskStatus,
  PermissionRequest,
  PermissionResponse,
  TaskProgress,
  ApiKeyConfig,
  TaskMessage,
  BedrockCredentials,
  VertexCredentials,
  ProviderSettings,
  ProviderId,
  ConnectedProvider,
  TodoItem,
  ToolSupportStatus,
  Skill,
  McpConnector,
  FileAttachmentInfo,
  Workspace,
  WorkspaceCreateInput,
  WorkspaceUpdateInput,
  KnowledgeNote,
  KnowledgeNoteCreateInput,
  KnowledgeNoteUpdateInput,
  StoredFavorite,
  BrowserFramePayload,
  BrowserStatusPayload,
  BrowserNavigatePayload,
} from '@accomplish_ai/agent-core';
import type {
  CloudBrowserConfig,
  MessagingConnectionStatus,
  ScheduledTask,
  GoogleAccount,
  GoogleAccountStatus,
} from '@accomplish_ai/agent-core/common';

interface GwsAPI {
  listAccounts(): Promise<GoogleAccount[]>;
  startAuth(label: string): Promise<{ state: string; authUrl: string }>;
  completeAuth(state: string, code: string): Promise<GoogleAccount>;
  removeAccount(id: string): Promise<void>;
  updateLabel(id: string, label: string): Promise<void>;
  cancelAuth(state: string): Promise<void>;
  onStatusChanged(callback: (id: string, status: GoogleAccountStatus) => void): () => void;
}

// Define the API interface
interface AccomplishAPI {
  // App info
  getVersion(): Promise<string>;
  getPlatform(): Promise<string>;

  // Shell
  openExternal(url: string): Promise<void>;

  // Task operations
  startTask(config: TaskConfig): Promise<Task>;
  cancelTask(taskId: string): Promise<void>;
  interruptTask(taskId: string): Promise<void>;
  getTask(taskId: string): Promise<Task | null>;
  listTasks(): Promise<Task[]>;
  deleteTask(taskId: string): Promise<void>;
  clearTaskHistory(): Promise<void>;

  // Permission responses
  respondToPermission(response: PermissionResponse): Promise<void>;

  // Session management
  resumeSession(
    sessionId: string,
    prompt: string,
    taskId?: string,
    attachments?: FileAttachmentInfo[],
  ): Promise<Task>;

  // Settings
  getApiKeys(): Promise<ApiKeyConfig[]>;
  addApiKey(
    provider:
      | 'anthropic'
      | 'openai'
      | 'openrouter'
      | 'google'
      | 'xai'
      | 'deepseek'
      | 'moonshot'
      | 'zai'
      | 'azure-foundry'
      | 'custom'
      | 'bedrock'
      | 'litellm'
      | 'lmstudio'
      | 'nebius'
      | 'together'
      | 'fireworks'
      | 'groq'
      | 'elevenlabs'
      | 'nim'
      | 'minimax'
      | 'vertex'
      | 'venice'
      | 'aws-agentcore'
      | 'browserbase'
      | 'steel',
    key: string,
    label?: string,
  ): Promise<ApiKeyConfig>;
  removeApiKey(id: string): Promise<void>;
  getNotificationsEnabled(): Promise<boolean>;
  setNotificationsEnabled(enabled: boolean): Promise<void>;
  getDebugMode(): Promise<boolean>;
  setDebugMode(enabled: boolean): Promise<void>;
  getTheme(): Promise<string>;
  setTheme(theme: string): Promise<void>;
  onThemeChange?(callback: (data: { theme: string; resolved: string }) => void): () => void;
  getLanguage(): Promise<string>;
  setLanguage(language: string): Promise<void>;
  getAppSettings(): Promise<{
    debugMode: boolean;
    onboardingComplete: boolean;
    theme: string;
    language: string;
  }>;
  getCloudBrowserConfig(): Promise<CloudBrowserConfig | null>;
  setCloudBrowserConfig(config: CloudBrowserConfig | null): Promise<void>;

  getWhatsAppConfig(): Promise<{
    providerId: string;
    enabled: boolean;
    status: MessagingConnectionStatus;
    phoneNumber?: string;
    lastConnectedAt?: number;
    qrCode?: string;
    qrIssuedAt?: number;
  } | null>;
  connectWhatsApp(): Promise<void>;
  disconnectWhatsApp(): Promise<void>;
  setWhatsAppEnabled(enabled: boolean): Promise<void>;
  onWhatsAppQR(callback: (qr: string) => void): () => void;
  onWhatsAppStatus(callback: (status: MessagingConnectionStatus) => void): () => void;

  getOpenAiBaseUrl(): Promise<string>;
  setOpenAiBaseUrl(baseUrl: string): Promise<void>;
  getOpenAiOauthStatus(): Promise<{ connected: boolean; expires?: number }>;
  loginOpenAiWithChatGpt(): Promise<{ ok: boolean; openedUrl?: string }>;
  getSlackMcpOauthStatus(): Promise<{ connected: boolean; pendingAuthorization: boolean }>;
  loginSlackMcp(): Promise<{ ok: boolean }>;
  logoutSlackMcp(): Promise<void>;
  getCopilotOAuthStatus(): Promise<{ connected: boolean; username?: string; expiresAt?: number }>;
  loginGithubCopilot(): Promise<{
    ok: boolean;
    userCode?: string;
    verificationUri?: string;
    expiresIn?: number;
  }>;
  logoutGithubCopilot(): Promise<void>;

  // API Key management
  hasApiKey(): Promise<boolean>;
  setApiKey(key: string): Promise<void>;
  getApiKey(): Promise<string | null>;
  validateApiKey(key: string): Promise<{ valid: boolean; error?: string }>;
  validateApiKeyForProvider(
    provider: string,
    key: string,
    options?: Record<string, unknown>,
  ): Promise<{ valid: boolean; error?: string }>;
  clearApiKey(): Promise<void>;

  // Multi-provider API keys
  getAllApiKeys(): Promise<Record<string, { exists: boolean; prefix?: string }>>;
  hasAnyApiKey(): Promise<boolean>;

  // Onboarding
  getOnboardingComplete(): Promise<boolean>;
  setOnboardingComplete(complete: boolean): Promise<void>;

  // OpenCode CLI
  checkOpenCodeCli(): Promise<{
    installed: boolean;
    version: string | null;
    installCommand: string;
  }>;
  getOpenCodeVersion(): Promise<string | null>;

  // Model selection
  getSelectedModel(): Promise<{
    provider: string;
    model: string;
    baseUrl?: string;
    deploymentName?: string;
  } | null>;
  setSelectedModel(model: {
    provider: string;
    model: string;
    baseUrl?: string;
    deploymentName?: string;
  }): Promise<void>;

  // Ollama configuration
  testOllamaConnection(url: string): Promise<{
    success: boolean;
    models?: Array<{
      id: string;
      displayName: string;
      size: number;
      toolSupport?: ToolSupportStatus;
    }>;
    error?: string;
  }>;
  getOllamaConfig(): Promise<{
    baseUrl: string;
    enabled: boolean;
    lastValidated?: number;
    models?: Array<{
      id: string;
      displayName: string;
      size: number;
      toolSupport?: ToolSupportStatus;
    }>;
  } | null>;
  setOllamaConfig(
    config: {
      baseUrl: string;
      enabled: boolean;
      lastValidated?: number;
      models?: Array<{
        id: string;
        displayName: string;
        size: number;
        toolSupport?: ToolSupportStatus;
      }>;
    } | null,
  ): Promise<void>;

  // Azure Foundry configuration
  getAzureFoundryConfig(): Promise<{
    baseUrl: string;
    deploymentName: string;
    authType: 'api-key' | 'entra-id';
    enabled: boolean;
    lastValidated?: number;
  } | null>;
  setAzureFoundryConfig(
    config: {
      baseUrl: string;
      deploymentName: string;
      authType: 'api-key' | 'entra-id';
      enabled: boolean;
      lastValidated?: number;
    } | null,
  ): Promise<void>;
  testAzureFoundryConnection(config: {
    endpoint: string;
    deploymentName: string;
    authType: 'api-key' | 'entra-id';
    apiKey?: string;
  }): Promise<{ success: boolean; error?: string }>;
  saveAzureFoundryConfig(config: {
    endpoint: string;
    deploymentName: string;
    authType: 'api-key' | 'entra-id';
    apiKey?: string;
  }): Promise<void>;

  // Dynamic model fetching (generic, config-driven)
  fetchProviderModels(
    providerId: string,
    options?: { baseUrl?: string; zaiRegion?: string },
  ): Promise<{
    success: boolean;
    models?: Array<{ id: string; name: string }>;
    error?: string;
  }>;

  // OpenRouter configuration
  fetchOpenRouterModels(): Promise<{
    success: boolean;
    models?: Array<{ id: string; name: string; provider: string; contextLength: number }>;
    error?: string;
  }>;

  // LiteLLM configuration
  testLiteLLMConnection(
    url: string,
    apiKey?: string,
  ): Promise<{
    success: boolean;
    models?: Array<{ id: string; name: string; provider: string; contextLength: number }>;
    error?: string;
  }>;
  fetchLiteLLMModels(): Promise<{
    success: boolean;
    models?: Array<{ id: string; name: string; provider: string; contextLength: number }>;
    error?: string;
  }>;
  getLiteLLMConfig(): Promise<{
    baseUrl: string;
    enabled: boolean;
    lastValidated?: number;
    models?: Array<{ id: string; name: string; provider: string; contextLength: number }>;
  } | null>;
  setLiteLLMConfig(
    config: {
      baseUrl: string;
      enabled: boolean;
      lastValidated?: number;
      models?: Array<{ id: string; name: string; provider: string; contextLength: number }>;
    } | null,
  ): Promise<void>;

  // LM Studio configuration
  testLMStudioConnection(url: string): Promise<{
    success: boolean;
    models?: Array<{ id: string; name: string; toolSupport: ToolSupportStatus }>;
    error?: string;
  }>;
  fetchLMStudioModels(): Promise<{
    success: boolean;
    models?: Array<{ id: string; name: string; toolSupport: ToolSupportStatus }>;
    error?: string;
  }>;
  getLMStudioConfig(): Promise<{
    baseUrl: string;
    enabled: boolean;
    lastValidated?: number;
    models?: Array<{ id: string; name: string; toolSupport: ToolSupportStatus }>;
  } | null>;
  setLMStudioConfig(
    config: {
      baseUrl: string;
      enabled: boolean;
      lastValidated?: number;
      models?: Array<{ id: string; name: string; toolSupport: ToolSupportStatus }>;
    } | null,
  ): Promise<void>;

  // HuggingFace configuration (ENG-687)
  getHuggingFaceLocalConfig(): Promise<{
    selectedModelId: string | null;
    serverPort: number | null;
    enabled: boolean;
  } | null>;
  setHuggingFaceLocalConfig(
    config: {
      selectedModelId: string | null;
      serverPort: number | null;
      enabled: boolean;
    } | null,
  ): Promise<void>;
  listHuggingFaceModels(): Promise<{
    cached: Array<{ id: string; displayName: string; sizeBytes?: number; downloaded: boolean }>;
    suggested: Array<{ id: string; displayName: string; sizeBytes?: number; downloaded: boolean }>;
  }>;
  downloadHuggingFaceModel(modelId: string): Promise<{ success: boolean; error?: string }>;
  startHuggingFaceServer(
    modelId: string,
  ): Promise<{ success: boolean; port?: number; error?: string }>;
  stopHuggingFaceServer(): Promise<{ success: boolean; error?: string }>;
  getHuggingFaceServerStatus(): Promise<{
    running: boolean;
    port: number | null;
    loadedModel: string | null;
    isLoading: boolean;
  }>;
  testHuggingFaceConnection(): Promise<{ success: boolean; error?: string }>;
  deleteHuggingFaceModel(modelId: string): Promise<{ success: boolean; error?: string }>;
  onHuggingFaceDownloadProgress(
    callback: (progress: {
      modelId: string;
      status: 'downloading' | 'complete' | 'error';
      progress: number;
      error?: string;
    }) => void,
  ): () => void;

  // NVIDIA NIM configuration
  testNimConnection(
    url: string,
    apiKey: string,
  ): Promise<{
    success: boolean;
    models?: Array<{ id: string; name: string; provider: string; contextLength: number }>;
    error?: string;
  }>;
  fetchNimModels(): Promise<{
    success: boolean;
    models?: Array<{ id: string; name: string; provider: string; contextLength: number }>;
    error?: string;
  }>;

  // Custom OpenAI-compatible endpoint configuration
  testCustomConnection(
    baseUrl: string,
    apiKey?: string,
  ): Promise<{
    success: boolean;
    error?: string;
  }>;

  // Bedrock configuration
  validateBedrockCredentials(credentials: string): Promise<{ valid: boolean; error?: string }>;
  saveBedrockCredentials(credentials: string): Promise<ApiKeyConfig>;
  getBedrockCredentials(): Promise<BedrockCredentials | null>;
  fetchBedrockModels(credentials: string): Promise<{
    success: boolean;
    models: Array<{ id: string; name: string; provider: string }>;
    error?: string;
  }>;

  // Vertex AI configuration
  validateVertexCredentials(credentials: string): Promise<{ valid: boolean; error?: string }>;
  saveVertexCredentials(credentials: string): Promise<ApiKeyConfig>;
  getVertexCredentials(): Promise<VertexCredentials | null>;
  fetchVertexModels(credentials: string): Promise<{
    success: boolean;
    models: Array<{ id: string; name: string; provider: string }>;
    error?: string;
  }>;
  detectVertexProject(): Promise<{ success: boolean; projectId: string | null }>;
  listVertexProjects(): Promise<{
    success: boolean;
    projects: Array<{ projectId: string; name: string }>;
    error?: string;
  }>;

  // E2E Testing
  isE2EMode(): Promise<boolean>;

  // Provider Settings API
  getProviderSettings(): Promise<ProviderSettings>;
  setActiveProvider(providerId: ProviderId | null): Promise<void>;
  getConnectedProvider(providerId: ProviderId): Promise<ConnectedProvider | null>;
  setConnectedProvider(providerId: ProviderId, provider: ConnectedProvider): Promise<void>;
  removeConnectedProvider(providerId: ProviderId): Promise<void>;
  updateProviderModel(providerId: ProviderId, modelId: string | null): Promise<void>;
  setProviderDebugMode(enabled: boolean): Promise<void>;
  getProviderDebugMode(): Promise<boolean>;

  // Todo operations
  getTodosForTask(taskId: string): Promise<TodoItem[]>;

  // Favorites
  addFavorite(taskId: string): Promise<void>;
  removeFavorite(taskId: string): Promise<void>;
  listFavorites(): Promise<StoredFavorite[]>;

  // File attachments
  pickFolder(): Promise<string | null>;
  pickFiles(): Promise<FileAttachmentInfo[]>;
  getFilePath(file: File): string;
  processDroppedFiles(paths: string[]): Promise<FileAttachmentInfo[]>;

  // Event subscriptions
  onTaskUpdate(callback: (event: TaskUpdateEvent) => void): () => void;
  onTaskUpdateBatch?(
    callback: (event: { taskId: string; messages: TaskMessage[] }) => void,
  ): () => void;
  onPermissionRequest(callback: (request: PermissionRequest) => void): () => void;
  onTaskProgress(callback: (progress: TaskProgress) => void): () => void;
  onDebugLog(callback: (log: unknown) => void): () => void;
  onDebugModeChange?(callback: (data: { enabled: boolean }) => void): () => void;
  onTaskStatusChange?(callback: (data: { taskId: string; status: TaskStatus }) => void): () => void;
  onTaskSummary?(callback: (data: { taskId: string; summary: string }) => void): () => void;
  onTodoUpdate?(callback: (data: { taskId: string; todos: TodoItem[] }) => void): () => void;
  onAuthError?(callback: (data: { providerId: string; message: string }) => void): () => void;

  // Browser Preview (ENG-695)
  onBrowserFrame?(callback: (event: BrowserFramePayload & { taskId: string }) => void): () => void;
  onBrowserNavigate?(
    callback: (event: BrowserNavigatePayload & { taskId: string; pageName: string }) => void,
  ): () => void;
  onBrowserStatus?(
    callback: (
      event: BrowserStatusPayload & { taskId: string; pageName: string; message?: string },
    ) => void,
  ): () => void;
  startBrowserPreview?(taskId: string, pageName?: string): Promise<{ success: boolean }>;
  stopBrowserPreview?(taskId: string): Promise<{ stopped: boolean }>;
  getBrowserPreviewStatus?(): Promise<{ active: boolean }>;

  // Speech-to-Text
  speechIsConfigured(): Promise<boolean>;
  speechGetConfig(): Promise<{ enabled: boolean; hasApiKey: boolean; apiKeyPrefix?: string }>;
  speechValidate(apiKey?: string): Promise<{ valid: boolean; error?: string }>;
  speechTranscribe(
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
  >;

  // Logging
  logEvent(payload: {
    level?: string;
    message: string;
    context?: Record<string, unknown>;
  }): Promise<unknown>;
  exportLogs(): Promise<{ success: boolean; path?: string; error?: string; reason?: string }>;

  // Debug bug reporting
  captureScreenshot(): Promise<{
    success: boolean;
    data?: string;
    width?: number;
    height?: number;
    error?: string;
  }>;
  captureAxtree(): Promise<{ success: boolean; data?: string; error?: string }>;
  generateBugReport(data: {
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
  }): Promise<{ success: boolean; path?: string; error?: string; reason?: string }>;

  // Workspace management
  listWorkspaces(): Promise<Workspace[]>;
  getActiveWorkspaceId(): Promise<string | null>;
  switchWorkspace(workspaceId: string): Promise<{ success: boolean; reason?: string }>;
  createWorkspace(input: WorkspaceCreateInput): Promise<Workspace>;
  updateWorkspace(id: string, input: WorkspaceUpdateInput): Promise<Workspace | null>;
  deleteWorkspace(id: string): Promise<boolean>;

  // Knowledge Notes
  listKnowledgeNotes(workspaceId: string): Promise<KnowledgeNote[]>;
  createKnowledgeNote(input: KnowledgeNoteCreateInput): Promise<KnowledgeNote>;
  updateKnowledgeNote(
    id: string,
    workspaceId: string,
    input: KnowledgeNoteUpdateInput,
  ): Promise<KnowledgeNote | null>;
  deleteKnowledgeNote(id: string, workspaceId: string): Promise<boolean>;

  // Workspace event subscriptions
  onWorkspaceChanged?(callback: (data: { workspaceId: string }) => void): () => void;
  onWorkspaceDeleted?(callback: (data: { workspaceId: string }) => void): () => void;

  // Skills management
  getSkills(): Promise<Skill[]>;
  getEnabledSkills(): Promise<Skill[]>;
  setSkillEnabled(id: string, enabled: boolean): Promise<void>;
  getSkillContent(id: string): Promise<string | null>;
  getUserSkillsPath(): Promise<string>;
  pickSkillFolder(): Promise<string | null>;
  addSkillFromFolder(folderPath: string): Promise<Skill | null>;
  addSkillFromGitHub(rawUrl: string): Promise<Skill>;
  deleteSkill(id: string): Promise<void>;
  resyncSkills(): Promise<Skill[]>;
  openSkillInEditor(filePath: string): Promise<void>;
  showSkillInFolder(filePath: string): Promise<void>;

  // Daemon
  getDaemonSocketPath(): Promise<string>;

  // Daemon control
  daemonPing(): Promise<{ status: string; uptime: number }>;
  daemonRestart(): Promise<{ success: boolean }>;
  daemonStop(): Promise<{ success: boolean }>;
  daemonStart(): Promise<{ success: boolean }>;

  // Close behavior
  getCloseBehavior(): Promise<string>;
  setCloseBehavior(behavior: string): Promise<void>;

  // App close dialog
  onCloseRequested?(callback: () => void): () => void;
  respondToClose?(decision: 'keep-daemon' | 'stop-daemon' | 'cancel'): void;

  // Daemon connection events
  onDaemonDisconnected(callback: () => void): () => void;
  onDaemonReconnected(callback: () => void): () => void;
  onDaemonReconnectFailed(callback: () => void): () => void;

  // Sandbox configuration
  getSandboxConfig(): Promise<{
    mode: 'disabled' | 'native' | 'docker';
    allowedPaths: string[];
    networkRestricted: boolean;
    allowedHosts: string[];
    dockerImage?: string;
    networkPolicy?: { allowOutbound: boolean; allowedHosts?: string[] };
  }>;
  setSandboxConfig(config: {
    mode: 'disabled' | 'native' | 'docker';
    allowedPaths: string[];
    networkRestricted: boolean;
    allowedHosts: string[];
    dockerImage?: string;
    networkPolicy?: { allowOutbound: boolean; allowedHosts?: string[] };
  }): Promise<void>;

  // Scheduler
  listSchedules(workspaceId?: string): Promise<ScheduledTask[]>;
  createSchedule(cron: string, prompt: string, workspaceId?: string): Promise<ScheduledTask>;
  deleteSchedule(scheduleId: string): Promise<void>;
  setScheduleEnabled(scheduleId: string, enabled: boolean): Promise<void>;
  isAutoStartEnabled(): Promise<boolean>;

  // MCP Connectors
  getConnectors(): Promise<McpConnector[]>;
  addConnector(name: string, url: string): Promise<McpConnector>;
  deleteConnector(id: string): Promise<void>;
  setConnectorEnabled(id: string, enabled: boolean): Promise<void>;
  startConnectorOAuth(connectorId: string): Promise<{ state: string; authUrl: string }>;
  completeConnectorOAuth(state: string, code: string): Promise<McpConnector>;
  disconnectConnector(connectorId: string): Promise<void>;
  onMcpAuthCallback?(callback: (url: string) => void): () => void;

  // Accomplish AI Free Tier
  accomplishAiConnect(): Promise<{
    deviceFingerprint: string;
    spentCredits: number;
    remainingCredits: number;
    totalCredits: number;
    resetsAt: string;
  }>;
  accomplishAiEnsureReady(): Promise<{ deviceFingerprint: string }>;
  accomplishAiDisconnect(): Promise<void>;
  accomplishAiGetUsage(): Promise<{
    spentCredits: number;
    remainingCredits: number;
    totalCredits: number;
    resetsAt: string;
  }>;
  accomplishAiGetStatus(): Promise<{ connected: boolean }>;
  onAccomplishAiUsageUpdate(
    callback: (usage: {
      spentCredits: number;
      remainingCredits: number;
      totalCredits: number;
      resetsAt: string;
    }) => void,
  ): () => void;

  // Build capabilities
  getBuildCapabilities(): Promise<{ hasFreeMode: boolean; hasAnalytics: boolean }>;

  // Google Workspace multi-account
  gws?: GwsAPI;

  // Analytics — renderer-side tracking bridge
  analytics: {
    track(eventName: string, params?: Record<string, string | number | boolean>): Promise<void>;
    trackPageView(pagePath: string, pageTitle?: string): Promise<void>;
    trackSubmitTask(): Promise<void>;
    trackNewTask(): Promise<void>;
    trackOpenSettings(): Promise<void>;
    trackSaveApiKey(provider: string, success: boolean, connectionMethod?: string): Promise<void>;
    trackSelectProvider(provider: string): Promise<void>;
    trackSelectModel(model: string, provider?: string): Promise<void>;
    trackToggleDebugMode(enabled: boolean): Promise<void>;
    trackTaskStart(taskId: string, sessionId: string, taskType: string): Promise<void>;
    trackTaskComplete(
      taskId: string,
      sessionId: string,
      taskType: string,
      durationMs: number,
      totalSteps: number,
      hadErrors: boolean,
    ): Promise<void>;
    trackTaskError(
      taskId: string,
      sessionId: string,
      taskType: string,
      durationMs: number,
      totalSteps: number,
      errorType: string,
    ): Promise<void>;
    trackPermissionRequested(
      taskId: string,
      sessionId: string,
      taskType: string,
      permissionType: string,
    ): Promise<void>;
    trackPermissionResponse(
      taskId: string,
      sessionId: string,
      taskType: string,
      permissionType: string,
      granted: boolean,
    ): Promise<void>;
    trackToolUsed(
      taskId: string,
      sessionId: string,
      taskType: string,
      toolName: string,
    ): Promise<void>;
    trackUserInteraction(
      taskId: string,
      sessionId: string,
      taskType: string,
      interactionType: string,
      usedSuggestion: boolean,
    ): Promise<void>;
    trackAppClose(): Promise<void>;
    trackAppBackgrounded(): Promise<void>;
    trackAppForegrounded(): Promise<void>;
    trackModelSelectionStep(
      step: string,
      isOnboarding: boolean,
      provider?: string,
      model?: string,
    ): Promise<void>;
    trackModelSelectionComplete(
      provider: string,
      isOnboarding: boolean,
      model?: string,
    ): Promise<void>;
    trackModelSelectionAbandoned(lastStep: string, isOnboarding: boolean): Promise<void>;
    trackHistoryViewed(): Promise<void>;
    trackTaskFromHistory(): Promise<void>;
    trackHistoryCleared(): Promise<void>;
    trackTaskDetailsExpanded(): Promise<void>;
    trackOutputCopied(): Promise<void>;
    trackProviderDisconnected(provider: string): Promise<void>;
    trackHelpLinkClicked(provider: string): Promise<void>;
    trackSkillAction(params: {
      action: string;
      skill_name?: string;
      enabled?: boolean;
      filter?: string;
      source?: string;
    }): Promise<void>;
    trackSaveVoiceApiKey(success: boolean): Promise<void>;
    trackExportLogs(): Promise<void>;
    trackThreadExported(): Promise<void>;
    trackTaskLauncherAction(action: string): Promise<void>;
    trackTaskFeedback(
      taskId: string,
      sessionId: string,
      rating: string,
      taskStatus: string,
      feedbackStage: string,
      feedbackReason?: string,
      feedbackText?: string,
    ): Promise<void>;
    trackStopAgent(taskId: string, sessionId: string): Promise<void>;
    trackProviderBoxClicked(params: {
      provider_id: string;
      is_connected: boolean;
      is_onboarding: boolean;
    }): Promise<void>;
  };
}

interface AccomplishShell {
  version: string;
  platform: string;
  isElectron: true;
}

// Extend Window interface
declare global {
  interface Window {
    accomplish?: AccomplishAPI;
    accomplishShell?: AccomplishShell;
  }
}

/**
 * Get the accomplish API
 * Throws if not running in Electron
 */
export function getAccomplish() {
  if (!window.accomplish) {
    throw new Error('Accomplish API not available - not running in Electron');
  }
  return {
    ...window.accomplish,

    validateBedrockCredentials: async (
      credentials: BedrockCredentials,
    ): Promise<{ valid: boolean; error?: string }> => {
      return window.accomplish!.validateBedrockCredentials(JSON.stringify(credentials));
    },

    saveBedrockCredentials: async (credentials: BedrockCredentials): Promise<ApiKeyConfig> => {
      return window.accomplish!.saveBedrockCredentials(JSON.stringify(credentials));
    },

    getBedrockCredentials: async (): Promise<BedrockCredentials | null> => {
      return window.accomplish!.getBedrockCredentials();
    },

    fetchBedrockModels: (credentials: string) => window.accomplish!.fetchBedrockModels(credentials),

    validateVertexCredentials: async (
      credentials: VertexCredentials,
    ): Promise<{ valid: boolean; error?: string }> => {
      return window.accomplish!.validateVertexCredentials(JSON.stringify(credentials));
    },

    saveVertexCredentials: async (credentials: VertexCredentials): Promise<ApiKeyConfig> => {
      return window.accomplish!.saveVertexCredentials(JSON.stringify(credentials));
    },

    getVertexCredentials: async (): Promise<VertexCredentials | null> => {
      return window.accomplish!.getVertexCredentials();
    },

    fetchVertexModels: (credentials: string) => window.accomplish!.fetchVertexModels(credentials),

    detectVertexProject: () => window.accomplish!.detectVertexProject(),

    listVertexProjects: () => window.accomplish!.listVertexProjects(),

    listHuggingFaceModels: () => window.accomplish!.listHuggingFaceModels(),

    downloadHuggingFaceModel: (modelId: string) =>
      window.accomplish!.downloadHuggingFaceModel(modelId),

    startHuggingFaceServer: (modelId: string) => window.accomplish!.startHuggingFaceServer(modelId),

    stopHuggingFaceServer: () => window.accomplish!.stopHuggingFaceServer(),

    onHuggingFaceDownloadProgress: (
      callback: (progress: {
        modelId: string;
        status: 'downloading' | 'complete' | 'error';
        progress: number;
        error?: string;
      }) => void,
    ) => window.accomplish!.onHuggingFaceDownloadProgress(callback),

    // Google Workspace flat helpers — delegate to the gws namespace
    gwsListAccounts: (): Promise<GoogleAccount[]> => {
      if (!window.accomplish?.gws) {
        return Promise.reject(new Error('GWS API not available'));
      }
      return window.accomplish.gws.listAccounts();
    },

    gwsStartAuth: (label: string): Promise<{ state: string; authUrl: string }> => {
      if (!window.accomplish?.gws) {
        return Promise.reject(new Error('GWS API not available'));
      }
      return window.accomplish.gws.startAuth(label);
    },

    gwsCompleteAuth: (state: string, code: string): Promise<GoogleAccount> => {
      if (!window.accomplish?.gws) {
        return Promise.reject(new Error('GWS API not available'));
      }
      return window.accomplish.gws.completeAuth(state, code);
    },

    gwsRemoveAccount: (id: string): Promise<void> => {
      if (!window.accomplish?.gws) {
        return Promise.reject(new Error('GWS API not available'));
      }
      return window.accomplish.gws.removeAccount(id);
    },

    gwsUpdateLabel: (id: string, label: string): Promise<void> => {
      if (!window.accomplish?.gws) {
        return Promise.reject(new Error('GWS API not available'));
      }
      return window.accomplish.gws.updateLabel(id, label);
    },

    gwsOnStatusChanged: (cb: (id: string, status: GoogleAccountStatus) => void): (() => void) => {
      if (!window.accomplish?.gws) {
        throw new Error('GWS API not available');
      }
      return window.accomplish.gws.onStatusChanged(cb);
    },
  };
}

/**
 * Check if running in Electron shell
 */
export function isRunningInElectron(): boolean {
  return window.accomplishShell?.isElectron === true;
}

/**
 * Get shell version if available
 */
export function getShellVersion(): string | null {
  return window.accomplishShell?.version ?? null;
}

/**
 * Get shell platform if available
 */
export function getShellPlatform(): string | null {
  return window.accomplishShell?.platform ?? null;
}

/**
 * React hook to use the accomplish API
 */
export function useAccomplish(): AccomplishAPI {
  const api = window.accomplish;
  if (!api) {
    throw new Error('Accomplish API not available - not running in Electron');
  }
  return api;
}
