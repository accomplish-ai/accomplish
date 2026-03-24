import type { IpcMainInvokeEvent } from 'electron';
import {
  fetchOpenRouterModels,
  fetchProviderModels,
  getOpenAiOauthAccessToken,
} from '@accomplish_ai/agent-core';
import { DEFAULT_PROVIDERS, ZAI_ENDPOINTS } from '@accomplish_ai/agent-core';
import type { ZaiRegion } from '@accomplish_ai/agent-core';
import { getApiKey } from '../../../store/secureStorage';
import { handle, API_KEY_VALIDATION_TIMEOUT_MS } from '../utils';

export function registerModelDiscoveryHandlers(): void {
  handle('openrouter:fetch-models', async (_event: IpcMainInvokeEvent) => {
    const apiKey = getApiKey('openrouter');
    return fetchOpenRouterModels(apiKey || '', API_KEY_VALIDATION_TIMEOUT_MS);
  });

  handle(
    'provider:fetch-models',
    async (
      _event: IpcMainInvokeEvent,
      providerId: string,
      options?: { baseUrl?: string; zaiRegion?: string },
    ) => {
      const providerConfig = DEFAULT_PROVIDERS.find((p) => p.id === providerId);
      if (!providerConfig?.modelsEndpoint) {
        return { success: false, error: 'No models endpoint configured for this provider' };
      }

      const storedApiKey = getApiKey(providerId);
      const apiKey = storedApiKey || (providerId === 'openai' ? getOpenAiOauthAccessToken() : null);
      if (!apiKey) {
        return { success: false, error: 'No API key found for this provider' };
      }

      let urlOverride: string | undefined;
      let endpointConfig = providerConfig.modelsEndpoint;
      if (providerId === 'openai' && typeof options?.baseUrl === 'string' && options.baseUrl) {
        urlOverride = `${options.baseUrl.replace(/\/+$/, '')}/models`;
        endpointConfig = { ...endpointConfig, modelFilter: undefined };
      }
      if (providerId === 'zai' && options?.zaiRegion) {
        const region = options.zaiRegion as ZaiRegion;
        urlOverride = `${ZAI_ENDPOINTS[region]}/models`;
      }

      return fetchProviderModels({
        endpointConfig,
        apiKey,
        urlOverride,
        timeout: API_KEY_VALIDATION_TIMEOUT_MS,
      });
    },
  );
}
