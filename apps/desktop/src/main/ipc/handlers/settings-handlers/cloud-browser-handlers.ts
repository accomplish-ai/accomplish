import type { IpcMainInvokeEvent } from 'electron';
import type { IpcHandler } from '../../types';
import { getStorage } from '../../../store/storage';

const VALID_CLOUD_BROWSER_PROVIDERS = new Set(['aws-agentcore', 'browserbase', 'steel']);

export function registerCloudBrowserHandlers(handle: IpcHandler): void {
  const storage = getStorage();

  handle('settings:cloud-browser-config:get', async (_event: IpcMainInvokeEvent) => {
    return storage.getCloudBrowserConfig();
  });

  handle(
    'settings:cloud-browser-config:set',
    async (_event: IpcMainInvokeEvent, config: string | null) => {
      if (config === null) {
        storage.setCloudBrowserConfig(null);
        return;
      }
      if (typeof config !== 'string') {
        throw new Error('Invalid cloud browser config');
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(config);
      } catch {
        throw new Error('Invalid cloud browser config: malformed JSON');
      }
      if (typeof parsed !== 'object' || parsed === null) {
        throw new Error('Invalid cloud browser config: expected object');
      }
      const cfg = parsed as Record<string, unknown>;
      if (
        cfg.activeProvider !== null &&
        (typeof cfg.activeProvider !== 'string' ||
          !VALID_CLOUD_BROWSER_PROVIDERS.has(cfg.activeProvider as string))
      ) {
        throw new Error(
          'Invalid cloud browser config: activeProvider must be a valid provider or null',
        );
      }
      if (cfg.providers !== undefined) {
        if (
          typeof cfg.providers !== 'object' ||
          cfg.providers === null ||
          Array.isArray(cfg.providers)
        ) {
          throw new Error('Invalid cloud browser config: providers must be a plain object');
        }
        // When activeProvider is set, ensure the matching entry exists in providers
        if (
          cfg.activeProvider !== null &&
          typeof cfg.activeProvider === 'string' &&
          !(cfg.providers as Record<string, unknown>)[cfg.activeProvider]
        ) {
          throw new Error(
            'Invalid cloud browser config: activeProvider has no corresponding entry in providers',
          );
        }
      }
      storage.setCloudBrowserConfig(
        cfg as unknown as Parameters<typeof storage.setCloudBrowserConfig>[0],
      );
    },
  );
}
