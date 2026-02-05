// =============================================================================
// @accomplish/core - Public API
// =============================================================================
// This file explicitly exports the public API for the @accomplish/core package.
// All exports are explicit named exports to ensure API stability and clarity.
// =============================================================================

// -----------------------------------------------------------------------------
// Types (from ./types.ts)
// -----------------------------------------------------------------------------
export type {
  PlatformConfig,
  PermissionHandler,
  TaskEventHandler,
  StorageConfig,
  CliResolverConfig,
  ResolvedCliPaths,
  BundledNodePaths,
} from './types.js';

// -----------------------------------------------------------------------------
// OpenCode Module (from ./opencode/)
// -----------------------------------------------------------------------------

// Classes
export {
  OpenCodeAdapter,
  OpenCodeCliNotFoundError,
} from './opencode/adapter.js';

export { TaskManager } from './opencode/task-manager.js';

export { OpenCodeLogWatcher, createLogWatcher } from './opencode/log-watcher.js';

export { StreamParser } from './opencode/stream-parser.js';

export { CompletionEnforcer } from './opencode/completion/index.js';

// Adapter types
export type {
  AdapterOptions,
  OpenCodeAdapterEvents,
} from './opencode/adapter.js';

// Task manager types
export type {
  TaskManagerOptions,
  TaskCallbacks,
  TaskProgressEvent,
} from './opencode/task-manager.js';

// Log watcher types
export type { OpenCodeLogError } from './opencode/log-watcher.js';

// CLI resolver functions
export { resolveCliPath, isCliAvailable } from './opencode/cli-resolver.js';

// Config generator functions and constants
export {
  generateConfig,
  buildCliArgs,
  ACCOMPLISH_AGENT_NAME,
} from './opencode/config-generator.js';

// Environment functions
export { buildOpenCodeEnvironment } from './opencode/environment.js';

export type { EnvironmentConfig } from './opencode/environment.js';

// Config builder functions
export { buildProviderConfigs, syncApiKeysToOpenCodeAuth } from './opencode/config-builder.js';

// Auth functions
export { getOpenCodeAuthPath, getOpenAiOauthStatus } from './opencode/auth.js';

// Message processor functions
export {
  toTaskMessage,
  queueMessage,
  flushAndCleanupBatcher,
} from './opencode/message-processor.js';

// Completion module types
export type { CompletionEnforcerCallbacks } from './opencode/completion/index.js';

// Proxies
export {
  stopAzureFoundryProxy,
  stopMoonshotProxy,
  getAzureEntraToken,
} from './opencode/proxies/index.js';

// -----------------------------------------------------------------------------
// Storage Module (from ./storage/)
// -----------------------------------------------------------------------------

// Classes
export { SecureStorage, createSecureStorage } from './storage/secure-storage.js';

// Database functions
export {
  getDatabase,
  initializeDatabase,
  closeDatabase,
  resetDatabase,
  databaseExists,
  isDatabaseInitialized,
} from './storage/database.js';

// Errors
export { FutureSchemaError } from './storage/migrations/errors.js';

// Task history repository functions
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
  getTodosForTask,
  saveTodosForTask,
  clearTodosForTask,
  flushPendingTasks,
} from './storage/repositories/taskHistory.js';

// App settings repository functions
export {
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
} from './storage/repositories/appSettings.js';

// Provider settings repository functions
export {
  getProviderSettings,
  clearProviderSettings,
  setActiveProvider,
  getConnectedProvider,
  setConnectedProvider,
  removeConnectedProvider,
  updateProviderModel,
  setProviderDebugMode,
  getProviderDebugMode,
  hasReadyProvider,
  getActiveProviderModel,
} from './storage/repositories/providerSettings.js';

// -----------------------------------------------------------------------------
// Providers Module (from ./providers/)
// -----------------------------------------------------------------------------

// Validation functions
export { validateApiKey } from './providers/validation.js';

export {
  validateBedrockCredentials,
  fetchBedrockModels,
} from './providers/bedrock.js';

export {
  validateAzureFoundry,
  testAzureFoundryConnection,
} from './providers/azure-foundry.js';

export { fetchOpenRouterModels } from './providers/openrouter.js';

export { testLiteLLMConnection, fetchLiteLLMModels } from './providers/litellm.js';

export { testOllamaConnection } from './providers/ollama.js';

export { testOllamaModelToolSupport } from './providers/tool-support-testing.js';

export {
  testLMStudioConnection,
  fetchLMStudioModels,
  validateLMStudioConfig,
} from './providers/lmstudio.js';

// -----------------------------------------------------------------------------
// Utils Module (from ./utils/)
// -----------------------------------------------------------------------------

// Bundled Node functions
export {
  getBundledNodePaths,
  isBundledNodeAvailable,
  getNodePath,
  getNpmPath,
  getNpxPath,
  logBundledNodeInfo,
} from './utils/bundled-node.js';

export type { BundledNodePathsExtended } from './utils/bundled-node.js';

// System path functions
export { getExtendedNodePath, findCommandInPath } from './utils/system-path.js';

// Sanitization functions
export { sanitizeString } from './utils/sanitize.js';

// URL validation functions
export { validateHttpUrl } from './utils/url.js';

// Task validation functions
export { validateTaskConfig } from './utils/task-validation.js';

// JSON parsing functions
export { safeParseJson } from './utils/json.js';

export type { SafeParseResult } from './utils/json.js';

// Redaction functions
export { redact } from './utils/redact.js';

// Task status mapping
export { mapResultToStatus } from './utils/task-status.js';

// Logging classes
export { LogFileWriter } from './utils/log-file-writer.js';

export { LogCollector } from './utils/log-collector.js';

// -----------------------------------------------------------------------------
// Browser Module (from ./browser/)
// -----------------------------------------------------------------------------

