import type { IpcMainInvokeEvent } from 'electron';
import {
  testLiteLLMConnection,
  fetchLiteLLMModels,
  validateHttpUrl,
} from '@accomplish_ai/agent-core';
import type { LiteLLMConfig } from '@accomplish_ai/agent-core';
import type { IpcHandler } from '../../types';
import { getApiKey } from '../../../store/secureStorage';
import { getStorage } from '../../../store/storage';

export function registerLiteLLMHandlers(handle: IpcHandler): void {
  const storage = getStorage();

  handle(
    'litellm:test-connection',
    async (_event: IpcMainInvokeEvent, url: string, apiKey?: string) => {
      return testLiteLLMConnection(url, apiKey);
    },
  );

  handle('litellm:fetch-models', async (_event: IpcMainInvokeEvent) => {
    const config = storage.getLiteLLMConfig();
    const apiKey = getApiKey('litellm');
    return fetchLiteLLMModels({ config, apiKey: apiKey || undefined });
  });

  handle('litellm:get-config', async (_event: IpcMainInvokeEvent) => {
    return storage.getLiteLLMConfig();
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
    storage.setLiteLLMConfig(config);
  });
}
