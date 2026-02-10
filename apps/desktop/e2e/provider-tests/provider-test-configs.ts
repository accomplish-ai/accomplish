/**
 * Registry of provider test configurations.
 *
 * Each entry defines how to configure and authenticate a provider
 * for E2E testing with real API calls.
 */

import type { ProviderTestConfig, ResolvedProviderTestConfig, ProviderSecrets } from './types';
import { getProviderSecrets } from './secrets-loader';

/**
 * Default test models per provider (used when modelSelection is 'default').
 * These should be cheap, fast models suitable for testing.
 */
export const DEFAULT_TEST_MODELS: Record<string, string> = {
  anthropic: 'anthropic/claude-haiku-3',
  openai: 'openai/gpt-4o-mini',
  google: 'google/gemini-2.0-flash',
  xai: 'xai/grok-3-mini',
  deepseek: 'deepseek/deepseek-chat',
  moonshot: 'moonshot/moonshot-v1-auto',
  minimax: 'minimax/MiniMax-M1',
  openrouter: 'openrouter/anthropic/claude-haiku-3',
};

/**
 * Full registry of provider test configurations.
 * Keyed by config key (which maps to secrets.providers[key]).
 */
export const PROVIDER_TEST_CONFIGS: Record<string, ProviderTestConfig> = {
  // === Classic API Key Providers ===
  anthropic: {
    providerId: 'anthropic',
    displayName: 'Anthropic',
    authMethod: 'api-key',
    modelSelection: 'default',
    requiredSecretKeys: ['apiKey'],
  },
  openai: {
    providerId: 'openai',
    displayName: 'OpenAI',
    authMethod: 'api-key',
    modelSelection: 'default',
    requiredSecretKeys: ['apiKey'],
  },
  google: {
    providerId: 'google',
    displayName: 'Google',
    authMethod: 'api-key',
    modelSelection: 'default',
    requiredSecretKeys: ['apiKey'],
  },
  xai: {
    providerId: 'xai',
    displayName: 'xAI',
    authMethod: 'api-key',
    modelSelection: 'default',
    requiredSecretKeys: ['apiKey'],
  },
  deepseek: {
    providerId: 'deepseek',
    displayName: 'DeepSeek',
    authMethod: 'api-key',
    modelSelection: 'default',
    requiredSecretKeys: ['apiKey'],
  },
  moonshot: {
    providerId: 'moonshot',
    displayName: 'Moonshot',
    authMethod: 'api-key',
    modelSelection: 'default',
    requiredSecretKeys: ['apiKey'],
  },
  minimax: {
    providerId: 'minimax',
    displayName: 'MiniMax',
    authMethod: 'api-key',
    modelSelection: 'default',
    requiredSecretKeys: ['apiKey'],
  },
  openrouter: {
    providerId: 'openrouter',
    displayName: 'OpenRouter',
    authMethod: 'api-key',
    modelSelection: 'default',
    requiredSecretKeys: ['apiKey'],
  },

  // === AWS Bedrock ===
  'bedrock-api-key': {
    providerId: 'bedrock',
    displayName: 'Bedrock (API Key)',
    authMethod: 'bedrock-api-key',
    modelSelection: 'default',
    requiredSecretKeys: ['apiKey'],
    setupNotes: 'Uses Bedrock API Key authentication tab',
  },
  'bedrock-access-key': {
    providerId: 'bedrock',
    displayName: 'Bedrock (Access Key)',
    authMethod: 'bedrock-access-key',
    modelSelection: 'default',
    requiredSecretKeys: ['accessKeyId', 'secretAccessKey'],
    setupNotes: 'Uses Bedrock Access Key authentication tab',
  },
  'bedrock-profile': {
    providerId: 'bedrock',
    displayName: 'Bedrock (AWS Profile)',
    authMethod: 'bedrock-profile',
    modelSelection: 'default',
    requiredSecretKeys: ['profileName'],
    setupNotes: 'Uses Bedrock AWS Profile authentication tab',
  },

  // === Azure ===
  'azure-api-key': {
    providerId: 'azure-foundry',
    displayName: 'Azure AI Foundry (API Key)',
    authMethod: 'azure-api-key',
    modelSelection: 'specific',
    requiredSecretKeys: ['apiKey', 'endpoint', 'deploymentName'],
    setupNotes: 'Uses Azure AI Foundry API Key authentication',
  },
  'azure-entra-id': {
    providerId: 'azure-foundry',
    displayName: 'Azure AI Foundry (Entra ID)',
    authMethod: 'azure-entra-id',
    modelSelection: 'specific',
    requiredSecretKeys: ['endpoint', 'deploymentName'],
    setupNotes: 'Uses Azure Entra ID (OAuth) authentication',
  },

  // === Local Providers ===
  ollama: {
    providerId: 'ollama',
    displayName: 'Ollama',
    authMethod: 'ollama',
    modelSelection: 'first',
    requiredSecretKeys: [],
    timeout: 300000, // 5 min for model pulling
    setupNotes: 'Requires Ollama server running locally',
  },
  lmstudio: {
    providerId: 'lmstudio',
    displayName: 'LM Studio',
    authMethod: 'server-url',
    modelSelection: 'first',
    requiredSecretKeys: ['serverUrl'],
    setupNotes: 'Requires LM Studio server running locally',
  },

  // === Proxy/Hybrid ===
  litellm: {
    providerId: 'litellm',
    displayName: 'LiteLLM',
    authMethod: 'server-url-with-key',
    modelSelection: 'specific',
    requiredSecretKeys: ['serverUrl'],
    setupNotes: 'Requires LiteLLM proxy running',
  },

  // === Z.AI ===
  zai: {
    providerId: 'zai',
    displayName: 'Z.AI',
    authMethod: 'zai',
    modelSelection: 'default',
    requiredSecretKeys: ['apiKey'],
  },

  // === Custom ===
  custom: {
    providerId: 'custom',
    displayName: 'Custom Provider',
    authMethod: 'server-url-with-key',
    modelSelection: 'specific',
    requiredSecretKeys: ['serverUrl'],
  },
};

