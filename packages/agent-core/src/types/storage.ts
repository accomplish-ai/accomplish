import type { Task, TaskStatus, TaskMessage } from '../common/types/task.js';
import type { TodoItem } from '../common/types/todo.js';
import type {
  SelectedModel,
  OllamaConfig,
  LiteLLMConfig,
  AzureFoundryConfig,
  LMStudioConfig,
} from '../common/types/provider.js';
import type {
  ProviderId,
  ProviderSettings,
  ConnectedProvider,
} from '../common/types/providerSettings.js';

export interface StorageOptions {
  databasePath?: string;
  runMigrations?: boolean;
  userDataPath?: string;
  secureStorageAppId?: string;
  secureStorageFileName?: string;
}

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

export interface AppSettings {
  debugMode: boolean;
  onboardingComplete: boolean;
  selectedModel: SelectedModel | null;
  ollamaConfig: OllamaConfig | null;
  litellmConfig: LiteLLMConfig | null;
  azureFoundryConfig: AzureFoundryConfig | null;
  lmstudioConfig: LMStudioConfig | null;
  openaiBaseUrl: string;
}

// ---------------------------------------------------------------------------
// Sub-interfaces for focused, slice-level access
// ---------------------------------------------------------------------------

export interface TaskStorageAPI {
  getTasks(): StoredTask[];
  getTask(taskId: string): StoredTask | undefined;
  saveTask(task: Task): void;
  updateTaskStatus(taskId: string, status: TaskStatus, completedAt?: string): void;
  addTaskMessage(taskId: string, message: TaskMessage): void;
  updateTaskSessionId(taskId: string, sessionId: string): void;
  updateTaskSummary(taskId: string, summary: string): void;
  deleteTask(taskId: string): void;
  clearHistory(): void;
  getTodosForTask(taskId: string): TodoItem[];
  saveTodosForTask(taskId: string, todos: TodoItem[]): void;
  clearTodosForTask(taskId: string): void;
}

export interface AppSettingsAPI {
  getDebugMode(): boolean;
  setDebugMode(enabled: boolean): void;
  getOnboardingComplete(): boolean;
  setOnboardingComplete(complete: boolean): void;
  getSelectedModel(): SelectedModel | null;
  setSelectedModel(model: SelectedModel): void;
  getOllamaConfig(): OllamaConfig | null;
  setOllamaConfig(config: OllamaConfig | null): void;
  getLiteLLMConfig(): LiteLLMConfig | null;
  setLiteLLMConfig(config: LiteLLMConfig | null): void;
  getAzureFoundryConfig(): AzureFoundryConfig | null;
  setAzureFoundryConfig(config: AzureFoundryConfig | null): void;
  getLMStudioConfig(): LMStudioConfig | null;
  setLMStudioConfig(config: LMStudioConfig | null): void;
  getOpenAiBaseUrl(): string;
  setOpenAiBaseUrl(baseUrl: string): void;
  getAppSettings(): AppSettings;
  clearAppSettings(): void;
}

export interface ProviderSettingsAPI {
  getProviderSettings(): ProviderSettings;
  setActiveProvider(providerId: ProviderId | null): void;
  getActiveProviderId(): ProviderId | null;
  getConnectedProvider(providerId: ProviderId): ConnectedProvider | null;
  setConnectedProvider(providerId: ProviderId, provider: ConnectedProvider): void;
  removeConnectedProvider(providerId: ProviderId): void;
  updateProviderModel(providerId: ProviderId, modelId: string | null): void;
  setProviderDebugMode(enabled: boolean): void;
  getProviderDebugMode(): boolean;
  clearProviderSettings(): void;
  getActiveProviderModel(): {
    provider: ProviderId;
    model: string;
    baseUrl?: string;
  } | null;
  hasReadyProvider(): boolean;
  getConnectedProviderIds(): ProviderId[];
}

export interface SecureStorageAPI {
  storeApiKey(provider: string, apiKey: string): void;
  getApiKey(provider: string): string | null;
  deleteApiKey(provider: string): boolean;
  getAllApiKeys(): Promise<Record<string, string | null>>;
  storeBedrockCredentials(credentials: string): void;
  getBedrockCredentials(): Record<string, string> | null;
  hasAnyApiKey(): Promise<boolean>;
  listStoredCredentials(): Array<{ account: string; password: string }>;
  clearSecureStorage(): void;
}

export interface DatabaseLifecycleAPI {
  initialize(): void;
  close(): void;
  isDatabaseInitialized(): boolean;
  getDatabasePath(): string | null;
}

export interface StorageAPI
  extends TaskStorageAPI,
    AppSettingsAPI,
    ProviderSettingsAPI,
    SecureStorageAPI,
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
};
