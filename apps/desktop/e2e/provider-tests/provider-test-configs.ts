/**
 * Provider test configuration registry.
 * Central source of truth for provider E2E test configurations.
 */

import type { ProviderTestConfig, ResolvedProviderTestConfig, ApiKeySecrets } from './types';
import { getProviderSecrets, getTaskPrompt } from './secrets-loader';

/** Default connection timeout for provider tests (ms) */
const DEFAULT_CONNECTION_TIMEOUT = 30000;

/** Default task completion timeout for provider tests (ms) */
export const DEFAULT_TASK_TIMEOUT = 180000;

/**
 * Default model IDs for each provider.
 * These are used when no model is specified in secrets or config.
 * Prefer fast/cheap models for E2E tests.
 */
export const DEFAULT_TEST_MODELS: Record<string, string> = {
  // Standard API key providers
  anthropic: 'anthropic/claude-haiku-4-5',
  openai: 'openai/gpt-5.1-codex-mini',
  google: 'google/gemini-3-flash-preview',
  xai: 'xai/grok-3',
  deepseek: 'deepseek/deepseek-chat',
  moonshot: 'moonshot/kimi-latest',
  minimax: 'minimax/MiniMax-M2',
  openrouter: 'anthropic/claude-3.5-sonnet', // OpenRouter uses provider/model format
  zai: 'zai/glm-4.7-flashx',

  // AWS Bedrock (models fetched dynamically, this is a fallback)
  'bedrock-api-key': 'amazon-bedrock/deepseek.v3-v1:0',
  'bedrock-access-keys': 'us.anthropic.claude-sonnet-4-20250514-v1:0',
  'bedrock-profile': 'us.anthropic.claude-sonnet-4-20250514-v1:0',

  // Azure Foundry (deployment-specific, uses first available)
  'azure-foundry-api-key': '', // Model determined by deployment
  'azure-foundry-entra-id': '',

  // Local providers (models discovered at runtime)
  ollama: 'qwen3-vl:2b', // First available model
  lmstudio: '', // First available model
  litellm: '', // First available model
};

/**
 * Provider test configurations registry.
 * Maps config keys to their test configurations.
 */
export const PROVIDER_TEST_CONFIGS: Record<string, ProviderTestConfig> = {
  // === Standard API Key Providers ===
  openai: {
    configKey: 'openai',
    providerId: 'openai',
    displayName: 'OpenAI',
    authMethod: 'api-key',
    requiresShowAll: false,
    modelSelection: {
      strategy: 'specific',
      modelId: DEFAULT_TEST_MODELS.openai,
    },
    connectionTimeout: DEFAULT_CONNECTION_TIMEOUT,
  },

  anthropic: {
    configKey: 'anthropic',
    providerId: 'anthropic',
    displayName: 'Anthropic',
    authMethod: 'api-key',
    requiresShowAll: false,
    modelSelection: {
      strategy: 'specific',
      modelId: DEFAULT_TEST_MODELS.anthropic,
    },
    connectionTimeout: DEFAULT_CONNECTION_TIMEOUT,
  },

  google: {
    configKey: 'google',
    providerId: 'google',
    displayName: 'Google AI',
    authMethod: 'api-key',
    requiresShowAll: false,
    modelSelection: {
      strategy: 'specific',
      modelId: DEFAULT_TEST_MODELS.google,
    },
    connectionTimeout: DEFAULT_CONNECTION_TIMEOUT,
  },

  xai: {
    configKey: 'xai',
    providerId: 'xai',
    displayName: 'xAI',
    authMethod: 'api-key',
    requiresShowAll: false,
    modelSelection: {
      strategy: 'specific',
      modelId: DEFAULT_TEST_MODELS.xai,
    },
    connectionTimeout: DEFAULT_CONNECTION_TIMEOUT,
  },

  deepseek: {
    configKey: 'deepseek',
    providerId: 'deepseek',
    displayName: 'DeepSeek',
    authMethod: 'api-key',
    requiresShowAll: true,
    modelSelection: {
      strategy: 'specific',
      modelId: DEFAULT_TEST_MODELS.deepseek,
    },
    connectionTimeout: DEFAULT_CONNECTION_TIMEOUT,
  },

  moonshot: {
    configKey: 'moonshot',
    providerId: 'moonshot',
    displayName: 'Moonshot AI',
    authMethod: 'api-key',
    requiresShowAll: true,
    modelSelection: {
      strategy: 'specific',
      modelId: DEFAULT_TEST_MODELS.moonshot,
    },
    connectionTimeout: DEFAULT_CONNECTION_TIMEOUT,
  },

  minimax: {
    configKey: 'minimax',
    providerId: 'minimax',
    displayName: 'MiniMax',
    authMethod: 'api-key',
    requiresShowAll: true,
    modelSelection: {
      strategy: 'specific',
      modelId: DEFAULT_TEST_MODELS.minimax,
    },
    connectionTimeout: DEFAULT_CONNECTION_TIMEOUT,
  },

  openrouter: {
    configKey: 'openrouter',
    providerId: 'openrouter',
    displayName: 'OpenRouter',
    authMethod: 'api-key',
    requiresShowAll: false,
    modelSelection: {
      strategy: 'first', // OpenRouter has dynamic models
    },
    connectionTimeout: DEFAULT_CONNECTION_TIMEOUT,
  },

  zai: {
    configKey: 'zai',
    providerId: 'zai',
    displayName: 'Z.AI Coding Plan',
    authMethod: 'api-key',
    requiresShowAll: true,
    modelSelection: {
      strategy: 'specific',
      modelId: DEFAULT_TEST_MODELS.zai,
    },
    connectionTimeout: DEFAULT_CONNECTION_TIMEOUT,
  },

  // === AWS Bedrock ===
  'bedrock-api-key': {
    configKey: 'bedrock-api-key',
    providerId: 'bedrock',
    displayName: 'AWS Bedrock (API Key)',
    authMethod: 'bedrock-api-key',
    requiresShowAll: false,
    modelSelection: {
      strategy: 'specific', // Models fetched from AWS
      modelId: DEFAULT_TEST_MODELS['bedrock-api-key'],
    },
    connectionTimeout: 60000, // Bedrock can be slower to connect
  },

  'bedrock-access-keys': {
    configKey: 'bedrock-access-keys',
    providerId: 'bedrock',
    displayName: 'AWS Bedrock (Access Keys)',
    authMethod: 'bedrock-access-keys',
    requiresShowAll: false,
    modelSelection: {
      strategy: 'first',
    },
    connectionTimeout: 60000,
  },

  'bedrock-profile': {
    configKey: 'bedrock-profile',
    providerId: 'bedrock',
    displayName: 'AWS Bedrock (Profile)',
    authMethod: 'bedrock-profile',
    requiresShowAll: false,
    modelSelection: {
      strategy: 'first',
    },
    connectionTimeout: 60000,
  },

  // === Azure Foundry ===
  'azure-foundry-api-key': {
    configKey: 'azure-foundry-api-key',
    providerId: 'azure-foundry',
    displayName: 'Azure AI Foundry (API Key)',
    authMethod: 'azure-api-key',
    requiresShowAll: false,
    modelSelection: {
      strategy: 'first', // Model determined by deployment
    },
    connectionTimeout: 45000,
  },

  'azure-foundry-entra-id': {
    configKey: 'azure-foundry-entra-id',
    providerId: 'azure-foundry',
    displayName: 'Azure AI Foundry (Entra ID)',
    authMethod: 'azure-entra-id',
    requiresShowAll: false,
    modelSelection: {
      strategy: 'first',
    },
    connectionTimeout: 45000,
  },

  // === Local Providers ===
  ollama: {
    configKey: 'ollama',
    providerId: 'ollama',
    displayName: 'Ollama',
    authMethod: 'server-url',
    requiresShowAll: false,
    serverUrl: 'http://localhost:11434',
    modelSelection: {
      strategy: 'specific',
      modelId: DEFAULT_TEST_MODELS.ollama,
    },
    connectionTimeout: 30000,
  },

  lmstudio: {
    configKey: 'lmstudio',
    providerId: 'lmstudio',
    displayName: 'LM Studio',
    authMethod: 'server-url',
    requiresShowAll: false,
    modelSelection: {
      strategy: 'first',
    },
    connectionTimeout: 30000,
  },

  litellm: {
    configKey: 'litellm',
    providerId: 'litellm',
    displayName: 'LiteLLM',
    authMethod: 'server-url-with-optional-key',
    requiresShowAll: false,
    modelSelection: {
      strategy: 'first',
    },
    connectionTimeout: 30000,
  },
};

