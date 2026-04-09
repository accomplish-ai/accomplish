/**
 * Route builders for the WhatsApp HTTP API.
 * Each builder returns a Route object for use with createHttpServer.
 */
import type http from 'node:http';
import type { Route } from '../http-server-factory.js';
import type { WhatsAppDaemonService } from '../whatsapp-service.js';
import { log } from '../logger.js';

/**
 * Baileys error message substrings that indicate the WebSocket dropped mid-send.
 * Used by FR-020: detect connection loss, proactively mark disconnected.
 */
export const WHATSAPP_CONNECTION_LOSS_PATTERNS = [
  'connection closed',
  'connection lost',
  'connection terminated',
  'connection terminated by server',
  'connection failure',
  'socket closed',
  'stream errored',
] as const;

/**
 * Normalize a recipient to WhatsApp JID format.
 * If the string already contains '@', it is returned as-is.
 * Otherwise digits are extracted and '@s.whatsapp.net' is appended.
 * Throws if no digits are found (would produce a malformed JID).
 */
export function normalizeRecipient(recipient: string): string {
  if (recipient.includes('@')) {
    return recipient;
  }
  const digits = recipient.replace(/[^\d]/g, '');
  if (!digits) {
    throw new Error('invalid_recipient');
  }
  return `${digits}@s.whatsapp.net`;
}

function sendJson(res: http.ServerResponse, payload: unknown): void {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

export function buildChatsRoute(svc: WhatsAppDaemonService): Route {
  return {
    method: 'POST',
    path: '/chats',
    handler: async (data, _req, res) => {
      const rawLimit = (data as { limit?: unknown }).limit;
      const parsedLimit = Math.floor(Number(rawLimit));
      const limit =
        Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 100) : 20;

      const config = svc.getConfig();
      if (!config || config.status !== 'connected') {
        sendJson(res, {
          success: false,
          error: 'not_connected',
          message: 'WhatsApp is not connected. Please connect in Settings → Integrations.',
        });
        return;
      }

      sendJson(res, { success: true, chats: svc.readChats(limit) });
    },
  };
}

export function buildMessagesRoute(svc: WhatsAppDaemonService): Route {
  return {
    method: 'POST',
    path: '/messages',
    handler: async (data, _req, res) => {
      const { jid, limit: rawLimit } = data as { jid?: unknown; limit?: unknown };

      if (typeof jid !== 'string' || !jid.trim()) {
        sendJson(res, {
          success: false,
          error: 'invalid_jid',
          message: 'A non-empty jid is required.',
        });
        return;
      }

      const parsedLimit = Math.floor(Number(rawLimit));
      const limit =
        Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 100) : 20;

      const config = svc.getConfig();
      if (!config || config.status !== 'connected') {
        sendJson(res, {
          success: false,
          error: 'not_connected',
          message: 'WhatsApp is not connected. Please connect in Settings → Integrations.',
        });
        return;
      }

      sendJson(res, { success: true, messages: svc.readMessages(jid.trim(), limit) });
    },
  };
}

export function buildSendRoute(svc: WhatsAppDaemonService): Route {
  return {
    method: 'POST',
    path: '/send',
    handler: async (data, _req, res) => {
      const { recipient, message } = data as { recipient?: unknown; message?: unknown };

      if (typeof recipient !== 'string' || !recipient.trim()) {
        sendJson(res, {
          success: false,
          error: 'invalid_recipient',
          message: 'A non-empty recipient is required.',
        });
        return;
      }

      if (typeof message !== 'string' || !message.trim()) {
        sendJson(res, {
          success: false,
          error: 'invalid_message',
          message: 'A non-empty message body is required.',
        });
        return;
      }

      const config = svc.getConfig();
      if (!config || config.status !== 'connected') {
        const isConnecting = config?.status === 'connecting' || config?.status === 'qr_ready';
        sendJson(res, {
          success: false,
          error: 'not_connected',
          message: isConnecting
            ? 'WhatsApp is connecting, please try again in a moment.'
            : 'WhatsApp is not connected. Please connect in Settings → Integrations.',
        });
        return;
      }

      try {
        const jid = normalizeRecipient(recipient.trim());
        // Validate with trimmed copy but send the original message unchanged (preserve user content).
        await svc.sendMessage(jid, message);
        sendJson(res, { success: true });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        if (errMsg === 'invalid_recipient') {
          sendJson(res, {
            success: false,
            error: 'invalid_recipient',
            message: 'Recipient contains no digits and is not a valid JID.',
          });
          return;
        }
        // Detect Baileys connection-loss signals (FR-020). Match case-insensitively
        // since Baileys capitalisation varies across versions.
        const errLower = errMsg.toLowerCase();
        const isConnectionLoss = WHATSAPP_CONNECTION_LOSS_PATTERNS.some((p) =>
          errLower.includes(p),
        );
        if (isConnectionLoss) {
          svc.markDisconnected();
        }
        // Do NOT log errMsg — it may reflect message payload content (NFR-002).
        log.error('[WhatsAppSendApi] Send failed');
        sendJson(res, {
          success: false,
          error: 'send_failed',
          message: isConnectionLoss
            ? 'WhatsApp disconnected during send. Please reconnect in Settings → Integrations.'
            : 'Failed to send WhatsApp message.',
        });
      }
    },
  };
}
