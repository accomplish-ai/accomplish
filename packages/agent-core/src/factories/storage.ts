import {
  initializeDatabase,
  closeDatabase,
  isDatabaseInitialized,
  getDatabasePath,
} from '../storage/database.js';
import {
  getTasks,
  getTask,
  saveTask,
  updateTaskStatus,
  addTaskMessage,
  updateTaskSessionId,
  updateTaskSummary,
  deleteTask,
  clearHistory,
  getTodosForTask,
  saveTodosForTask,
  clearTodosForTask,
} from '../storage/repositories/taskHistory.js';
import {
  getDebugMode,
  setDebugMode,
  getOnboardingComplete,
  setOnboardingComplete,
  getSelectedModel,
  setSelectedModel,
  getOllamaConfig,
  setOllamaConfig,
  getLiteLLMConfig,
  setLiteLLMConfig,
  getAzureFoundryConfig,
  setAzureFoundryConfig,
  getLMStudioConfig,
  setLMStudioConfig,
  getOpenAiBaseUrl,
  setOpenAiBaseUrl,
  getAppSettings,
  clearAppSettings,
} from '../storage/repositories/appSettings.js';
import {
  getProviderSettings,
  setActiveProvider,
  getActiveProviderId,
  getConnectedProvider,
  setConnectedProvider,
  removeConnectedProvider,
  updateProviderModel,
  setProviderDebugMode,
  getProviderDebugMode,
  clearProviderSettings,
  getActiveProviderModel,
  hasReadyProvider,
  getConnectedProviderIds,
} from '../storage/repositories/providerSettings.js';
import { SecureStorage } from '../internal/classes/SecureStorage.js';
import type { StorageAPI, StorageOptions } from '../types/storage.js';

export function createStorage(options: StorageOptions = {}): StorageAPI {
  const {
    databasePath,
    runMigrations = true,
    userDataPath,
    secureStorageAppId = 'ai.accomplish.desktop',
    secureStorageFileName,
  } = options;

  const storagePath = userDataPath || process.cwd();
  const secureStorage = new SecureStorage({
    storagePath,
    appId: secureStorageAppId,
    ...(secureStorageFileName && { fileName: secureStorageFileName }),
  });

  let initialized = false;

  return {
    // Task History
    getTasks: () => getTasks(),
    getTask: (taskId) => getTask(taskId),
    saveTask: (task) => saveTask(task),
    updateTaskStatus: (taskId, status, completedAt) => updateTaskStatus(taskId, status, completedAt),
    addTaskMessage: (taskId, message) => addTaskMessage(taskId, message),
    updateTaskSessionId: (taskId, sessionId) => updateTaskSessionId(taskId, sessionId),
    updateTaskSummary: (taskId, summary) => updateTaskSummary(taskId, summary),
    deleteTask: (taskId) => deleteTask(taskId),
    clearHistory: () => clearHistory(),
    getTodosForTask: (taskId) => getTodosForTask(taskId),
    saveTodosForTask: (taskId, todos) => saveTodosForTask(taskId, todos),
    clearTodosForTask: (taskId) => clearTodosForTask(taskId),

    // App Settings
    getDebugMode: () => getDebugMode(),
    setDebugMode: (enabled) => setDebugMode(enabled),
    getOnboardingComplete: () => getOnboardingComplete(),
    setOnboardingComplete: (complete) => setOnboardingComplete(complete),
    getSelectedModel: () => getSelectedModel(),
    setSelectedModel: (model) => setSelectedModel(model),
    getOllamaConfig: () => getOllamaConfig(),
    setOllamaConfig: (config) => setOllamaConfig(config),
    getLiteLLMConfig: () => getLiteLLMConfig(),
    setLiteLLMConfig: (config) => setLiteLLMConfig(config),
    getAzureFoundryConfig: () => getAzureFoundryConfig(),
    setAzureFoundryConfig: (config) => setAzureFoundryConfig(config),
    getLMStudioConfig: () => getLMStudioConfig(),
    setLMStudioConfig: (config) => setLMStudioConfig(config),
    getOpenAiBaseUrl: () => getOpenAiBaseUrl(),
    setOpenAiBaseUrl: (baseUrl) => setOpenAiBaseUrl(baseUrl),
    getAppSettings: () => getAppSettings(),
    clearAppSettings: () => clearAppSettings(),

    // Provider Settings
    getProviderSettings: () => getProviderSettings(),
    setActiveProvider: (providerId) => setActiveProvider(providerId),
    getActiveProviderId: () => getActiveProviderId(),
    getConnectedProvider: (providerId) => getConnectedProvider(providerId),
    setConnectedProvider: (providerId, provider) => setConnectedProvider(providerId, provider),
    removeConnectedProvider: (providerId) => removeConnectedProvider(providerId),
    updateProviderModel: (providerId, modelId) => updateProviderModel(providerId, modelId),
    setProviderDebugMode: (enabled) => setProviderDebugMode(enabled),
    getProviderDebugMode: () => getProviderDebugMode(),
    clearProviderSettings: () => clearProviderSettings(),
    getActiveProviderModel: () => getActiveProviderModel(),
    hasReadyProvider: () => hasReadyProvider(),
    getConnectedProviderIds: () => getConnectedProviderIds(),

    // Secure Storage
    storeApiKey: (provider, apiKey) => secureStorage.storeApiKey(provider, apiKey),
    getApiKey: (provider) => secureStorage.getApiKey(provider),
    deleteApiKey: (provider) => secureStorage.deleteApiKey(provider),
    getAllApiKeys: () => secureStorage.getAllApiKeys(),
    storeBedrockCredentials: (credentials) => secureStorage.storeBedrockCredentials(credentials),
    getBedrockCredentials: () => secureStorage.getBedrockCredentials(),
    hasAnyApiKey: () => secureStorage.hasAnyApiKey(),
    listStoredCredentials: () => secureStorage.listStoredCredentials(),
    clearSecureStorage: () => secureStorage.clearSecureStorage(),

    // Lifecycle
    initialize() {
      if (initialized && isDatabaseInitialized()) {
        return;
      }
      const dbPath = databasePath || `${storagePath}/agent-core.db`;
      initializeDatabase({ databasePath: dbPath, runMigrations });
      initialized = true;
    },
    close() {
      closeDatabase();
      initialized = false;
    },
    isDatabaseInitialized: () => isDatabaseInitialized(),
    getDatabasePath: () => getDatabasePath(),
  };
}

export type { StorageAPI, StorageOptions };
