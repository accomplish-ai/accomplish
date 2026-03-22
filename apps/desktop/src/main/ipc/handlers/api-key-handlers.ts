/**
 * api-key-handlers.ts — thin orchestrator
 *
 * Delegates to focused sub-modules. All publicly-consumed symbols are
 * re-exported from here so existing import sites continue to work unchanged.
 */

// Sub-module registrations
import { registerSettingsApiKeyHandlers } from './api-key-handlers/settings-api-key-handlers';
import { registerApiKeyValidationHandlers } from './api-key-handlers/api-key-validation-handlers';
import { registerBedrockHandlers } from './api-key-handlers/bedrock-handlers';
import { registerModelDiscoveryHandlers } from './api-key-handlers/model-discovery-handlers';

// Re-export preserved symbols so external consumers keep working without changes
export {
  sanitizeString,
  validateApiKey,
  validateAzureFoundry,
  fetchBedrockModels,
  fetchProviderModels,
} from '@accomplish_ai/agent-core';
export { getStorage } from '../../store/storage';
export { storeApiKey } from '../../store/secureStorage';
export { ALLOWED_API_KEY_PROVIDERS } from '@accomplish_ai/agent-core';
export { API_KEY_VALIDATION_TIMEOUT_MS } from './utils';

// Re-export ProviderOptions type for consumers that need it
export type { ProviderOptions } from './api-key-handlers/api-key-validation-handlers';

export function registerApiKeyHandlers(): void {
  registerSettingsApiKeyHandlers();
  registerApiKeyValidationHandlers();
  registerBedrockHandlers();
  registerModelDiscoveryHandlers();
}
