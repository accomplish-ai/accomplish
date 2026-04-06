/**
 * whatsappStorageSync — storage mutation helpers for WhatsApp events (daemon version)
 *
 * Handles persistence of phoneNumber, connectionStatus, and lastConnectedAt
 * in response to WhatsApp service events.
 */
import type { StorageAPI } from '@accomplish_ai/agent-core';
import type { WhatsAppService } from './WhatsAppService.js';
import type { TaskBridge } from './taskBridge.js';

/**
 * Registers listeners on `service` that persist WhatsApp state into storage
 * and wire ownerLid into the task bridge.
 */
export function wireStatusListeners(
  service: WhatsAppService,
  storage: StorageAPI,
  _bridge: TaskBridge,
): void {
  service.on('phoneNumber', (phoneNumber: string) => {
    const config = storage.getMessagingConfig();
    storage.setMessagingConfig({
      integrations: {
        ...(config?.integrations ?? {}),
        whatsapp: {
          ...(config?.integrations?.whatsapp ?? {
            platform: 'whatsapp',
            enabled: true,
            tunnelEnabled: false,
          }),
          phoneNumber,
          lastConnectedAt: Date.now(),
        },
      },
    });
  });

  // ownerLid wiring is handled by wireTaskBridge — this module focuses on storage persistence.

  // When status changes to connected, persist the state
  service.on('status', (status: string) => {
    if (status === 'connected') {
      const config = storage.getMessagingConfig();
      storage.setMessagingConfig({
        integrations: {
          ...(config?.integrations ?? {}),
          whatsapp: {
            ...(config?.integrations?.whatsapp ?? {
              platform: 'whatsapp',
              enabled: true,
              tunnelEnabled: false,
            }),
            connectionStatus: 'connected',
            lastConnectedAt: Date.now(),
          },
        },
      });
    }
  });
}
