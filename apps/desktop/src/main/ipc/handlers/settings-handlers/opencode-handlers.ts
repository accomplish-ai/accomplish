import type { IpcMainInvokeEvent } from 'electron';
import type { IpcHandler } from '../../types';
import { isOpenCodeCliInstalled, getOpenCodeCliVersion } from '../../../opencode';
import { isE2ESkipAuthEnabled } from '../utils';
import { getLogCollector } from '../../../logging';

export function registerOpenCodeHandlers(handle: IpcHandler): void {
  handle('opencode:check', async (_event: IpcMainInvokeEvent) => {
    if (isE2ESkipAuthEnabled()) {
      return {
        installed: true,
        version: '1.0.0-test',
        installCommand: 'npm install -g opencode-ai',
      };
    }

    let installed = false;
    let version: string | null = null;
    try {
      installed = await isOpenCodeCliInstalled();
      version = installed ? await getOpenCodeCliVersion() : null;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      getLogCollector().logEnv('WARN', '[opencode:check] CLI check failed', {
        message,
        stack: err instanceof Error ? err.stack : undefined,
      });
      installed = false;
      version = null;
    }
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
