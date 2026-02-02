/**
 * Provider Builder
 *
 * Builds provider configurations for OpenCode CLI from ProviderSettings.
 * This module handles "standard" providers that use the openai-compatible SDK.
 *
 * For special providers (bedrock, azure-foundry, zai), see their dedicated
 * builder modules.
 *
 * @module config-generator/providers/builder
 */

import type {
  ProviderId,
  ProviderSettings,
  ConnectedProvider,
  LiteLLMCredentials,
  ToolSupportStatus,
} from '@accomplish/shared';
import type {
  OllamaProviderConfig,
  OpenRouterProviderConfig,
  MoonshotProviderConfig,
  LiteLLMProviderConfig,
  LMStudioProviderConfig,
} from '../types';
import {
  getProviderSpec,
  getBaseURL,
  stripModelIdPrefix,
  isSpecialProvider,
  getStandardProviderIds,
} from './registry';

/**
 * Standard provider config type (union of all standard provider configs)
 */
export type StandardProviderConfig =
  | OllamaProviderConfig
  | OpenRouterProviderConfig
  | MoonshotProviderConfig
  | LiteLLMProviderConfig
  | LMStudioProviderConfig;

/**
 * Parameters for building a single provider config
 */
export interface BuildProviderConfigParams {
  /** The provider ID to build config for */
  providerId: ProviderId | string;
  /** The provider settings containing connection info */
  providerSettings: ProviderSettings;
  /** Optional proxy base URL (for moonshot) */
  proxyBaseURL?: string;
  /** Optional API key (for providers that need it at build time) */
  apiKey?: string;
}

/**
 * Validates that a provider is ready for config generation
 *
 * @param provider - The connected provider to validate
 * @param expectedCredentialsType - The expected credentials type (or array of valid types)
 * @returns True if the provider is valid
 */
function isValidProvider(
  provider: ConnectedProvider | undefined,
  expectedCredentialsType: string | string[]
): boolean {
  if (!provider) return false;
  if (provider.connectionStatus !== 'connected') return false;
  if (!provider.selectedModelId) return false;

  const validTypes = Array.isArray(expectedCredentialsType)
    ? expectedCredentialsType
    : [expectedCredentialsType];

  return validTypes.includes(provider.credentials.type);
}

/**
 * Determines tool support for an LM Studio model
 *
 * @param provider - The LM Studio provider
 * @param modelId - The model ID (with or without prefix)
 * @returns Whether the model supports tools
 */
function getLMStudioToolSupport(provider: ConnectedProvider, modelId: string): boolean {
  const strippedModelId = stripModelIdPrefix(modelId);
  const selectedModelId = provider.selectedModelId;

  // Find the model in availableModels
  const modelInfo = provider.availableModels?.find(
    m => m.id === selectedModelId || m.id === strippedModelId || m.id === modelId
  );

  const toolSupport = (modelInfo as { toolSupport?: ToolSupportStatus })?.toolSupport;
  return toolSupport === 'supported';
}

/**
 * Build config for Ollama provider
 */
function buildOllamaConfig(
  provider: ConnectedProvider
): OllamaProviderConfig | null {
  const spec = getProviderSpec('ollama');
  if (!spec) return null;

  const baseURL = getBaseURL('ollama', provider.credentials);
  if (!baseURL) return null;

  const modelId = stripModelIdPrefix(provider.selectedModelId!);

  return {
    npm: spec.npm,
    name: spec.displayName,
    options: {
      baseURL,
    },
    models: {
      [modelId]: {
        name: modelId,
        tools: spec.defaultToolSupport,
      },
    },
  };
}

/**
 * Build config for OpenRouter provider
 */
function buildOpenRouterConfig(
  provider: ConnectedProvider
): OpenRouterProviderConfig | null {
  const spec = getProviderSpec('openrouter');
  if (!spec) return null;

  const baseURL = getBaseURL('openrouter', provider.credentials);
  if (!baseURL) return null;

  const modelId = stripModelIdPrefix(provider.selectedModelId!);

  return {
    npm: spec.npm,
    name: spec.displayName,
    options: {
      baseURL,
    },
    models: {
      [modelId]: {
        name: modelId,
        tools: spec.defaultToolSupport,
      },
    },
  };
}

/**
 * Build config for Moonshot provider
 */
function buildMoonshotConfig(
  provider: ConnectedProvider,
  proxyBaseURL: string,
  apiKey?: string
): MoonshotProviderConfig | null {
  const spec = getProviderSpec('moonshot');
  if (!spec) return null;

  const modelId = stripModelIdPrefix(provider.selectedModelId!);

  const options: MoonshotProviderConfig['options'] = {
    baseURL: proxyBaseURL,
  };

  if (apiKey) {
    options.apiKey = apiKey;
  }

  return {
    npm: spec.npm,
    name: spec.displayName,
    options,
    models: {
      [modelId]: {
        name: modelId,
        tools: spec.defaultToolSupport,
      },
    },
  };
}

/**
 * Build config for LiteLLM provider
 */
