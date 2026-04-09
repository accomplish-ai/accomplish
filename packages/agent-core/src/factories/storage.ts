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
  addFavorite,
  removeFavorite,
  getFavorites,
  isFavorite,
} from '../storage/repositories/favorites.js';
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
  getHuggingFaceLocalConfig,
  setHuggingFaceLocalConfig,
  getNimConfig,
  setNimConfig,
  getOpenAiBaseUrl,
  setOpenAiBaseUrl,
  getTheme,
  setTheme,
  getCloudBrowserConfig,
  setCloudBrowserConfig,
  getMessagingConfig,
  setMessagingConfig,
  getAppSettings,
  clearAppSettings,
  getSandboxConfig,
  setSandboxConfig,
  getNotificationsEnabled,
  setNotificationsEnabled,
  getCloseBehavior,
  setCloseBehavior,
  getLanguage,
  setLanguage,
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
  getAccomplishAiCredits,
  saveAccomplishAiCredits,
} from '../storage/repositories/providerSettings.js';
import {
  getAllConnectors,
  getEnabledConnectors,
  getConnectorById,
  upsertConnector,
  setConnectorEnabled,
  setConnectorStatus,
  deleteConnector,
  clearAllConnectors,
} from '../storage/repositories/connectors.js';
import {
  getDesktopBlocklist,
  setDesktopBlocklist,
  addDesktopBlocklistEntry,
  removeDesktopBlocklistEntry,
} from '../storage/repositories/desktopControl.js';
import {
  getAllScheduledTasks,
  getEnabledScheduledTasks,
  getScheduledTasksByWorkspace,
  getScheduledTaskById,
  createScheduledTask,
  deleteScheduledTask,
  setScheduledTaskEnabled,
  updateScheduledTaskLastRun,
} from '../storage/repositories/scheduled-tasks.js';
import { SecureStorage } from '../internal/classes/SecureStorage.js';
import type { OAuthTokens } from '../common/types/connector.js';
import type { StorageAPI, StorageOptions } from '../types/storage.js';
import { createConsoleLogger } from '../utils/logging.js';

const log = createConsoleLogger({ prefix: 'Storage' });

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
    getTasks: (workspaceId) => getTasks(workspaceId),
    getTask: (taskId) => getTask(taskId),
    saveTask: (task, workspaceId) => saveTask(task, workspaceId),
    updateTaskStatus: (taskId, status, completedAt) =>
      updateTaskStatus(taskId, status, completedAt),
    addTaskMessage: (taskId, message) => addTaskMessage(taskId, message),
    updateTaskSessionId: (taskId, sessionId) => updateTaskSessionId(taskId, sessionId),
    updateTaskSummary: (taskId, summary) => updateTaskSummary(taskId, summary),
    deleteTask: (taskId) => deleteTask(taskId),
    clearHistory: () => clearHistory(),
    getTodosForTask: (taskId) => getTodosForTask(taskId),
    saveTodosForTask: (taskId, todos) => saveTodosForTask(taskId, todos),
    clearTodosForTask: (taskId) => clearTodosForTask(taskId),
    addFavorite: (taskId, prompt, summary) => addFavorite(taskId, prompt, summary),
    removeFavorite: (taskId) => removeFavorite(taskId),
    getFavorites: () => getFavorites(),
    isFavorite: (taskId) => isFavorite(taskId),

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
    getHuggingFaceLocalConfig: () => getHuggingFaceLocalConfig(),
    setHuggingFaceLocalConfig: (config) => setHuggingFaceLocalConfig(config),
    getNimConfig: () => getNimConfig(),
    setNimConfig: (config) => setNimConfig(config),
    getOpenAiBaseUrl: () => getOpenAiBaseUrl(),
    setOpenAiBaseUrl: (baseUrl) => setOpenAiBaseUrl(baseUrl),
    getTheme: () => getTheme(),
    setTheme: (theme) => setTheme(theme),
    getCloudBrowserConfig: () => getCloudBrowserConfig(),
    setCloudBrowserConfig: (config) => setCloudBrowserConfig(config),
    getMessagingConfig: () => getMessagingConfig(),
    setMessagingConfig: (config) => setMessagingConfig(config),
    getAppSettings: () => getAppSettings(),
    clearAppSettings: () => clearAppSettings(),
    getSandboxConfig: () => getSandboxConfig(),
    setSandboxConfig: (config) => setSandboxConfig(config),
    getNotificationsEnabled: () => getNotificationsEnabled(),
    setNotificationsEnabled: (enabled) => setNotificationsEnabled(enabled),
    getCloseBehavior: () => getCloseBehavior(),
    setCloseBehavior: (behavior) => setCloseBehavior(behavior),
    getLanguage: () => getLanguage(),
    setLanguage: (language) => setLanguage(language),

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
    getAccomplishAiCredits: () => getAccomplishAiCredits(),
    saveAccomplishAiCredits: (usage) => saveAccomplishAiCredits(usage),

    // Connectors
    getAllConnectors: () => getAllConnectors(),
    getEnabledConnectors: () => getEnabledConnectors(),
    getConnectorById: (id) => getConnectorById(id),
    upsertConnector: (connector) => upsertConnector(connector),
    setConnectorEnabled: (id, enabled) => setConnectorEnabled(id, enabled),
    setConnectorStatus: (id, status) => setConnectorStatus(id, status),
    deleteConnector: (id) => deleteConnector(id),
    clearAllConnectors: () => clearAllConnectors(),
    storeConnectorTokens: (connectorId, tokens) =>
      secureStorage.set(`connector-tokens:${connectorId}`, JSON.stringify(tokens)),
    getConnectorTokens: (connectorId) => {
      const stored = secureStorage.get(`connector-tokens:${connectorId}`);
      if (!stored) return null;
      try {
        return JSON.parse(stored) as OAuthTokens;
      } catch {
        log.error(`Failed to parse connector tokens for ${connectorId}`);
        return null;
      }
    },
    deleteConnectorTokens: (connectorId) => secureStorage.delete(`connector-tokens:${connectorId}`),

    // Desktop Control
    getDesktopBlocklist: () => getDesktopBlocklist(),
    setDesktopBlocklist: (entries) => setDesktopBlocklist(entries),
    addDesktopBlocklistEntry: (entry) => addDesktopBlocklistEntry(entry),
    removeDesktopBlocklistEntry: (appName) => removeDesktopBlocklistEntry(appName),

    // Scheduled Tasks
    getAllScheduledTasks: () => getAllScheduledTasks(),
    getEnabledScheduledTasks: () => getEnabledScheduledTasks(),
    getScheduledTasksByWorkspace: (workspaceId) => getScheduledTasksByWorkspace(workspaceId),
    getScheduledTaskById: (id) => getScheduledTaskById(id),
    createScheduledTask: (cron, prompt, workspaceId) =>
      createScheduledTask(cron, prompt, workspaceId),
    deleteScheduledTask: (id) => deleteScheduledTask(id),
    setScheduledTaskEnabled: (id, enabled) => setScheduledTaskEnabled(id, enabled),
    updateScheduledTaskLastRun: (id, timestamp, nextRunAt) =>
      updateScheduledTaskLastRun(id, timestamp, nextRunAt),

    // Secure Storage
    set: (key, value) => secureStorage.set(key, value),
    get: (key) => secureStorage.get(key),
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
