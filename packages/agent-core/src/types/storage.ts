import type { Task, TaskStatus, TaskMessage } from '../common/types/task.js';
import type { TodoItem } from '../common/types/todo.js';
import type {
  SelectedModel,
  OllamaConfig,
  LiteLLMConfig,
  AzureFoundryConfig,
  LMStudioConfig,
  HuggingFaceLocalConfig,
  NimConfig,
} from '../common/types/provider.js';
import type {
  ProviderId,
  ProviderSettings,
  ConnectedProvider,
} from '../common/types/providerSettings.js';
import type { McpConnector, ConnectorStatus, OAuthTokens } from '../common/types/connector.js';
import type { SandboxConfig } from '../common/types/sandbox.js';
import type { CloudBrowserConfig } from '../common/types/cloud-browser.js';
import type { MessagingConfig } from '../common/types/messaging.js';
import type { BlocklistEntry } from '../common/types/desktop.js';
import type { ScheduledTask } from '../common/types/daemon.js';

/** Options for creating a Storage instance */
export interface StorageOptions {
  /** Path to the SQLite database file */
  databasePath?: string;
  /** Whether to run schema migrations on initialization */
  runMigrations?: boolean;
  /** User data directory for secure storage */
  userDataPath?: string;
  /** Application identifier for secure storage encryption */
  secureStorageAppId?: string;
  /** File name for the encrypted secure storage file */
  secureStorageFileName?: string;
}

