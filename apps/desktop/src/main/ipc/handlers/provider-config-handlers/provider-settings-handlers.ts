import type { IpcMainInvokeEvent } from 'electron';
import type { SelectedModel, ProviderId, ConnectedProvider } from '@accomplish_ai/agent-core';
import type { IpcHandler } from '../../types';
import { getStorage } from '../../../store/storage';
import { cleanupVertexServiceAccountKey } from '../../../opencode';
import { registerVertexHandlers } from '../../../providers';

export function registerProviderSettingsHandlers(handle: IpcHandler): void {
  const storage = getStorage();

  handle('model:get', async (_event: IpcMainInvokeEvent) => {
    return storage.getSelectedModel();
  });

  handle('model:set', async (_event: IpcMainInvokeEvent, model: SelectedModel) => {
    if (!model || typeof model.provider !== 'string' || typeof model.model !== 'string') {
      throw new Error('Invalid model configuration');
    }
    storage.setSelectedModel(model);
  });

  handle('provider-settings:get', async () => {
    return storage.getProviderSettings();
  });

  handle(
    'provider-settings:set-active',
    async (_event: IpcMainInvokeEvent, providerId: ProviderId | null) => {
      storage.setActiveProvider(providerId);
    },
  );

  handle(
    'provider-settings:get-connected',
    async (_event: IpcMainInvokeEvent, providerId: ProviderId) => {
      return storage.getConnectedProvider(providerId);
    },
  );

  handle(
    'provider-settings:set-connected',
    async (_event: IpcMainInvokeEvent, providerId: ProviderId, provider: ConnectedProvider) => {
      storage.setConnectedProvider(providerId, provider);
    },
  );

  handle(
    'provider-settings:remove-connected',
    async (_event: IpcMainInvokeEvent, providerId: ProviderId) => {
      storage.removeConnectedProvider(providerId);
      if (providerId === 'vertex') {
        cleanupVertexServiceAccountKey();
      }
    },
  );

  handle(
    'provider-settings:update-model',
    async (_event: IpcMainInvokeEvent, providerId: ProviderId, modelId: string | null) => {
      storage.updateProviderModel(providerId, modelId);
    },
  );

  handle('provider-settings:set-debug', async (_event: IpcMainInvokeEvent, enabled: boolean) => {
    storage.setProviderDebugMode(enabled);
  });

  handle('provider-settings:get-debug', async () => {
    return storage.getProviderDebugMode();
  });

  // Vertex AI handlers
  registerVertexHandlers(handle);
}
