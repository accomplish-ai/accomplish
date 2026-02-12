// =============================================================================
// @accomplish/core - Public API
// =============================================================================
// This file explicitly exports the public API for the @accomplish/core package.
// All exports are explicit named exports to ensure API stability and clarity.
// =============================================================================

// -----------------------------------------------------------------------------
// Factory Functions (NEW - Preferred API)
// -----------------------------------------------------------------------------
// Use these factory functions instead of directly instantiating classes.
// Factories return interfaces, hiding internal implementation details.

// Factory functions - new encapsulated API
export {
  createTaskManager,
  createStorage,
  createPermissionHandler,
  createThoughtStreamHandler,
  createLogWriter,
  createSkillsManager,
  createSpeechService,
} from './factories/index.js';

// -----------------------------------------------------------------------------
// API Interfaces (NEW - Public contracts)
// -----------------------------------------------------------------------------
// These interfaces define the public API contracts returned by factory functions.

// Preferred API names (aliased for clarity)
export type {
  // Task Manager API
  TaskManagerAPI,
  TaskManagerOptions as TaskManagerFactoryOptions,
  TaskAdapterOptions,
  TaskCallbacks as TaskManagerCallbacks,
  TaskProgressEvent as TaskManagerProgressEvent,
  // Storage API
  StorageAPI,
  StorageOptions,
  StoredTask,
  AppSettings,
  TaskStorageAPI,
  AppSettingsAPI,
  ProviderSettingsAPI,
  SecureStorageAPI,
  DatabaseLifecycleAPI,
  // Permission Handler API
  PermissionHandlerAPI,
  PermissionHandlerOptions,
  FilePermissionRequestData as PermissionFileRequestData,
  QuestionRequestData as PermissionQuestionRequestData,
  QuestionResponseData as PermissionQuestionResponseData,
  PermissionValidationResult,
  // Thought Stream API
  ThoughtStreamAPI,
  ThoughtStreamOptions,
  ThoughtEvent as ThoughtStreamEvent,
  CheckpointEvent as ThoughtStreamCheckpointEvent,
  ThoughtCategory,
  CheckpointStatus,
  // Log Writer API
  LogWriterAPI,
  LogWriterOptions,
  LogEntry as LogWriterEntry,
  // Skills Manager API
  SkillsManagerAPI,
  SkillsManagerOptions,
  // Speech Service API
  SpeechServiceAPI,
  SpeechServiceOptions,
  TranscriptionResult as SpeechTranscriptionResult,
  TranscriptionError as SpeechTranscriptionError,
} from './types/index.js';

// Backward-compatible re-exports (original names)
export type {
  TaskManagerOptions,
  TaskCallbacks,
  TaskProgressEvent,
  TranscriptionResult,
  TranscriptionError,
} from './types/index.js';

// -----------------------------------------------------------------------------
// Types (from ./types.ts)
// -----------------------------------------------------------------------------
export type {
  PlatformConfig,
  CliResolverConfig,
  ResolvedCliPaths,
  BundledNodePaths,
} from './types.js';

// -----------------------------------------------------------------------------
// OpenCode Module (from ./opencode/)
// -----------------------------------------------------------------------------

// Error classes (still exported - these are safe)
export { OpenCodeCliNotFoundError } from './opencode/adapter.js';

// Adapter types - AdapterOptions/OpenCodeAdapterEvents are internal (use TaskAdapterOptions)
// createLogWatcher/OpenCodeLogError are internal (used by OpenCodeAdapter internally)

// Low-level OpenCode utilities for advanced integrations
export { resolveCliPath, isCliAvailable } from './opencode/cli-resolver.js';

export {
  generateConfig,
  buildCliArgs,
  ACCOMPLISH_AGENT_NAME,
} from './opencode/config-generator.js';

export type { BrowserConfig } from './opencode/config-generator.js';

export { buildOpenCodeEnvironment } from './opencode/environment.js';

export type { EnvironmentConfig } from './opencode/environment.js';

export { buildProviderConfigs, syncApiKeysToOpenCodeAuth } from './opencode/config-builder.js';

export { getOpenCodeAuthPath, getOpenAiOauthStatus } from './opencode/auth.js';

// Message processing is now internal to TaskManager (use onBatchedMessages callback)
// CompletionEnforcerCallbacks is internal (wiring between adapter and enforcer)
// Proxy lifecycle is now internal to TaskManager.dispose()

export {
  getAzureEntraToken,
} from './opencode/proxies/index.js';

// -----------------------------------------------------------------------------
// Storage Module (from ./storage/)
// -----------------------------------------------------------------------------

// Errors
export { FutureSchemaError } from './storage/migrations/errors.js';

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
  validateVertexCredentials,
  fetchVertexModels,
  VertexClient,
} from './providers/vertex.js';

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

