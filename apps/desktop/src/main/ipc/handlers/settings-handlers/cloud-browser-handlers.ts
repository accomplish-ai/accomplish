import type { IpcMainInvokeEvent } from 'electron';
import type { IpcHandler } from '../../types';
import { getDaemonClient } from '../../../daemon-bootstrap';

const VALID_CLOUD_BROWSER_PROVIDERS = new Set(['aws-agentcore', 'browserbase', 'steel']);

export function registerCloudBrowserHandlers(handle: IpcHandler): void {
  // Milestone 3 sub-chunk 3c: config get/set route through daemon RPC.
  handle('settings:cloud-browser-config:get', async (_event: IpcMainInvokeEvent) => {
    return getDaemonClient().call('settings.getCloudBrowserConfig');
  });

  handle(
    'settings:cloud-browser-config:set',
    async (_event: IpcMainInvokeEvent, config: string | null) => {
      if (config === null) {
        await getDaemonClient().call('settings.setCloudBrowserConfig', { config: null });
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
      // The `CloudBrowserConfig` shape is validated field-by-field above;
      // the RPC wire type is `unknown`-backed on the daemon side anyway
      // (see `settings.setCloudBrowserConfig` in `common/types/daemon.ts`).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await getDaemonClient().call('settings.setCloudBrowserConfig', { config: cfg as any });
    },
  );
}
