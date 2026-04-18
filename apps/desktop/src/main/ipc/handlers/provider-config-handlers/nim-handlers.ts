import type { IpcMainInvokeEvent } from 'electron';
import { testNimConnection, fetchNimModels } from '@accomplish_ai/agent-core/desktop-main';
import type { NimConfig } from '@accomplish_ai/agent-core/desktop-main';
import type { IpcHandler } from '../../types';
import { getApiKey } from '../../../store/secureStorage';
import { getDaemonClient } from '../../../daemon-bootstrap';

// Milestone 5: NIM config reads/writes route through the daemon.
export function registerNimHandlers(handle: IpcHandler): void {
  handle('nim:test-connection', async (_event: IpcMainInvokeEvent, url: string, apiKey: string) => {
    return testNimConnection(url, apiKey);
  });

  handle('nim:fetch-models', async (_event: IpcMainInvokeEvent) => {
    const config = await getDaemonClient().call('settings.getNimConfig');
    const apiKey = await getApiKey('nim');
    return fetchNimModels({ config, apiKey: apiKey || undefined });
  });

  handle('nim:get-config', async (_event: IpcMainInvokeEvent) => {
    return getDaemonClient().call('settings.getNimConfig');
  });

  handle('nim:set-config', async (_event: IpcMainInvokeEvent, config: NimConfig | null) => {
    await getDaemonClient().call('settings.setNimConfig', { config });
  });
}
