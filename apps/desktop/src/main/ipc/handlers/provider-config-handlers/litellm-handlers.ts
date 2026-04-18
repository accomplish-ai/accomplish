import type { IpcMainInvokeEvent } from 'electron';
import {
  testLiteLLMConnection,
  fetchLiteLLMModels,
  validateHttpUrl,
} from '@accomplish_ai/agent-core/desktop-main';
import type { LiteLLMConfig } from '@accomplish_ai/agent-core/desktop-main';
import type { IpcHandler } from '../../types';
import { getApiKey } from '../../../store/secureStorage';
import { getDaemonClient } from '../../../daemon-bootstrap';

// Milestone 5: LiteLLM config reads/writes route through the daemon.
export function registerLiteLLMHandlers(handle: IpcHandler): void {
  handle(
    'litellm:test-connection',
    async (_event: IpcMainInvokeEvent, url: string, apiKey?: string) => {
      return testLiteLLMConnection(url, apiKey);
    },
  );

  handle('litellm:fetch-models', async (_event: IpcMainInvokeEvent) => {
    const config = await getDaemonClient().call('settings.getLiteLLMConfig');
    const apiKey = await getApiKey('litellm');
    return fetchLiteLLMModels({ config, apiKey: apiKey || undefined });
  });

  handle('litellm:get-config', async (_event: IpcMainInvokeEvent) => {
    return getDaemonClient().call('settings.getLiteLLMConfig');
  });

  handle('litellm:set-config', async (_event: IpcMainInvokeEvent, config: LiteLLMConfig | null) => {
    if (config !== null) {
      if (typeof config.baseUrl !== 'string' || typeof config.enabled !== 'boolean') {
        throw new Error('Invalid LiteLLM configuration');
      }
      validateHttpUrl(config.baseUrl, 'LiteLLM base URL');
      if (config.lastValidated !== undefined && typeof config.lastValidated !== 'number') {
        throw new Error('Invalid LiteLLM configuration');
      }
      if (config.models !== undefined) {
        if (!Array.isArray(config.models)) {
          throw new Error('Invalid LiteLLM configuration: models must be an array');
        }
        for (const model of config.models) {
          if (
            typeof model.id !== 'string' ||
            typeof model.name !== 'string' ||
            typeof model.provider !== 'string'
          ) {
            throw new Error('Invalid LiteLLM configuration: invalid model format');
          }
        }
      }
    }
    await getDaemonClient().call('settings.setLiteLLMConfig', { config });
  });
}