// Bundled Node.js binary path resolution
export {
  getBundledNodePaths,
  isBundledNodeAvailable,
  getNodePath,
  getNpmPath,
  getNpxPath,
  logBundledNodeInfo,
} from './utils/bundled-node.js';

export type { BundledNodePathsExtended } from './utils/bundled-node.js';

// System PATH resolution
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

export { mapResultToStatus } from './utils/task-status.js';

// Logging - use createLogWriter factory from ./factories/log-writer.js instead

// -----------------------------------------------------------------------------
// Browser Module (from ./browser/)
// -----------------------------------------------------------------------------

// Browser server for dev-browser MCP tool
export { ensureDevBrowserServer } from './browser/server.js';

export type { BrowserServerConfig } from './browser/server.js';

// -----------------------------------------------------------------------------
// Services Module (from ./services/)
// -----------------------------------------------------------------------------

// Summarizer functions
export { generateTaskSummary } from './services/summarizer.js';

export type { GetApiKeyFn } from './services/summarizer.js';

// -----------------------------------------------------------------------------
// Skills Module (from ./skills/)
// -----------------------------------------------------------------------------

// Use createSkillsManager factory from ./factories/skills-manager.js instead

// -----------------------------------------------------------------------------
// Shared Module (from ./common/) - Merged from @accomplish/shared
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
} from './common/types/task.js';
export { STARTUP_STAGES } from './common/types/task.js';

// Permission types
export type {
  FileOperation,
  PermissionRequest,
  PermissionOption,
  PermissionResponse,
} from './common/types/permission.js';
export {
  FILE_OPERATIONS,
  FILE_PERMISSION_REQUEST_PREFIX,
  QUESTION_REQUEST_PREFIX,
} from './common/types/permission.js';

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
} from './common/types/provider.js';
export {
  DEFAULT_PROVIDERS,
  DEFAULT_MODEL,
  ALLOWED_API_KEY_PROVIDERS,
  STANDARD_VALIDATION_PROVIDERS,
  ZAI_ENDPOINTS,
} from './common/types/provider.js';

// Provider settings types
export type {
  ProviderId,
  ProviderCategory,
  ProviderMeta,
  ConnectionStatus,
  ApiKeyCredentials,
  BedrockProviderCredentials,
  VertexProviderCredentials,
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
} from './common/types/providerSettings.js';
export {
  PROVIDER_META,
  DEFAULT_MODELS,
  PROVIDER_ID_TO_OPENCODE,
  isProviderReady,
  hasAnyReadyProvider,
  getActiveProvider,
  getDefaultModelForProvider,
} from './common/types/providerSettings.js';

// Auth types
export type {
  ApiKeyConfig,
  BedrockCredentials,
  BedrockAccessKeyCredentials,
  BedrockProfileCredentials,
  BedrockApiKeyCredentials,
  VertexCredentials,
  VertexServiceAccountCredentials,
  VertexAdcCredentials,
} from './common/types/auth.js';

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
} from './common/types/opencode.js';

// Skills types
export type { SkillSource, Skill, SkillFrontmatter } from './common/types/skills.js';

// Connector types
export type {
  ConnectorStatus,
  OAuthTokens,
  OAuthMetadata,
  OAuthClientRegistration,
  McpConnector,
} from './common/types/connector.js';

// MCP OAuth
export {
  discoverOAuthMetadata,
  registerOAuthClient,
  generatePkceChallenge,
  buildAuthorizationUrl,
  exchangeCodeForTokens,
  refreshAccessToken,
  isTokenExpired,
} from './connectors/mcp-oauth.js';

// Other types
export type { TodoItem } from './common/types/todo.js';
export type { LogLevel, LogSource, LogEntry } from './common/types/logging.js';
export type { ThoughtEvent, CheckpointEvent } from './common/types/thought-stream.js';

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
} from './common/constants.js';

export {
  MODEL_DISPLAY_NAMES,
  PROVIDER_PREFIXES,
  getModelDisplayName,
} from './common/constants/model-display.js';

// Utils
export {
  createTaskId,
  createMessageId,
  createFilePermissionRequestId,
  createQuestionRequestId,
  isFilePermissionRequest,
  isQuestionRequest,
} from './common/utils/id.js';

// Shell and network utilities for PTY spawning
export { stripAnsi, quoteForShell, getPlatformShell, getShellArgs } from './utils/shell.js';
export { isPortInUse, waitForPortRelease } from './utils/network.js';
export { isWaitingForUser } from './common/utils/waiting-detection.js';
export { detectLogSource, LOG_SOURCE_PATTERNS } from './common/utils/log-source-detector.js';

// Schemas
export {
  taskConfigSchema,
  permissionResponseSchema,
  resumeSessionSchema,
  validate,
} from './common/schemas/validation.js';
