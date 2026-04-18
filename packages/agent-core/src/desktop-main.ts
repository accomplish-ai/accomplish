// =============================================================================
// @accomplish_ai/agent-core/desktop-main
// =============================================================================
// Safe entrypoint for the Electron main process. Every export re-exports from
// a concrete source module that is DB-free (i.e. does NOT transitively import
// `./storage/database.ts` or `better-sqlite3`).
//
// Invariant: re-exports MUST point at concrete files (e.g. `./daemon/client.js`),
// never at a barrel like `./index.js`, `./daemon/index.js`, or `./common.js`.
// Barrels drag in side-effects and dependency graphs we don't want — that is
// the exact bundling hazard this entrypoint is meant to eliminate.
//
// Milestone 1 of the daemon-only-SQLite migration
// (plan: /Users/yanai/.claude/plans/squishy-exploring-hamster.md).
// =============================================================================

// -----------------------------------------------------------------------------
// Daemon RPC infrastructure (client + transport + socket paths + PID lock)
// -----------------------------------------------------------------------------
export { DaemonClient } from './daemon/client.js';
export type { DaemonClientOptions } from './daemon/client.js';
export { createSocketTransport } from './daemon/socket-transport.js';
export type { SocketTransportOptions } from './daemon/socket-transport.js';
export { getSocketPath, getPidFilePath, getDaemonDir } from './daemon/socket-path.js';
export { acquirePidLock, PidLockError } from './daemon/pid-lock.js';
export type { PidLockHandle, PidLockPayload } from './daemon/pid-lock.js';
export { installCrashHandlers } from './daemon/crash-handlers.js';

// -----------------------------------------------------------------------------
// MCP OAuth helpers (pure HTTP fetch + PKCE)
// -----------------------------------------------------------------------------
export {
  discoverOAuthMetadata,
  discoverOAuthProtectedResourceMetadata,
  registerOAuthClient,
  generatePkceChallenge,
  buildAuthorizationUrl,
  exchangeCodeForTokens,
  refreshAccessToken,
  isTokenExpired,
} from './connectors/mcp-oauth.js';

// -----------------------------------------------------------------------------
// Provider validation & model discovery (pure HTTP)
// -----------------------------------------------------------------------------
export { validateApiKey } from './providers/validation.js';
export { validateBedrockCredentials, fetchBedrockModels } from './providers/bedrock.js';
export { validateVertexCredentials, fetchVertexModels } from './providers/vertex.js';
export { validateAzureFoundry, testAzureFoundryConnection } from './providers/azure-foundry.js';
export { fetchOpenRouterModels } from './providers/openrouter.js';
export { testNimConnection, fetchNimModels } from './providers/nim.js';
export { testOllamaConnection } from './providers/ollama.js';
export { fetchProviderModels } from './providers/fetch-models.js';
export { testLiteLLMConnection, fetchLiteLLMModels } from './providers/litellm.js';
export {
  testLMStudioConnection,
  fetchLMStudioModels,
  validateLMStudioConfig,
} from './providers/lmstudio.js';
export { testCustomConnection } from './providers/custom.js';

// GitHub Copilot device OAuth (pure HTTP)
export {
  requestCopilotDeviceCode,
  pollCopilotDeviceToken,
  setCopilotOAuthTokens,
  clearCopilotOAuth,
  getCopilotOAuthStatus,
} from './providers/copilot.js';
export type {
  CopilotDeviceCodeResponse,
  CopilotTokenResponse,
  CopilotOAuthStatus,
} from './providers/copilot.js';

// -----------------------------------------------------------------------------
// OpenCode auth (reads auth.json from disk — file I/O, no DB)
// -----------------------------------------------------------------------------
export {
  getSlackMcpOauthStatus,
  clearSlackMcpAuth,
  getSlackMcpCallbackUrl,
  setSlackMcpPendingAuth,
  setSlackMcpTokens,
  OPENCODE_SLACK_MCP_CLIENT_ID,
  OPENCODE_SLACK_MCP_SERVER_URL,
  OPENCODE_SLACK_MCP_CALLBACK_HOST,
  OPENCODE_SLACK_MCP_CALLBACK_PORT,
  OPENCODE_SLACK_MCP_CALLBACK_PATH,
} from './opencode/auth.js';

// OpenCode CLI resolution (filesystem only)
export { resolveCliPath, isCliAvailable } from './opencode/cli-resolver.js';

// -----------------------------------------------------------------------------
// Pure utilities
// -----------------------------------------------------------------------------
export { sanitizeString } from './utils/sanitize.js';
export { validateHttpUrl } from './utils/url.js';
export { redact } from './utils/redact.js';
export { getExtendedNodePath, findCommandInPath } from './utils/system-path.js';
export {
  getBundledNodePaths,
  isBundledNodeAvailable,
  getNodePath,
  getNpmPath,
  getNpxPath,
  logBundledNodeInfo,
} from './utils/bundled-node.js';
export type { BundledNodePathsExtended } from './utils/bundled-node.js';