export { ensureDevBrowserServer } from './browser/server.js';

export type { BrowserServerConfig } from './browser/server.js';

// -----------------------------------------------------------------------------
// Services Module (from ./services/)
// -----------------------------------------------------------------------------

// Classes
export { PermissionRequestHandler } from './services/permission-handler.js';

export { ThoughtStreamHandler } from './services/thought-stream-handler.js';

export { SpeechService, createSpeechService } from './services/speech.js';

// Service types
export type {
  FilePermissionRequestData,
  QuestionRequestData,
  QuestionResponseData,
} from './services/permission-handler.js';

export type { TranscriptionResult, TranscriptionError } from './services/speech.js';

// Summarizer functions
export { generateTaskSummary } from './services/summarizer.js';

export type { GetApiKeyFn } from './services/summarizer.js';

// -----------------------------------------------------------------------------
// Skills Module (from ./skills/)
// -----------------------------------------------------------------------------

export { SkillsManager } from './skills/skills-manager.js';

// -----------------------------------------------------------------------------
// Shared Module (from ./shared/) - Merged from @accomplish/shared
// -----------------------------------------------------------------------------

// Task types
export type {
  TaskStatus,
  TaskConfig,
  Task,
  TaskAttachment,
  TaskMessage,
  TaskResult,
  TaskProgress,
  TaskUpdateEvent,
} from './shared/types/task.js';
export { STARTUP_STAGES } from './shared/types/task.js';

// Permission types
export type {
  FileOperation,
  PermissionRequest,
  PermissionOption,
  PermissionResponse,
} from './shared/types/permission.js';
export {
  FILE_OPERATIONS,
  FILE_PERMISSION_REQUEST_PREFIX,
  QUESTION_REQUEST_PREFIX,
} from './shared/types/permission.js';

// Provider types
export type {
  ProviderType,
  ApiKeyProvider,
  ProviderConfig,
  ModelConfig,
  SelectedModel,
  OllamaConfig,
  AzureFoundryConfig,
  LiteLLMModel,
  LiteLLMConfig,
  LMStudioConfig,
} from './shared/types/provider.js';
export {
  DEFAULT_PROVIDERS,
  DEFAULT_MODEL,
  ALLOWED_API_KEY_PROVIDERS,
  STANDARD_VALIDATION_PROVIDERS,
  ZAI_ENDPOINTS,
} from './shared/types/provider.js';

// Provider settings types
export type {
  ProviderId,
  ProviderCategory,
  ProviderMeta,
  ConnectionStatus,
  ApiKeyCredentials,
  BedrockProviderCredentials,
  OllamaCredentials,
  OpenRouterCredentials,
  LiteLLMCredentials,
  ZaiRegion,
  ZaiCredentials,
  LMStudioCredentials,
  AzureFoundryCredentials,
  OAuthCredentials,
  ProviderCredentials,
  ToolSupportStatus,
  ConnectedProvider,
  ProviderSettings,
} from './shared/types/providerSettings.js';
export {
  PROVIDER_META,
  DEFAULT_MODELS,
  PROVIDER_ID_TO_OPENCODE,
  isProviderReady,
  hasAnyReadyProvider,
  getActiveProvider,
  getDefaultModelForProvider,
} from './shared/types/providerSettings.js';

// Auth types
export type {
  ApiKeyConfig,
  BedrockCredentials,
  BedrockAccessKeyCredentials,
  BedrockProfileCredentials,
  BedrockApiKeyCredentials,
} from './shared/types/auth.js';

// OpenCode message types
export type {
  OpenCodeMessage,
  OpenCodeMessageBase,
  OpenCodeToolUseMessage,
  OpenCodeStepStartMessage,
  OpenCodeTextMessage,
  OpenCodeToolCallMessage,
  OpenCodeToolResultMessage,
  OpenCodeStepFinishMessage,
  OpenCodeErrorMessage,
} from './shared/types/opencode.js';

// Skills types
export type { SkillSource, Skill, SkillFrontmatter } from './shared/types/skills.js';

// Other types
export type { TodoItem } from './shared/types/todo.js';
export type { LogLevel, LogSource, LogEntry } from './shared/types/logging.js';
export type { ThoughtEvent, CheckpointEvent } from './shared/types/thought-stream.js';

// Constants
export {
  DEV_BROWSER_PORT,
  DEV_BROWSER_CDP_PORT,
  THOUGHT_STREAM_PORT,
  PERMISSION_API_PORT,
  QUESTION_API_PORT,
  PERMISSION_REQUEST_TIMEOUT_MS,
  LOG_MAX_FILE_SIZE_BYTES,
  LOG_RETENTION_DAYS,
  LOG_BUFFER_FLUSH_INTERVAL_MS,
  LOG_BUFFER_MAX_ENTRIES,
} from './shared/constants.js';

export {
  MODEL_DISPLAY_NAMES,
  PROVIDER_PREFIXES,
  getModelDisplayName,
} from './shared/constants/model-display.js';

// Utils
export {
  createTaskId,
  createMessageId,
  createFilePermissionRequestId,
  createQuestionRequestId,
  isFilePermissionRequest,
  isQuestionRequest,
} from './shared/utils/id.js';

export { stripAnsi, quoteForShell, getPlatformShell, getShellArgs } from './shared/utils/shell.js';
export { isPortInUse, waitForPortRelease } from './shared/utils/network.js';
export { isWaitingForUser } from './shared/utils/waiting-detection.js';
export { detectLogSource, LOG_SOURCE_PATTERNS } from './shared/utils/log-source-detector.js';

// Schemas
export {
  taskConfigSchema,
  permissionResponseSchema,
  resumeSessionSchema,
  validate,
} from './shared/schemas/validation.js';