/**
 * Resolve the model ID for a provider test config.
 */
export function resolveModelId(config: ProviderTestConfig, secrets?: ProviderSecrets): string | undefined {
  switch (config.modelSelection) {
    case 'default':
      return DEFAULT_TEST_MODELS[config.providerId] ?? undefined;
    case 'specific':
      return config.specificModelId;
    case 'first':
      // For 'first', the model is selected dynamically from the UI
      // But if secrets include a modelId, use that
      if (secrets && 'modelId' in secrets) {
        return (secrets as { modelId?: string }).modelId;
      }
      return undefined;
    default:
      return undefined;
  }
}

/**
 * Get a fully resolved provider test config with secrets populated.
 * Returns undefined if secrets are not available for the given config key.
 */
export function getProviderTestConfig(configKey: string): ResolvedProviderTestConfig | undefined {
  const config = PROVIDER_TEST_CONFIGS[configKey];
  if (!config) return undefined;

  const secrets = getProviderSecrets(configKey);
  if (!secrets) return undefined;

  // Validate required secret keys are present
  for (const key of config.requiredSecretKeys) {
    if (!(key in secrets) || (secrets as Record<string, unknown>)[key] === undefined) {
      console.warn(`[Provider Config] Missing required secret '${key}' for ${configKey}`);
      return undefined;
    }
  }

  return {
    ...config,
    secrets,
    modelId: resolveModelId(config, secrets),
  };
}

/**
 * Get all config keys that have available secrets.
 */
export function getAvailableConfigKeys(): string[] {
  return Object.keys(PROVIDER_TEST_CONFIGS).filter(key => {
    const config = PROVIDER_TEST_CONFIGS[key];
    const secrets = getProviderSecrets(key);
    if (!secrets) return false;

    // Verify required keys
    for (const requiredKey of config.requiredSecretKeys) {
      if (!(requiredKey in secrets) || (secrets as Record<string, unknown>)[requiredKey] === undefined) {
        return false;
      }
    }
    return true;
  });
}

/**
 * Check if a provider test config exists for the given key.
 */
export function hasProviderTestConfig(configKey: string): boolean {
  return configKey in PROVIDER_TEST_CONFIGS;
}
