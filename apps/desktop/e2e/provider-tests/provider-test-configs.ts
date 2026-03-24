/**
 * Registry of provider test configurations.
 *
 * Each entry defines how to configure and authenticate a provider
 * for E2E testing with real API calls. Only providers with actual
 * spec files are included — add configs when you add specs.
 */

import type { ProviderTestConfig, ResolvedProviderTestConfig } from './types';
import { getProviderSecrets } from './secrets-loader';

/**
 * Default test models per provider.
 * These should be cheap, fast models suitable for testing.
 */
export const DEFAULT_TEST_MODELS: Record<string, string> = {
  openai: 'openai/gpt-5.1-codex-mini',
  google: 'google/gemini-3-flash-preview',
};

/**
 * Provider test configurations for providers that have spec files.
 */
export const PROVIDER_TEST_CONFIGS: Record<string, ProviderTestConfig> = {
  openai: {
    providerId: 'openai',
    displayName: 'OpenAI',
    authMethod: 'api-key',
  },
  google: {
    providerId: 'google',
    displayName: 'Google',
    authMethod: 'api-key',
    modelId: 'gemini-flash-2-5',
  },
  'bedrock-api-key': {
    providerId: 'bedrock',
    displayName: 'Bedrock (API Key)',
    authMethod: 'bedrock-api-key',
  },
  ollama: {
    providerId: 'ollama',
    displayName: 'Ollama',
    authMethod: 'ollama',
    timeout: 300000, // 5 min for model pulling + local inference
  },
};

/**
 * Get a fully resolved provider test config with secrets populated.
 * Throws if the config key is not registered.
 */
export function getProviderTestConfig(configKey: string): ResolvedProviderTestConfig {
  const config = PROVIDER_TEST_CONFIGS[configKey];
  if (!config) {
    throw new Error(`Provider test config not found for key: ${configKey}`);
  }

  const secrets = getProviderSecrets(configKey);

  return {
    ...config,
    secrets,
    modelId: DEFAULT_TEST_MODELS[config.providerId],
  };
}
