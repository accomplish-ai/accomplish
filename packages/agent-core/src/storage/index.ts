export {
  SecureStorage,
  createSecureStorage,
  type SecureStorageOptions,
  type ApiKeyProvider,
} from './secure-storage.js';

export {
  getDatabase,
  initializeDatabase,
  closeDatabase,
  resetDatabaseInstance,
  resetDatabase,
  databaseExists,
  isDatabaseInitialized,
  getDatabasePath,
  type DatabaseOptions,
} from './database.js';

export {
  runMigrations,
  CURRENT_VERSION,
  getStoredVersion,
  setStoredVersion,
  registerMigration,
  type Migration,
} from './migrations/index.js';

export {
  FutureSchemaError,
  MigrationError,
  CorruptDatabaseError,
} from './migrations/errors.js';

export {
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
  type AppSettings,
} from './repositories/index.js';

export {
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
} from './repositories/index.js';

export {
  getTasks,
  getTask,
  saveTask,
  updateTaskStatus,
  addTaskMessage,
  updateTaskSessionId,
  updateTaskSummary,
  deleteTask,
  clearHistory,
  setMaxHistoryItems,
  clearTaskHistoryStore,
  flushPendingTasks,
  getTodosForTask,
  saveTodosForTask,
  clearTodosForTask,
  type StoredTask,
} from './repositories/index.js';

export {
  getAllSkills,
  getEnabledSkills,
  getSkillById,
  upsertSkill,
  setSkillEnabled,
  deleteSkill,
  clearAllSkills,
} from './repositories/index.js';

export {
  getAllConnectors,
  getEnabledConnectors,
  getConnectorById,
  upsertConnector,
  setConnectorEnabled,
  setConnectorStatus,
  deleteConnector,
  clearAllConnectors,
} from './repositories/index.js';
