import type { IpcMainInvokeEvent } from 'electron';
import { testNimConnection, fetchNimModels } from '@accomplish_ai/agent-core';
import type { NimConfig } from '@accomplish_ai/agent-core';
import type { IpcHandler } from '../../types';
import { getApiKey } from '../../../store/secureStorage';
import { getStorage } from '../../../store/storage';

export function registerNimHandlers(handle: IpcHandler): void {
  const storage = getStorage();

  handle('nim:test-connection', async (_event: IpcMainInvokeEvent, url: string, apiKey: string) => {
    return testNimConnection(url, apiKey);
  });

  handle('nim:fetch-models', async (_event: IpcMainInvokeEvent) => {
    const config = storage.getNimConfig();
    const apiKey = getApiKey('nim');
    return fetchNimModels({ config, apiKey: apiKey || undefined });
  });

  handle('nim:get-config', async (_event: IpcMainInvokeEvent) => {
    return storage.getNimConfig();
  });

  handle('nim:set-config', async (_event: IpcMainInvokeEvent, config: NimConfig | null) => {
    storage.setNimConfig(config);
  });
}
