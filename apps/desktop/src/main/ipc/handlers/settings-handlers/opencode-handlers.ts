import type { IpcMainInvokeEvent } from 'electron';
import type { IpcHandler } from '../../types';
import { isOpenCodeCliInstalled, getOpenCodeCliVersion } from '../../../opencode';
import { isE2ESkipAuthEnabled } from '../utils';

export function registerOpenCodeHandlers(handle: IpcHandler): void {
  handle('opencode:check', async (_event: IpcMainInvokeEvent) => {
    if (isE2ESkipAuthEnabled()) {
      return {
        installed: true,
        version: '1.0.0-test',
        installCommand: 'npm install -g opencode-ai',
      };
    }

    const installed = await isOpenCodeCliInstalled();
    const version = installed ? await getOpenCodeCliVersion() : null;
    return {
      installed,
      version,
      installCommand: 'npm install -g opencode-ai',
    };
  });

  handle('opencode:version', async (_event: IpcMainInvokeEvent) => {
    return getOpenCodeCliVersion();
  });
}
