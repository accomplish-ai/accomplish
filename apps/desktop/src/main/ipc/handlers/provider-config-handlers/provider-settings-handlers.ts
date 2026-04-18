import type { IpcMainInvokeEvent } from 'electron';
import type {
  SelectedModel,
  ProviderId,
  ConnectedProvider,
} from '@accomplish_ai/agent-core/desktop-main';
import type { IpcHandler } from '../../types';
import { getDaemonClient } from '../../../daemon-bootstrap';
import { cleanupVertexServiceAccountKey } from '../../../opencode';
import { registerVertexHandlers } from '../../../providers';

export function registerProviderSettingsHandlers(handle: IpcHandler): void {
  // Milestone 3 sub-chunk 3c: every read/write below is now a daemon RPC.
  // The `settings.*` routes cover selected-model; the `provider.*` routes
  // cover everything else in `ProviderSettings`. Reads that extract a
  // single field from `provider.getSettings()` pay one JSON round-trip per
  // IPC call — negligible since the renderer reads these on settings-UI
  // open, not in a hot loop.

  handle('model:get', async (_event: IpcMainInvokeEvent) => {
    return getDaemonClient().call('settings.getSelectedModel');
  });

  handle('model:set', async (_event: IpcMainInvokeEvent, model: SelectedModel) => {
    if (!model || typeof model.provider !== 'string' || typeof model.model !== 'string') {
      throw new Error('Invalid model configuration');
    }
    await getDaemonClient().call('settings.setSelectedModel', { model });
  });

  handle('provider-settings:get', async () => {
    return getDaemonClient().call('provider.getSettings');
  });

  handle(
    'provider-settings:set-active',
    async (_event: IpcMainInvokeEvent, providerId: ProviderId | null) => {
      await getDaemonClient().call('provider.setActive', { providerId });
    },
  );

  handle(
    'provider-settings:get-connected',
    async (_event: IpcMainInvokeEvent, providerId: ProviderId) => {
      // No dedicated `provider.getConnected` RPC — extract from the full
      // `provider.getSettings()` snapshot. A single-field grab from a small
      // JSON blob is not worth its own route.
      const settings = await getDaemonClient().call('provider.getSettings');
      return settings.connectedProviders[providerId] ?? null;
    },
  );

  handle(
    'provider-settings:set-connected',
    async (_event: IpcMainInvokeEvent, providerId: ProviderId, provider: ConnectedProvider) => {
      await getDaemonClient().call('provider.setConnected', { providerId, provider });
    },
  );

  handle(
    'provider-settings:remove-connected',
    async (_event: IpcMainInvokeEvent, providerId: ProviderId) => {
      await getDaemonClient().call('provider.removeConnected', { providerId });
      if (providerId === 'vertex') {
        // Vertex service-account-key cleanup is a local filesystem operation
        // (touches a key file the adapter writes); stays Electron-side.
        cleanupVertexServiceAccountKey();
      }
    },
  );

  handle(
    'provider-settings:update-model',
    async (_event: IpcMainInvokeEvent, providerId: ProviderId, modelId: string | null) => {
      await getDaemonClient().call('provider.updateModel', { providerId, modelId });
    },
  );

  handle('provider-settings:set-debug', async (_event: IpcMainInvokeEvent, enabled: boolean) => {
    await getDaemonClient().call('provider.setDebugMode', { enabled });
  });

  handle('provider-settings:get-debug', async () => {
    return getDaemonClient().call('provider.getDebugMode');
  });

  // Vertex AI handlers
  registerVertexHandlers(handle);
}