// Validation schemas (zod; runtime-safe)
export {
  taskConfigSchema,
  permissionResponseSchema,
  resumeSessionSchema,
  validate,
} from './common/schemas/validation.js';

// Task summary generator (pure LLM HTTP call)
export { generateTaskSummary } from './services/summarizer.js';
export type { GetApiKeyFn } from './services/summarizer.js';

// Dev-browser server lifecycle (child_process + fs only)
export { shutdownDevBrowserServer } from './browser/server.js';

// Speech service factory (uses SecureStorage for API key — SecureStorage is
// file-based AES, no SQLite)
export { createSpeechService } from './factories/speech.js';
export type { SpeechServiceAPI, SpeechServiceOptions } from './types/speech.js';
export type { TranscriptionResult, TranscriptionError } from './types/speech.js';
export type { SecureStorageAPI } from './types/storage.js';

// -----------------------------------------------------------------------------
// Schema error class (pure class, no DB imports)
// -----------------------------------------------------------------------------
export { FutureSchemaError } from './storage/migrations/errors.js';

// -----------------------------------------------------------------------------
// Log writer factory (file I/O only — uses internal LogFileWriter/LogCollector)
// -----------------------------------------------------------------------------
export { createLogWriter } from './factories/log-writer.js';
export type { LogWriterAPI, LogWriterOptions } from './types/log-writer.js';

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------
export { DEV_BROWSER_PORT, DEV_BROWSER_CDP_PORT } from './common/constants.js';

// -----------------------------------------------------------------------------
// ID utilities
// -----------------------------------------------------------------------------
export { createMessageId, createTaskId } from './common/utils/id.js';

// -----------------------------------------------------------------------------
// Pure types used by Electron main
// -----------------------------------------------------------------------------
export type { PlatformConfig, CliResolverConfig, ResolvedCliPaths } from './types.js';

export type { Task, TaskMessage, TaskConfig, FileAttachmentInfo } from './common/types/task.js';
export type { TodoItem } from './common/types/todo.js';
export type { Skill } from './common/types/skills.js';
export type {
  GoogleAccount,
  GoogleAccountStatus,
  GoogleAccountToken,
} from './common/types/google-account.js';
export type {
  Workspace,
  WorkspaceCreateInput,
  WorkspaceUpdateInput,
  KnowledgeNote,
  KnowledgeNoteCreateInput,
  KnowledgeNoteUpdateInput,
} from './common/types/workspace.js';
export type {
  McpConnector,
  OAuthMetadata,
  OAuthClientRegistration,
} from './common/types/connector.js';
export type {
  TaskManagerOptions,
  TaskCallbacks,
  TaskProgressEvent,
  TaskManagerAPI,
} from './types/task-manager.js';

export type {
  HuggingFaceLocalConfig,
  OllamaConfig,
  AzureFoundryConfig,
  LiteLLMConfig,
  LMStudioConfig,
  NimConfig,
  SelectedModel,
  ProviderType,
  ApiKeyProvider,
} from './common/types/provider.js';
export {
  ALLOWED_API_KEY_PROVIDERS,
  STANDARD_VALIDATION_PROVIDERS,
  DEFAULT_PROVIDERS,
  ZAI_ENDPOINTS,
} from './common/types/provider.js';

// Logging types (shared across LogWriter wrappers in main)
export type { LogLevel, LogSource, LogEntry } from './common/types/logging.js';

export type {
  ProviderId,
  ConnectedProvider,
  ZaiRegion,
  AccomplishAiCredentials,
} from './common/types/providerSettings.js';

export type { CreditUsage } from './common/types/gateway.js';
export type { BedrockCredentials, VertexCredentials } from './common/types/auth.js';

// Milestone 2 of the daemon-only-SQLite migration. M3 uses these payload
// types to type-check renderer subscriptions to the daemon's
// `settings.changed` and `workspace.changed` notifications, and to type
// the result shape for M5's first-frame `settings.getAll` read.
export type {
  SettingsSnapshot,
  SettingsChangePayload,
  WorkspaceChangePayload,
  WorkspaceSetActiveResult,
  WorkspaceDeleteResult,
  LegacyImportResult,
  LegacyImportPaths,
  // Milestone 4 — daemon-owned Google accounts + skills notification payloads.
  GwsAccountAddInput,
  GwsAccountTokenResult,
  GwsAccountStatusChangedPayload,
  SkillsChangedPayload,
} from './common/types/daemon.js';

// M2 scope-completeness follow-up: the built-in connector auth-store blob
// that M3 repoints `connector-auth-entry.ts` onto. Lives in
// `common/types/connector.ts` because it's a shared data contract, not a
// daemon-specific payload.
export type { StoredAuthEntry } from './common/types/connector.js';
