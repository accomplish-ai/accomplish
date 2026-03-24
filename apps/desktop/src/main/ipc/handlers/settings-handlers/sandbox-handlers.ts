import type { IpcMainInvokeEvent } from 'electron';
import { sanitizeString } from '@accomplish_ai/agent-core';
import type { IpcHandler } from '../../types';
import { getStorage } from '../../../store/storage';

export function registerSandboxHandlers(handle: IpcHandler): void {
  const storage = getStorage();

  handle('sandbox:get-config', async (_event: IpcMainInvokeEvent) => {
    return storage.getSandboxConfig();
  });

  handle(
    'sandbox:set-config',
    async (
      _event: IpcMainInvokeEvent,
      config: {
        mode: string;
        allowedPaths: string[];
        networkRestricted: boolean;
        allowedHosts: string[];
        dockerImage?: string;
        networkPolicy?: { allowOutbound: boolean; allowedHosts?: string[] };
      },
    ) => {
      if (!config || typeof config !== 'object') {
        throw new Error('Invalid sandbox configuration');
      }
      if (!['disabled', 'native', 'docker'].includes(config.mode)) {
        throw new Error('Invalid sandbox mode. Must be "disabled", "native", or "docker".');
      }
      if (!Array.isArray(config.allowedPaths)) {
        throw new Error('allowedPaths must be an array');
      }
      if (typeof config.networkRestricted !== 'boolean') {
        throw new Error('networkRestricted must be a boolean');
      }
      if (!Array.isArray(config.allowedHosts)) {
        throw new Error('allowedHosts must be an array');
      }

      storage.setSandboxConfig({
        mode: config.mode as 'disabled' | 'native' | 'docker',
        allowedPaths: config.allowedPaths.map((p) => sanitizeString(p, 'allowedPath', 512)),
        networkRestricted: config.networkRestricted,
        allowedHosts: config.allowedHosts.map((h) => sanitizeString(h, 'allowedHost', 256)),
        ...(config.dockerImage !== undefined && {
          dockerImage: sanitizeString(config.dockerImage, 'dockerImage', 256),
        }),
        ...(typeof config.networkPolicy === 'object' &&
          config.networkPolicy !== null &&
          !Array.isArray(config.networkPolicy) && {
            networkPolicy: {
              allowOutbound: config.networkPolicy.allowOutbound === true,
              ...(Array.isArray(config.networkPolicy.allowedHosts) && {
                allowedHosts: config.networkPolicy.allowedHosts.map((h) =>
                  sanitizeString(h, 'networkPolicy.allowedHost', 256),
                ),
              }),
            },
          }),
      });
    },
  );
}