function buildLiteLLMConfig(
  provider: ConnectedProvider,
  apiKey?: string
): LiteLLMProviderConfig | null {
  const spec = getProviderSpec('litellm');
  if (!spec) return null;

  const baseURL = getBaseURL('litellm', provider.credentials);
  if (!baseURL) return null;

  // LiteLLM does not strip prefix from model ID
  const modelId = provider.selectedModelId!;

  const options: LiteLLMProviderConfig['options'] = {
    baseURL,
  };

  if (apiKey) {
    options.apiKey = apiKey;
  }

  return {
    npm: spec.npm,
    name: spec.displayName,
    options,
    models: {
      [modelId]: {
        name: modelId,
        tools: spec.defaultToolSupport,
      },
    },
  };
}

/**
 * Build config for LM Studio provider
 */
function buildLMStudioConfig(
  provider: ConnectedProvider
): LMStudioProviderConfig | null {
  const spec = getProviderSpec('lmstudio');
  if (!spec) return null;

  const baseURL = getBaseURL('lmstudio', provider.credentials);
  if (!baseURL) return null;

  const modelId = stripModelIdPrefix(provider.selectedModelId!);
  const supportsTools = getLMStudioToolSupport(provider, provider.selectedModelId!);

  return {
    npm: spec.npm,
    name: spec.displayName,
    options: {
      baseURL,
    },
    models: {
      [modelId]: {
        name: modelId,
        tools: supportsTools,
      },
    },
  };
}

/**
 * Build a provider configuration from settings
 *
 * Returns null if:
 * - Provider ID is unknown (not in registry)
 * - Provider is a special provider (use dedicated builder)
 * - Provider is not connected
 * - Provider has wrong credentials type
 * - Provider has no selected model
 *
 * @param params - Build parameters
 * @returns Provider config or null if validation fails
 */
export function buildProviderConfig(
  params: BuildProviderConfigParams
): StandardProviderConfig | null {
  const { providerId, providerSettings, proxyBaseURL, apiKey } = params;

  // Check if this is a special provider (should use dedicated builder)
  if (isSpecialProvider(providerId)) {
    return null;
  }

  // Get provider spec
  const spec = getProviderSpec(providerId);
  if (!spec) {
    return null;
  }

  // Get connected provider
  const provider = providerSettings.connectedProviders[providerId as ProviderId];

  // Validate credentials type
  // Moonshot uses api_key type, others use their specific type
  const validCredentialsTypes =
    providerId === 'moonshot'
      ? ['api_key']
      : [spec.credentialsType];

  if (!isValidProvider(provider, validCredentialsTypes)) {
    return null;
  }

  // Build provider-specific config
  switch (providerId) {
    case 'ollama':
      return buildOllamaConfig(provider!);

    case 'openrouter':
      return buildOpenRouterConfig(provider!);

    case 'moonshot':
      // Moonshot requires a proxy URL
      if (!proxyBaseURL) {
        return null;
      }
      return buildMoonshotConfig(provider!, proxyBaseURL, apiKey);

    case 'litellm':
      return buildLiteLLMConfig(provider!, apiKey);

    case 'lmstudio':
      return buildLMStudioConfig(provider!);

    default:
      return null;
  }
}

/**
 * Build configs for all connected standard providers
 *
 * This function iterates through all standard provider IDs and builds
 * configs for providers that are properly connected and configured.
 *
 * @param providerSettings - The provider settings
 * @param getApiKey - Function to retrieve API keys by provider ID
 * @param getProxyBaseURL - Optional function to get proxy URL for providers that need it
 * @returns Record of provider configs keyed by provider ID
 */
export async function buildAllStandardProviders(
  providerSettings: ProviderSettings,
  getApiKey: (id: string) => string | null,
  getProxyBaseURL?: (providerId: string) => Promise<string>
): Promise<Record<string, StandardProviderConfig>> {
  const configs: Record<string, StandardProviderConfig> = {};

  const standardProviderIds = getStandardProviderIds();

  for (const providerId of standardProviderIds) {
    const provider = providerSettings.connectedProviders[providerId as ProviderId];

    // Skip if provider is not connected
    if (!provider || provider.connectionStatus !== 'connected') {
      continue;
    }

    // Get API key if needed
    let apiKey: string | undefined;
    if (providerId === 'litellm') {
      const creds = provider.credentials as LiteLLMCredentials;
      if (creds.hasApiKey) {
        apiKey = getApiKey(providerId) ?? undefined;
      }
    } else if (providerId === 'moonshot') {
      apiKey = getApiKey(providerId) ?? undefined;
    }

    // Get proxy URL for moonshot
    let proxyBaseURL: string | undefined;
    if (providerId === 'moonshot') {
      if (!getProxyBaseURL) {
        // Skip moonshot if no proxy provider
        continue;
      }
      proxyBaseURL = await getProxyBaseURL(providerId);
    }

    const config = buildProviderConfig({
      providerId,
      providerSettings,
      proxyBaseURL,
      apiKey,
    });

    if (config) {
      configs[providerId] = config;
    }
  }

  return configs;
}
