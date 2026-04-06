/**
 * WhatsApp IPC handlers — daemon proxy version
 *
 * All operations are proxied to the daemon via RPC.
 * QR and status notifications flow via daemon-bootstrap notification forwarding.
 */
import type { IpcMainInvokeEvent } from 'electron';
import type { IpcHandler } from '../types';
import { getDaemonClient } from '../../daemon-bootstrap';

export function registerWhatsAppHandlers(handle: IpcHandler): void {
  handle('integrations:whatsapp:get-config', async (_event: IpcMainInvokeEvent) => {
    const client = getDaemonClient();
    return client.call('whatsapp.getConfig');
  });

  handle('integrations:whatsapp:connect', async (_event: IpcMainInvokeEvent) => {
    const client = getDaemonClient();
    await client.call('whatsapp.connect');
  });

  handle('integrations:whatsapp:disconnect', async (_event: IpcMainInvokeEvent) => {
    const client = getDaemonClient();
    await client.call('whatsapp.disconnect');
  });

  handle(
    'integrations:whatsapp:set-enabled',
    async (_event: IpcMainInvokeEvent, enabled: boolean) => {
      const client = getDaemonClient();
      await client.call('whatsapp.setEnabled', { enabled });
    },
  );
}
