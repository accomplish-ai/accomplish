export { validateApiKey, type ValidationResult, type ValidationOptions } from './validation.js';
export {
  type ConnectionResult,
  type UrlValidationResult,
  validateAndSanitizeUrl,
  extractApiErrorMessage,
  handleConnectionError,
  toConnectionError,
  createFailureResult,
  createSuccessResult,
} from './provider-utils.js';
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
export {
  testOllamaConnection,
  type OllamaModel,
  type OllamaConnectionResult,
} from './ollama.js';
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
  testNimConnection,
  fetchNimModels,
  validateNimConfig,
  testNimModelToolSupport,
  NIM_REQUEST_TIMEOUT_MS,
  type NimModel,
  type NimConnectionResult,
  type NimConnectionOptions,
  type NimFetchModelsOptions,
  type NimModelProbeResult,
} from './nim.js';
