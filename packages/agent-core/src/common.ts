// =============================================================================
// @accomplish/agent-core/common - Browser-safe exports
// =============================================================================
// This file exports only browser-safe code (types, constants, pure functions).
// Use this entry point for renderer/browser contexts.
// =============================================================================

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

// Other types
export type { TodoItem } from './common/types/todo.js';
export type { LogLevel, LogSource, LogEntry } from './common/types/logging.js';
export type { ThoughtEvent, CheckpointEvent } from './common/types/thought-stream.js';

// === CONSTANTS (Browser-safe only) ===
// Note: System constants (ports, logging config) are NOT exported here.
// They are only available from the main index.ts entry point.
export {
  MODEL_DISPLAY_NAMES,
  PROVIDER_PREFIXES,
  getModelDisplayName,
} from './common/constants/model-display.js';

// === BROWSER-SAFE UTILS ===
export {
  createTaskId,
  createMessageId,
  createFilePermissionRequestId,
  createQuestionRequestId,
  isFilePermissionRequest,
  isQuestionRequest,
} from './common/utils/id.js';

export { isWaitingForUser } from './common/utils/waiting-detection.js';
export { detectLogSource, LOG_SOURCE_PATTERNS } from './common/utils/log-source-detector.js';

// === SCHEMAS ===
export {
  taskConfigSchema,
  permissionResponseSchema,
  resumeSessionSchema,
  validate,
} from './common/schemas/validation.js';
