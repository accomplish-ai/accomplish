export { validateApiKey, type ValidationResult, type ValidationOptions } from './validation.js';
export {
  getModelsForProvider,
  getDefaultModelForProvider,
  isValidModel,
  findModelById,
  getProviderById,
  providerRequiresApiKey,
  getApiKeyEnvVar,
  DEFAULT_PROVIDERS,
  DEFAULT_MODEL,
} from './models.js';
export {
  testModelToolSupport,
  testOllamaModelToolSupport,
  testLMStudioModelToolSupport,
  type ToolSupportTestOptions,
} from './tool-support-testing.js';
export {
  fetchOpenRouterModels,
  type OpenRouterModel,
  type FetchModelsResult,
} from './openrouter.js';
export {
  validateBedrockCredentials,
  fetchBedrockModels,
  type BedrockModel,
  type FetchBedrockModelsResult,
} from './bedrock.js';
export {
  testLiteLLMConnection,
  fetchLiteLLMModels,
  type LiteLLMConnectionResult,
  type FetchLiteLLMModelsOptions,
} from './litellm.js';
export { testOllamaConnection, type OllamaModel, type OllamaConnectionResult } from './ollama.js';
export {
  validateAzureFoundry,
  testAzureFoundryConnection,
  type AzureFoundryValidationOptions,
  type AzureFoundryConnectionOptions,
  type AzureFoundryConnectionResult,
} from './azure-foundry.js';
export {
  testLMStudioConnection,
  fetchLMStudioModels,
  validateLMStudioConfig,
  LMSTUDIO_REQUEST_TIMEOUT_MS,
  type LMStudioModel,
  type LMStudioConnectionResult,
  type LMStudioConnectionOptions,
  type LMStudioFetchModelsOptions,
} from './lmstudio.js';
export {
  fetchProviderModels,
  type FetchProviderModelsResult,
  type FetchProviderModelsOptions,
} from './fetch-models.js';

export {
  HF_LOCAL_DEFAULT_URL,
  HF_RECOMMENDED_MODELS,
  searchHuggingFaceHubModels,
  testHuggingFaceLocalConnection,
  fetchHuggingFaceLocalModels,
  type HuggingFaceHubModel,
} from './huggingface-local.js';
export { testCustomConnection, type CustomConnectionResult } from './custom.js';
export {
  testNimConnection,
  fetchNimModels,
  NIM_DEFAULT_BASE_URL,
  type NimConnectionResult,
  type FetchNimModelsOptions,
} from './nim.js';
export {
  getCopilotOAuthStatus,
  setCopilotOAuthTokens,
  clearCopilotOAuth,
  requestCopilotDeviceCode,
  pollCopilotDeviceToken,
  GITHUB_COPILOT_OAUTH_CLIENT_ID,
  GITHUB_COPILOT_DEVICE_CODE_URL,
  GITHUB_COPILOT_TOKEN_URL,
  GITHUB_COPILOT_AUTH_URL,
  GITHUB_COPILOT_SCOPE,
  type CopilotDeviceCodeResponse,
  type CopilotTokenResponse,
  type CopilotOAuthStatus,
  type CopilotAuthEntry,
} from './copilot.js';
