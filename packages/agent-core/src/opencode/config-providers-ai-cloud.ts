/** AI cloud provider config builders with dynamic model registration: xAI, Google AI, Z.AI. */
import { DEFAULT_PROVIDERS, ZAI_ENDPOINTS } from '../common/index.js';
import { createConsoleLogger } from '../utils/logging.js';
import type { ZaiCredentials } from '../common/types/providerSettings.js';
import type { ProviderModelConfig } from './config-generator.js';
import type { ProviderBuildContext, ProviderBuildResult } from './config-provider-context.js';

const log = createConsoleLogger({ prefix: 'OpenCodeConfigBuilder' });

export function buildXaiConfig(ctx: ProviderBuildContext): ProviderBuildResult {
  const { providerSettings, getApiKey } = ctx;
  const xaiProvider = providerSettings.connectedProviders.xai;
  const xaiApiKey = getApiKey('xai');
  if (!xaiProvider || xaiProvider.connectionStatus !== 'connected' || !xaiApiKey) {
    return { configs: [], enableToAdd: [] };
  }
  const selectedXaiModelId = xaiProvider.selectedModelId;
  if (!selectedXaiModelId) {
    return { configs: [], enableToAdd: [] };
  }
  const modelId = selectedXaiModelId.replace(/^xai\//, '');
  const xaiModels: Record<string, ProviderModelConfig> = {};
  if (xaiProvider.availableModels && xaiProvider.availableModels.length > 0) {
    for (const model of xaiProvider.availableModels) {
      const mId = model.id.replace(/^xai\//, '');
      xaiModels[mId] = { name: model.name, tools: true };
    }
  }
  if (!xaiModels[modelId]) {
    xaiModels[modelId] = { name: modelId, tools: true };
  }
  log.info(`[OpenCode Config Builder] xAI configured, selected model: ${modelId}`);
  return {
    configs: [{ id: 'xai', options: { apiKey: xaiApiKey }, models: xaiModels }],
    enableToAdd: [],
  };
}

export function buildGoogleConfig(ctx: ProviderBuildContext): ProviderBuildResult {
  const { providerSettings, getApiKey } = ctx;
  const googleProvider = providerSettings.connectedProviders.google;
  const googleApiKey = getApiKey('google');
  if (!googleProvider || googleProvider.connectionStatus !== 'connected' || !googleApiKey) {
    return { configs: [], enableToAdd: [] };
  }
  const selectedGoogleModelId = googleProvider.selectedModelId;
  if (!selectedGoogleModelId) {
    return { configs: [], enableToAdd: [] };
  }
  const modelId = selectedGoogleModelId.replace(/^google\//, '');
  const googleModels: Record<string, ProviderModelConfig> = {};
  if (googleProvider.availableModels && googleProvider.availableModels.length > 0) {
    for (const model of googleProvider.availableModels) {
      const mId = model.id.replace(/^google\//, '');
      googleModels[mId] = { name: model.name, tools: true };
    }
  }
  if (!googleModels[modelId]) {
    googleModels[modelId] = { name: modelId, tools: true };
  }
  log.info(`[OpenCode Config Builder] Google AI configured, selected model: ${modelId}`);
  return {
    configs: [{ id: 'google', options: { apiKey: googleApiKey }, models: googleModels }],
    enableToAdd: [],
  };
}

export function buildZaiConfig(ctx: ProviderBuildContext): ProviderBuildResult {
  const { providerSettings, getApiKey } = ctx;
  const zaiKey = getApiKey('zai');
  if (!zaiKey) {
    return { configs: [], enableToAdd: [] };
  }
  const zaiProvider = providerSettings.connectedProviders.zai;
  const zaiCredentials = zaiProvider?.credentials as ZaiCredentials | undefined;
  const zaiRegion = zaiCredentials?.region || 'international';
  const zaiEndpoint = ZAI_ENDPOINTS[zaiRegion];
  const zaiModels: Record<string, ProviderModelConfig> = {};
  if (zaiProvider?.availableModels && zaiProvider.availableModels.length > 0) {
    for (const model of zaiProvider.availableModels) {
      const modelId = model.id.replace(/^zai\//, '');
      zaiModels[modelId] = { name: model.name, tools: true };
    }
  } else {
    const zaiProviderConfig = DEFAULT_PROVIDERS.find((p) => p.id === 'zai');
    if (zaiProviderConfig) {
      for (const model of zaiProviderConfig.models) {
        zaiModels[model.id] = { name: model.displayName, tools: true };
      }
    }
  }
  log.info(`[OpenCode Config Builder] Z.AI Coding Plan configured, region: ${zaiRegion}`);
  return {
    configs: [
      {
        id: 'zai-coding-plan',
        npm: '@ai-sdk/openai-compatible',
        name: 'Z.AI Coding Plan',
        options: { baseURL: zaiEndpoint, apiKey: zaiKey },
        models: zaiModels,
      },
    ],
    enableToAdd: [],
  };
}
