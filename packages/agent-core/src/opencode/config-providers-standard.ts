/** Standard API-key provider config builders: OpenRouter, Moonshot, LiteLLM, MiniMax. */
import { getSelectedModel } from '../storage/repositories/index.js';
import { ensureMoonshotProxy } from './proxies/index.js';
import { MINIMAX_DEFAULT_BASE_URL } from '../common/index.js';
import { createConsoleLogger } from '../utils/logging.js';
import type { ProviderBuildContext, ProviderBuildResult } from './config-provider-context.js';

const log = createConsoleLogger({ prefix: 'OpenCodeConfigBuilder' });

export async function buildOpenRouterConfig(
  ctx: ProviderBuildContext,
): Promise<ProviderBuildResult> {
  const { providerSettings, getApiKey, activeModel } = ctx;
  const openrouterProvider = providerSettings.connectedProviders.openrouter;
  if (
    openrouterProvider?.connectionStatus === 'connected' &&
    activeModel?.provider === 'openrouter'
  ) {
    const modelId = activeModel.model.replace('openrouter/', '');
    log.info(`[OpenCode Config Builder] OpenRouter configured: ${modelId}`);
    return {
      configs: [
        {
          id: 'openrouter',
          npm: '@ai-sdk/openai-compatible',
          name: 'OpenRouter',
          options: { baseURL: 'https://openrouter.ai/api/v1' },
          models: { [modelId]: { name: modelId, tools: true } },
        },
      ],
      enableToAdd: [],
    };
  }

  // Legacy path
  const openrouterKey = getApiKey('openrouter');
  if (openrouterKey) {
    const selectedModel = getSelectedModel();
    if (selectedModel?.provider === 'openrouter' && selectedModel.model) {
      const modelId = selectedModel.model.replace('openrouter/', '');
      log.info(`[OpenCode Config Builder] OpenRouter (legacy) configured: ${modelId}`);
      return {
        configs: [
          {
            id: 'openrouter',
            npm: '@ai-sdk/openai-compatible',
            name: 'OpenRouter',
            options: { baseURL: 'https://openrouter.ai/api/v1' },
            models: { [modelId]: { name: modelId, tools: true } },
          },
        ],
        enableToAdd: [],
      };
    }
  }
  return { configs: [], enableToAdd: [] };
}

export async function buildMoonshotConfig(ctx: ProviderBuildContext): Promise<ProviderBuildResult> {
  const { providerSettings, getApiKey } = ctx;
  const moonshotProvider = providerSettings.connectedProviders.moonshot;
  if (
    !moonshotProvider?.connectionStatus ||
    moonshotProvider.connectionStatus !== 'connected' ||
    !moonshotProvider.selectedModelId
  ) {
    return { configs: [], enableToAdd: [] };
  }
  const modelId = moonshotProvider.selectedModelId.replace(/^moonshot\//, '');
  const moonshotApiKey = getApiKey('moonshot');
  const proxyInfo = await ensureMoonshotProxy('https://api.moonshot.ai/v1');
  log.info(`[OpenCode Config Builder] Moonshot configured: ${modelId}`);
  return {
    configs: [
      {
        id: 'moonshot',
        npm: '@ai-sdk/openai-compatible',
        name: 'Moonshot AI',
        options: {
          baseURL: proxyInfo.baseURL,
          ...(moonshotApiKey ? { apiKey: moonshotApiKey } : {}),
        },
        models: { [modelId]: { name: modelId, tools: true } },
      },
    ],
    enableToAdd: [],
  };
}

export function buildLiteLLMConfig(ctx: ProviderBuildContext): ProviderBuildResult {
  const { providerSettings, getApiKey } = ctx;
  const litellmProvider = providerSettings.connectedProviders.litellm;
  if (
    litellmProvider?.connectionStatus !== 'connected' ||
    litellmProvider.credentials.type !== 'litellm' ||
    !litellmProvider.selectedModelId
  ) {
    return { configs: [], enableToAdd: [] };
  }
  const litellmApiKey = getApiKey('litellm');
  log.info(`[OpenCode Config Builder] LiteLLM configured: ${litellmProvider.selectedModelId}`);
  return {
    configs: [
      {
        id: 'litellm',
        npm: '@ai-sdk/openai-compatible',
        name: 'LiteLLM',
        options: {
          baseURL: `${litellmProvider.credentials.serverUrl}/v1`,
          ...(litellmApiKey ? { apiKey: litellmApiKey } : {}),
        },
        models: {
          [litellmProvider.selectedModelId]: { name: litellmProvider.selectedModelId, tools: true },
        },
      },
    ],
    enableToAdd: [],
  };
}

export function buildMinimaxConfig(ctx: ProviderBuildContext): ProviderBuildResult {
  const { providerSettings, getApiKey } = ctx;
  const minimaxProvider = providerSettings.connectedProviders.minimax;
  if (
    !minimaxProvider?.connectionStatus ||
    minimaxProvider.connectionStatus !== 'connected' ||
    !minimaxProvider.selectedModelId
  ) {
    return { configs: [], enableToAdd: [] };
  }
  const modelId = minimaxProvider.selectedModelId.replace(/^minimax\//, '');
  const minimaxApiKey = getApiKey('minimax');
  const rawBaseUrl = (minimaxProvider.customBaseUrl || MINIMAX_DEFAULT_BASE_URL).trim();
  const baseUrl = rawBaseUrl.replace(/\/+$/, '') || MINIMAX_DEFAULT_BASE_URL;
  log.info(`[OpenCode Config Builder] MiniMax configured: ${modelId} baseURL: ${baseUrl}`);
  return {
    configs: [
      {
        id: 'minimax',
        npm: '@ai-sdk/openai-compatible',
        name: 'MiniMax',
        options: {
          baseURL: baseUrl,
          ...(minimaxApiKey ? { apiKey: minimaxApiKey } : {}),
        },
        models: { [modelId]: { name: modelId, tools: true } },
      },
    ],
    enableToAdd: [],
  };
}
