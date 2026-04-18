import type { IpcMainInvokeEvent } from 'electron';
import {
  testLMStudioConnection,
  fetchLMStudioModels,
  validateLMStudioConfig,
  testCustomConnection,
  sanitizeString,
} from '@accomplish_ai/agent-core/desktop-main';
import type { LMStudioConfig } from '@accomplish_ai/agent-core/desktop-main';
import type { IpcHandler } from '../../types';
import { getDaemonClient } from '../../../daemon-bootstrap';

// Milestone 5: LM Studio config reads/writes route through the daemon.
export function registerLMStudioHandlers(handle: IpcHandler): void {
  handle('lmstudio:test-connection', async (_event: IpcMainInvokeEvent, url: string) => {
    return testLMStudioConnection({ url });
  });

  handle('lmstudio:fetch-models', async (_event: IpcMainInvokeEvent) => {
    const config = await getDaemonClient().call('settings.getLMStudioConfig');
    if (!config || !config.baseUrl) {
      return { success: false, error: 'No LM Studio configured' };
    }
    return fetchLMStudioModels({ baseUrl: config.baseUrl });
  });

  handle('lmstudio:get-config', async (_event: IpcMainInvokeEvent) => {
    return getDaemonClient().call('settings.getLMStudioConfig');
  });

  handle(
    'lmstudio:set-config',
    async (_event: IpcMainInvokeEvent, config: LMStudioConfig | null) => {
      if (config !== null) {
        validateLMStudioConfig(config);
      }
      await getDaemonClient().call('settings.setLMStudioConfig', { config });
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
