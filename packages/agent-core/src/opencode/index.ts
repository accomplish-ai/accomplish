export {
  OpenCodeAdapter,
  createAdapter,
  OpenCodeCliNotFoundError,
} from './adapter.js';
export type {
  AdapterOptions,
  OpenCodeAdapterEvents,
} from './adapter.js';

export {
  TaskManager,
  createTaskManager,
} from './task-manager.js';
export type {
  TaskManagerOptions,
  TaskCallbacks,
  TaskProgressEvent,
} from './task-manager.js';

export {
  resolveCliPath,
  isCliAvailable,
  getCliVersion,
} from './cli-resolver.js';

export {
  generateConfig,
  getOpenCodeConfigPath,
  ACCOMPLISH_AGENT_NAME,
  buildCliArgs,
} from './config-generator.js';
export type {
  ConfigGeneratorOptions,
  ProviderConfig,
  ProviderModelConfig,
  GeneratedConfig,
  BuildCliArgsOptions,
} from './config-generator.js';

export { StreamParser } from './stream-parser.js';
export type { StreamParserEvents } from './stream-parser.js';

export {
  OpenCodeLogWatcher,
  createLogWatcher,
} from './log-watcher.js';
export type {
  OpenCodeLogError,
  LogWatcherEvents,
} from './log-watcher.js';

export {
  getOpenCodeDataHome,
  getOpenCodeAuthJsonPath,
  getOpenAiOauthStatus,
  getOpenCodeAuthPath,
  writeOpenCodeAuth,
} from './auth.js';

export {
  CompletionEnforcer,
  CompletionState,
  CompletionFlowState,
  getContinuationPrompt,
  getPartialContinuationPrompt,
  getIncompleteTodosPrompt,
} from './completion/index.js';
export type {
  CompletionEnforcerCallbacks,
  StepFinishAction,
  CompleteTaskArgs,
} from './completion/index.js';

export {
  ensureAzureFoundryProxy,
  stopAzureFoundryProxy,
  isAzureFoundryProxyRunning,
  transformAzureFoundryRequestBody,
  ensureMoonshotProxy,
  stopMoonshotProxy,
  isMoonshotProxyRunning,
  transformMoonshotRequestBody,
  getAzureEntraToken,
  clearAzureTokenCache,
  hasValidAzureToken,
  getAzureTokenExpiry,
} from './proxies/index.js';
export type {
  AzureFoundryProxyInfo,
  MoonshotProxyInfo,
} from './proxies/index.js';

export {
  MESSAGE_BATCH_DELAY_MS,
  extractScreenshots,
  sanitizeToolOutput,
  toTaskMessage,
  createMessageBatcher,
  queueMessage,
  flushAndCleanupBatcher,
} from './message-processor.js';
export type {
  MessageAttachment,
  MessageBatcher,
} from './message-processor.js';

export { buildOpenCodeEnvironment } from './environment.js';
export type { EnvironmentConfig, ApiKeys } from './environment.js';

export {
  buildProviderConfigs,
  syncApiKeysToOpenCodeAuth,
} from './config-builder.js';
export type {
  ConfigPaths,
  ProviderConfigResult,
  BuildProviderConfigsOptions,
} from './config-builder.js';
