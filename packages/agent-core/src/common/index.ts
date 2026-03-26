// packages/shared/src/index.ts

// === TYPES ===

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
} from './types/task.js';
export { STARTUP_STAGES } from './types/task.js';

// Permission types
export type {
  FileOperation,
  PermissionRequest,
  PermissionOption,
  PermissionResponse,
} from './types/permission.js';
export {
  FILE_OPERATIONS,
  FILE_PERMISSION_REQUEST_PREFIX,
  QUESTION_REQUEST_PREFIX,
} from './types/permission.js';

// Provider types
export type {
  ProviderType,
  ApiKeyProvider,
  ModelsEndpointConfig,
  ProviderConfig,
  ModelConfig,
  SelectedModel,
  OllamaConfig,
  AzureFoundryConfig,
  LiteLLMModel,
  LiteLLMConfig,
  LMStudioConfig,
  HuggingFaceLocalModelInfo,
  HuggingFaceLocalConfig,
  NimModel,
  NimConfig,
} from './types/provider.js';
export {
  DEFAULT_PROVIDERS,
  DEFAULT_MODEL,
  ALLOWED_API_KEY_PROVIDERS,
  STANDARD_VALIDATION_PROVIDERS,
  ZAI_ENDPOINTS,
  MINIMAX_DEFAULT_BASE_URL,
  NIM_DEFAULT_BASE_URL,
  COPILOT_MODELS,
} from './types/provider.js';

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
  CopilotOAuthCredentials,
  CustomCredentials,
  NimCredentials,
  ProviderCredentials,
  ToolSupportStatus,
  ConnectedProvider,
  ProviderSettings,
  HuggingFaceLocalCredentials,
} from './types/providerSettings.js';
export {
  PROVIDER_META,
  DEFAULT_MODELS,
  PROVIDER_ID_TO_OPENCODE,
  isProviderReady,
  hasAnyReadyProvider,
  getActiveProvider,
  getDefaultModelForProvider,
} from './types/providerSettings.js';

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
} from './types/auth.js';
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
} from './types/opencode.js';

// Skills types
export type { SkillSource, Skill, SkillFrontmatter } from './types/skills.js';

// Connector types
export {
  OAuthProviderId,
  getOAuthProviderDisplayName,
  isOAuthProviderId,
} from './types/connector.js';
export type { ConnectorStatus, OAuthTokens, McpConnector } from './types/connector.js';

// Workspace types
export type { Workspace, WorkspaceCreateInput, WorkspaceUpdateInput } from './types/workspace.js';

// Other types
export type { TodoItem } from './types/todo.js';
export type { LogLevel, LogSource, LogEntry } from './types/logging.js';
export type { ThoughtEvent, CheckpointEvent } from './types/thought-stream.js';

// === CONSTANTS ===
export {
  DEV_BROWSER_PORT,
  DEV_BROWSER_CDP_PORT,
  THOUGHT_STREAM_PORT,
  PERMISSION_API_PORT,
  QUESTION_API_PORT,
  PERMISSION_REQUEST_TIMEOUT_MS,
  CONNECTOR_AUTH_REQUIRED_MARKER,
  LOG_MAX_FILE_SIZE_BYTES,
  LOG_RETENTION_DAYS,
  LOG_BUFFER_FLUSH_INTERVAL_MS,
  LOG_BUFFER_MAX_ENTRIES,
} from './constants.js';

export {
  MODEL_DISPLAY_NAMES,
  PROVIDER_PREFIXES,
  getModelDisplayName,
} from './constants/model-display.js';

// === UTILS ===
export {
  createTaskId,
  createMessageId,
  createFilePermissionRequestId,
  createQuestionRequestId,
  isFilePermissionRequest,
  isQuestionRequest,
} from './utils/id.js';

export { isWaitingForUser } from './utils/waiting-detection.js';
export { detectLogSource, LOG_SOURCE_PATTERNS } from './utils/log-source-detector.js';

// === SCHEMAS ===
export {
  taskConfigSchema,
  permissionResponseSchema,
  resumeSessionSchema,
  validate,
} from './schemas/validation.js';
