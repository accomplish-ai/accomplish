import type { IpcMainInvokeEvent } from 'electron';
import { fetchOpenRouterModels, fetchProviderModels } from '@accomplish_ai/agent-core/desktop-main';
import { DEFAULT_PROVIDERS, ZAI_ENDPOINTS } from '@accomplish_ai/agent-core/desktop-main';
import type { ZaiRegion } from '@accomplish_ai/agent-core/desktop-main';
import { getApiKey } from '../../../store/secureStorage';
import { handle, API_KEY_VALIDATION_TIMEOUT_MS } from '../utils';
import { ensureDaemonRunning } from '../../../daemon/daemon-connector';

export function registerModelDiscoveryHandlers(): void {
  handle('openrouter:fetch-models', async (_event: IpcMainInvokeEvent) => {
    const apiKey = await getApiKey('openrouter');
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

      // Phase 4a of the SDK cutover port: OAuth access tokens live on the
      // daemon now (the daemon owns the transient `opencode serve` that
      // produced them). Desktop no longer reads `auth.json` directly — it
      // asks the daemon over RPC. This keeps both writes and reads on the
      // same side of the process boundary so XDG / auth-path drift can't
      // cause a stale-token fallback to the hardcoded model list.
      const storedApiKey = await getApiKey(providerId);
      let apiKey: string | null = storedApiKey || null;
      if (!apiKey && providerId === 'openai') {
        const client = await ensureDaemonRunning();
        apiKey = await client.call('auth.openai.getAccessToken');
      }
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