/** A persisted task record from the database */
export interface StoredTask {
  id: string;
  prompt: string;
  summary?: string;
  status: TaskStatus;
  messages: TaskMessage[];
  sessionId?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

/** A favorited (starred) completed task, stored for quick reuse on the home page */
export interface StoredFavorite {
  taskId: string;
  prompt: string;
  summary?: string;
  favoritedAt: string;
}
export type ThemePreference = 'system' | 'light' | 'dark';

/** Application settings snapshot */
export interface AppSettings {
  debugMode: boolean;
  onboardingComplete: boolean;
  selectedModel: SelectedModel | null;
  ollamaConfig: OllamaConfig | null;
  litellmConfig: LiteLLMConfig | null;
  azureFoundryConfig: AzureFoundryConfig | null;
  lmstudioConfig: LMStudioConfig | null;
  huggingfaceLocalConfig: HuggingFaceLocalConfig | null;
  openaiBaseUrl: string;
  theme: ThemePreference;
}

// ---------------------------------------------------------------------------
// Sub-interfaces for focused, slice-level access
// ---------------------------------------------------------------------------

/** API for task CRUD operations and todo management */
export interface TaskStorageAPI {
  /** Get all stored tasks, optionally filtered by workspace */
  getTasks(workspaceId?: string | null): StoredTask[];
  /** Get a task by ID, returns undefined if not found */
  getTask(taskId: string): StoredTask | undefined;
  /** Persist a new task or update an existing one */
  saveTask(task: Task, workspaceId?: string | null): void;
  /** Update a task's status and optional completion timestamp */
  updateTaskStatus(taskId: string, status: TaskStatus, completedAt?: string): void;
  /** Append a message to a task's message history */
  addTaskMessage(taskId: string, message: TaskMessage): void;
  /** Update the CLI session ID for a task */
  updateTaskSessionId(taskId: string, sessionId: string): void;
  /** Set the AI-generated summary for a task */
  updateTaskSummary(taskId: string, summary: string): void;
  /** Delete a task and its associated data */
  deleteTask(taskId: string): void;
  /** Delete all task history */
  clearHistory(): void;
  /** Get todo items for a specific task */
  getTodosForTask(taskId: string): TodoItem[];
  /** Save todo items for a specific task */
  saveTodosForTask(taskId: string, todos: TodoItem[]): void;
  /** Remove all todo items for a specific task */
  clearTodosForTask(taskId: string): void;
  /** Add a completed task to favorites (by taskId; prompt/summary stored for display) */
  addFavorite(taskId: string, prompt: string, summary?: string): void;
  /** Remove a task from favorites */
  removeFavorite(taskId: string): void;
  /** Get all favorites, ordered by favoritedAt descending */
  getFavorites(): StoredFavorite[];
  /** Check if a task is in favorites */
  isFavorite(taskId: string): boolean;
}

/** API for reading and writing application settings */
export interface AppSettingsAPI {
  /** Get whether debug mode is enabled */
  getDebugMode(): boolean;
  /** Enable or disable debug mode */
  setDebugMode(enabled: boolean): void;
  /** Get whether onboarding has been completed */
  getOnboardingComplete(): boolean;
  /** Set onboarding completion status */
  setOnboardingComplete(complete: boolean): void;
  /** Get the currently selected model */
  getSelectedModel(): SelectedModel | null;
  /** Set the selected model */
  setSelectedModel(model: SelectedModel): void;
  /** Get the Ollama configuration */
  getOllamaConfig(): OllamaConfig | null;
  /** Set the Ollama configuration */
  setOllamaConfig(config: OllamaConfig | null): void;
  /** Get the LiteLLM configuration */
  getLiteLLMConfig(): LiteLLMConfig | null;
  /** Set the LiteLLM configuration */
  setLiteLLMConfig(config: LiteLLMConfig | null): void;
  /** Get the Azure Foundry configuration */
  getAzureFoundryConfig(): AzureFoundryConfig | null;
  /** Set the Azure Foundry configuration */
  setAzureFoundryConfig(config: AzureFoundryConfig | null): void;
  /** Get the LM Studio configuration */
  getLMStudioConfig(): LMStudioConfig | null;
  /** Set the LM Studio configuration */
  setLMStudioConfig(config: LMStudioConfig | null): void;
  /** Get the Hugging Face Local configuration */
  getHuggingFaceLocalConfig(): HuggingFaceLocalConfig | null;
  /** Set the Hugging Face Local configuration */
  setHuggingFaceLocalConfig(config: HuggingFaceLocalConfig | null): void;
  /** Get the NVIDIA NIM configuration */
  getNimConfig(): NimConfig | null;
  /** Set the NVIDIA NIM configuration */
  setNimConfig(config: NimConfig | null): void;
  /** Get the custom OpenAI base URL */
  getOpenAiBaseUrl(): string;
  /** Set the custom OpenAI base URL */
  setOpenAiBaseUrl(baseUrl: string): void;
  /** Get the current theme preference */
  getTheme(): ThemePreference;
  /** Set the theme preference */
  setTheme(theme: ThemePreference): void;
  /** Get cloud browser configuration */
  getCloudBrowserConfig(): CloudBrowserConfig | null;
  /** Set cloud browser configuration */
  setCloudBrowserConfig(config: CloudBrowserConfig | null): void;
  /** Get messaging integration configuration (ENG-684) */
  getMessagingConfig(): MessagingConfig | null;
  /** Set messaging integration configuration (ENG-684) */
  setMessagingConfig(config: MessagingConfig | null): void;
  /** Get whether desktop notifications are enabled */
  getNotificationsEnabled(): boolean;
  /** Enable or disable desktop notifications */
  setNotificationsEnabled(enabled: boolean): void;
  /** Get the window close button behavior ('keep-daemon' | 'stop-daemon') */
  getCloseBehavior(): 'keep-daemon' | 'stop-daemon';
  /** Set the window close button behavior */
  setCloseBehavior(behavior: 'keep-daemon' | 'stop-daemon'): void;
  /** Get all application settings as a snapshot */
  getAppSettings(): AppSettings;
  /** Reset all application settings to defaults */
  clearAppSettings(): void;
  /** Get the current sandbox configuration */
  getSandboxConfig(): SandboxConfig;
  /** Set the sandbox configuration */
  setSandboxConfig(config: SandboxConfig): void;
}

/** API for managing AI provider configurations */
export interface ProviderSettingsAPI {
  /** Get all provider settings */
  getProviderSettings(): ProviderSettings;
  /** Set the active provider, or null to clear */
  setActiveProvider(providerId: ProviderId | null): void;
  /** Get the currently active provider ID */
  getActiveProviderId(): ProviderId | null;
  /** Get connection details for a specific provider */
  getConnectedProvider(providerId: ProviderId): ConnectedProvider | null;
  /** Store connection details for a provider */
  setConnectedProvider(providerId: ProviderId, provider: ConnectedProvider): void;
  /** Remove a provider's connection details */
  removeConnectedProvider(providerId: ProviderId): void;
  /** Update the selected model for a provider */
  updateProviderModel(providerId: ProviderId, modelId: string | null): void;
  /** Enable or disable debug mode for providers */
  setProviderDebugMode(enabled: boolean): void;
  /** Check if provider debug mode is enabled */
  getProviderDebugMode(): boolean;
  /** Reset all provider settings */
  clearProviderSettings(): void;
  /** Get the active provider's ID, model, and optional base URL */
  getActiveProviderModel(): {
    provider: ProviderId;
    model: string;
    baseUrl?: string;
  } | null;
  /** Check if any provider is configured and ready */
  hasReadyProvider(): boolean;
  /** Get IDs of all connected providers */
  getConnectedProviderIds(): ProviderId[];
}

/** API for encrypted credential storage (AES-256-GCM) */
export interface SecureStorageAPI {
  /** Store an API key for a provider */
  storeApiKey(provider: string, apiKey: string): void;
  /** Retrieve an API key for a provider */
  getApiKey(provider: string): string | null;
  /** Delete a stored API key */
  deleteApiKey(provider: string): boolean;
  /** Get all stored API keys */
  getAllApiKeys(): Promise<Record<string, string | null>>;
  /** Store AWS Bedrock credentials */
  storeBedrockCredentials(credentials: string): void;
  /** Retrieve AWS Bedrock credentials */
  getBedrockCredentials(): Record<string, string> | null;
  /** Check if any API key is stored */
  hasAnyApiKey(): Promise<boolean>;
  /** List all stored credential entries */
  listStoredCredentials(): Array<{ account: string; password: string }>;
  /** Delete all stored credentials */
  clearSecureStorage(): void;
}

/** API for MCP connector management and OAuth token storage */
export interface ConnectorStorageAPI {
  /** Get all connectors */
  getAllConnectors(): McpConnector[];
  /** Get only enabled connectors */
  getEnabledConnectors(): McpConnector[];
  /** Get a connector by ID */
  getConnectorById(id: string): McpConnector | null;
  /** Create or update a connector */
  upsertConnector(connector: McpConnector): void;
  /** Enable or disable a connector */
  setConnectorEnabled(id: string, enabled: boolean): void;
  /** Update a connector's status */
  setConnectorStatus(id: string, status: ConnectorStatus): void;
  /** Delete a connector */
  deleteConnector(id: string): void;
  /** Delete all connectors */
  clearAllConnectors(): void;
  /** Store OAuth tokens for a connector (encrypted) */
  storeConnectorTokens(connectorId: string, tokens: OAuthTokens): void;
  /** Retrieve OAuth tokens for a connector */
  getConnectorTokens(connectorId: string): OAuthTokens | null;
  /** Delete OAuth tokens for a connector */
  deleteConnectorTokens(connectorId: string): void;
}

/** API for database initialization and lifecycle management */
export interface DatabaseLifecycleAPI {
  /** Initialize the database, creating it if needed and running migrations */
  initialize(): void;
  /** Close the database connection */
  close(): void;
  /** Check if the database has been initialized */
  isDatabaseInitialized(): boolean;
  /** Get the path to the current database file */
  getDatabasePath(): string | null;
}

/** API for managing the desktop-control sensitive app blocklist */
export interface DesktopControlStorageAPI {
  /** Get the user's custom blocklist entries */
  getDesktopBlocklist(): BlocklistEntry[];
  /** Set the user's custom blocklist entries */
  setDesktopBlocklist(entries: BlocklistEntry[]): void;
  /** Add a single entry to the blocklist (deduplicates by appName) */
  addDesktopBlocklistEntry(entry: BlocklistEntry): void;
  /** Remove an entry from the blocklist by appName */
  removeDesktopBlocklistEntry(appName: string): void;
}

/** API for cron-based scheduled task persistence */
export interface SchedulerStorageAPI {
  /** Get all scheduled tasks */
  getAllScheduledTasks(): ScheduledTask[];
  /** Get only enabled scheduled tasks */
  getEnabledScheduledTasks(): ScheduledTask[];
  /** Get scheduled tasks scoped to a workspace */
  getScheduledTasksByWorkspace(workspaceId: string): ScheduledTask[];
  /** Get a scheduled task by ID */
  getScheduledTaskById(id: string): ScheduledTask | null;
  /** Create a new scheduled task */
  createScheduledTask(cron: string, prompt: string, workspaceId?: string): ScheduledTask;
  /** Delete a scheduled task */
  deleteScheduledTask(id: string): void;
  /** Enable or disable a scheduled task */
  setScheduledTaskEnabled(id: string, enabled: boolean): void;
  /** Update the last run timestamp and next run time */
  updateScheduledTaskLastRun(id: string, timestamp: string, nextRunAt: string): void;
}

/** Unified storage API combining task, settings, provider, secure storage, connector, desktop control, scheduler, and database lifecycle operations */
export interface StorageAPI
  extends
    TaskStorageAPI,
    AppSettingsAPI,
    ProviderSettingsAPI,
    SecureStorageAPI,
    ConnectorStorageAPI,
    DesktopControlStorageAPI,
    SchedulerStorageAPI,
    DatabaseLifecycleAPI {}

export type {
  Task,
  TaskStatus,
  TaskMessage,
  TodoItem,
  SelectedModel,
  OllamaConfig,
  LiteLLMConfig,
  AzureFoundryConfig,
  LMStudioConfig,
  ProviderId,
  ProviderSettings,
  ConnectedProvider,
  McpConnector,
  ConnectorStatus,
  OAuthTokens,
  CloudBrowserConfig,
  MessagingConfig,
};
