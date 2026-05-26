import type { IpcMainInvokeEvent } from 'electron';
import {
  testLMStudioConnection,
  fetchLMStudioModels,
  validateLMStudioConfig,
  testCustomConnection,
  sanitizeString,
} from '@accomplish_ai/agent-core';
import type { LMStudioConfig } from '@accomplish_ai/agent-core';
import type { IpcHandler } from '../../types';
import { getStorage } from '../../../store/storage';

export function registerLMStudioHandlers(handle: IpcHandler): void {
  const storage = getStorage();

  handle(
    'lmstudio:test-connection',
    async (_event: IpcMainInvokeEvent, url: string, apiKey?: string) => {
      try {
        const sanitizedUrl = sanitizeString(url, 'url', 256);
        const resolvedApiKey =
          apiKey !== undefined ? apiKey : storage.getApiKey('lmstudio') || undefined;
        const sanitizedApiKey = resolvedApiKey
          ? sanitizeString(resolvedApiKey, 'apiKey', 512)
          : undefined;
        return await testLMStudioConnection({ url: sanitizedUrl, apiKey: sanitizedApiKey });
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Connection test failed',
        };
      }
    },
  );

  handle('lmstudio:fetch-models', async (_event: IpcMainInvokeEvent) => {
    const config = storage.getLMStudioConfig();
    if (!config || !config.baseUrl) {
      return { success: false, error: 'No LM Studio configured' };
    }
    const apiKey = storage.getApiKey('lmstudio') || undefined;
    return fetchLMStudioModels({ baseUrl: config.baseUrl, apiKey });
  });

  handle('lmstudio:get-config', async (_event: IpcMainInvokeEvent) => {
    return storage.getLMStudioConfig();
  });

  handle(
    'lmstudio:set-config',
    async (_event: IpcMainInvokeEvent, config: LMStudioConfig | null) => {
      if (config !== null) {
        validateLMStudioConfig(config);
      }
      storage.setLMStudioConfig(config);
    },
  );

  handle(
    'custom:test-connection',
    async (_event: IpcMainInvokeEvent, baseUrl: string, apiKey?: string) => {
      try {
        const sanitizedUrl = sanitizeString(baseUrl, 'baseUrl', 256);
        const sanitizedApiKey = apiKey ? sanitizeString(apiKey, 'apiKey', 512) : undefined;
        return testCustomConnection(sanitizedUrl, sanitizedApiKey);
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Connection test failed',
        };
      }
    },
  );
}
