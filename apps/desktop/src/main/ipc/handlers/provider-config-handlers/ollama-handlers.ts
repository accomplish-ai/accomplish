import type { IpcMainInvokeEvent } from 'electron';
import { testOllamaConnection, validateHttpUrl } from '@accomplish_ai/agent-core';
import type { OllamaConfig } from '@accomplish_ai/agent-core';
import type { IpcHandler } from '../../types';
import { getStorage } from '../../../store/storage';

export function registerOllamaHandlers(handle: IpcHandler): void {
  const storage = getStorage();

  handle('ollama:test-connection', async (_event: IpcMainInvokeEvent, url: string) => {
    return testOllamaConnection(url);
  });

  handle('ollama:get-config', async (_event: IpcMainInvokeEvent) => {
    return storage.getOllamaConfig();
  });

  handle('ollama:set-config', async (_event: IpcMainInvokeEvent, config: OllamaConfig | null) => {
    if (config !== null) {
      if (typeof config.baseUrl !== 'string' || typeof config.enabled !== 'boolean') {
        throw new Error('Invalid Ollama configuration');
      }
      validateHttpUrl(config.baseUrl, 'Ollama base URL');
      if (config.lastValidated !== undefined && typeof config.lastValidated !== 'number') {
        throw new Error('Invalid Ollama configuration');
      }
      if (config.models !== undefined) {
        if (!Array.isArray(config.models)) {
          throw new Error('Invalid Ollama configuration: models must be an array');
        }
        for (const model of config.models) {
          if (
            typeof model.id !== 'string' ||
            typeof model.displayName !== 'string' ||
            typeof model.size !== 'number'
          ) {
            throw new Error('Invalid Ollama configuration: invalid model format');
          }
        }
      }
    }
    storage.setOllamaConfig(config);
  });
}