/**
 * Get the resolved model ID for a provider test.
 * Priority: secrets.modelId > config.modelSelection.modelId > DEFAULT_TEST_MODELS (for specific) > empty string
 */
function resolveModelId(configKey: string, config: ProviderTestConfig, secrets: unknown): string {
  // Check if secrets has a modelId override
  if (secrets && typeof secrets === 'object' && 'modelId' in secrets) {
    const secretsModelId = (secrets as ApiKeySecrets).modelId;
    if (secretsModelId) {
      return secretsModelId;
    }
  }

  // Use config's model selection if specific
  if (config.modelSelection.strategy === 'specific' && config.modelSelection.modelId) {
    return config.modelSelection.modelId;
  }

  // For 'first' strategy, return empty to indicate "select first available"
  if (config.modelSelection.strategy === 'first') {
    return '';
  }

  // Fall back to default test models
  return DEFAULT_TEST_MODELS[configKey] || '';
}

/**
 * Get the fully resolved provider test configuration.
 * Returns null if secrets are not configured for the provider.
 *
 * @param configKey - The provider config key (e.g., 'openai', 'bedrock-api-key')
 * @returns Resolved configuration with secrets, or null if secrets missing
 */
export function getProviderTestConfig(configKey: string): ResolvedProviderTestConfig | null {
  const config = PROVIDER_TEST_CONFIGS[configKey];
  if (!config) {
    console.warn(`[provider-test-configs] Unknown config key: ${configKey}`);
    return null;
  }

  const secrets = getProviderSecrets(configKey);
  if (!secrets) {
    return null;
  }

  return {
    config,
    secrets,
    taskPrompt: getTaskPrompt(),
    modelId: resolveModelId(configKey, config, secrets),
    connectionTimeout: config.connectionTimeout ?? DEFAULT_CONNECTION_TIMEOUT,
  };
}

/**
 * Get all available provider config keys.
 */
export function getAvailableConfigKeys(): string[] {
  return Object.keys(PROVIDER_TEST_CONFIGS);
}

/**
 * Check if a provider test configuration exists.
 */
export function hasProviderTestConfig(configKey: string): boolean {
  return configKey in PROVIDER_TEST_CONFIGS;
}
