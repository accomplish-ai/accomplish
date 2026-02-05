import {
  DEFAULT_PROVIDERS,
  DEFAULT_MODEL,
  type ProviderType,
  type ModelConfig,
} from '../shared/types/provider.js';

export { DEFAULT_PROVIDERS, DEFAULT_MODEL };

export function getModelsForProvider(provider: ProviderType): ModelConfig[] {
  const providerConfig = DEFAULT_PROVIDERS.find((p) => p.id === provider);
  return providerConfig?.models ?? [];
}

export function getDefaultModelForProvider(provider: ProviderType): ModelConfig | undefined {
  const models = getModelsForProvider(provider);
  return models[0];
}

export function isValidModel(provider: ProviderType, modelId: string): boolean {
  const models = getModelsForProvider(provider);
  return models.some((m) => m.id === modelId || m.fullId === modelId);
}

export function findModelById(modelId: string): ModelConfig | undefined {
  for (const provider of DEFAULT_PROVIDERS) {
    const model = provider.models.find((m) => m.id === modelId || m.fullId === modelId);
    if (model) {
      return model;
    }
  }
  return undefined;
}

export function getProviderById(providerId: ProviderType) {
  return DEFAULT_PROVIDERS.find((p) => p.id === providerId);
}

export function providerRequiresApiKey(provider: ProviderType): boolean {
  const providerConfig = getProviderById(provider);
  return providerConfig?.requiresApiKey ?? false;
}

export function getApiKeyEnvVar(provider: ProviderType): string | undefined {
  const providerConfig = getProviderById(provider);
  return providerConfig?.apiKeyEnvVar;
}
