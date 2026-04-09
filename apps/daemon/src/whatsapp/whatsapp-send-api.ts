/**
 * WhatsApp Send HTTP API — exposes whatsapp.sendMessage to local MCP tools.
 *
 * Follows the same pattern as PermissionService's HTTP servers:
 * - Listens on a well-known port (WHATSAPP_SEND_API_PORT = 9229)
 * - Requires Bearer token auth on every request
 * - Returns structured JSON so the MCP tool can relay human-readable errors
 */
import http from 'node:http';
import { createHttpServer } from '../http-server-factory.js';
import { RateLimiter } from '../rate-limiter.js';
import { log } from '../logger.js';
import type { WhatsAppDaemonService } from '../whatsapp-service.js';
import type { ChatSummary, MessageSummary } from './WhatsAppService.js';

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 60;

/**
 * Normalize a recipient to WhatsApp JID format.
 * If the string already contains '@', it is returned as-is.
 * Otherwise digits are extracted and '@s.whatsapp.net' is appended.
 */
function normalizeRecipient(recipient: string): string {
  if (recipient.includes('@')) {
    return recipient;
  }
  const digits = recipient.replace(/[^\d]/g, '');
  return `${digits}@s.whatsapp.net`;
}

export class WhatsAppSendApi {
  private whatsappService: WhatsAppDaemonService;
  private authToken: string;
  private server: http.Server | null = null;
  private port: number | null = null;
  private rateLimiter = new RateLimiter(RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX_REQUESTS);

  constructor(whatsappService: WhatsAppDaemonService, authToken: string) {
    this.whatsappService = whatsappService;
    this.authToken = authToken;
  }

  async start(fixedPort?: number): Promise<void> {
    const { server, port } = await createHttpServer({
      authToken: this.authToken,
      rateLimiter: this.rateLimiter,
      serviceName: 'WhatsAppSendApi',
      port: fixedPort,
      routes: [
        {
          method: 'POST',
          path: '/chats',
          handler: async (data, _req, res) => {
            const rawLimit = (data as { limit?: unknown }).limit;
            const limit =
              typeof rawLimit === 'number' && rawLimit > 0 ? Math.min(rawLimit, 100) : 20;

            const config = this.whatsappService.getConfig();
            if (!config || config.status !== 'connected') {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(
                JSON.stringify({
                  success: false,
                  error: 'not_connected',
                  message: 'WhatsApp is not connected. Please connect in Settings → Integrations.',
                }),
              );
              return;
            }

            const chats: ChatSummary[] = this.whatsappService.readChats(limit);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, chats }));
          },
        },
        {
          method: 'POST',
          path: '/messages',
          handler: async (data, _req, res) => {
            const { jid, limit: rawLimit } = data as { jid?: unknown; limit?: unknown };

            if (typeof jid !== 'string' || !jid.trim()) {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(
                JSON.stringify({
                  success: false,
                  error: 'invalid_jid',
                  message: 'A non-empty jid is required.',
                }),
              );
              return;
            }

            const limit =
              typeof rawLimit === 'number' && rawLimit > 0 ? Math.min(rawLimit, 100) : 20;

            const config = this.whatsappService.getConfig();
            if (!config || config.status !== 'connected') {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(
                JSON.stringify({
                  success: false,
                  error: 'not_connected',
                  message: 'WhatsApp is not connected. Please connect in Settings → Integrations.',
                }),
              );
              return;
            }

            const messages: MessageSummary[] = this.whatsappService.readMessages(jid.trim(), limit);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, messages }));
          },
        },
        {
          method: 'POST',
          path: '/send',
          handler: async (data, _req, res) => {
            const { recipient, message } = data as {
              recipient?: unknown;
              message?: unknown;
            };

            if (typeof recipient !== 'string' || !recipient.trim()) {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(
                JSON.stringify({
                  success: false,
                  error: 'invalid_recipient',
                  message: 'A non-empty recipient is required.',
                }),
              );
              return;
            }

            if (typeof message !== 'string' || !message.trim()) {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(
                JSON.stringify({
                  success: false,
                  error: 'send_failed',
                  message: 'A non-empty message body is required.',
                }),
              );
              return;
            }

            const config = this.whatsappService.getConfig();
            if (!config || config.status !== 'connected') {
              const isConnecting = config?.status === 'connecting' || config?.status === 'qr_ready';
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(
                JSON.stringify({
                  success: false,
                  error: 'not_connected',
                  message: isConnecting
                    ? 'WhatsApp is connecting, please try again in a moment.'
                    : 'WhatsApp is not connected. Please connect in Settings → Integrations.',
                }),
              );
              return;
            }

            try {
              const jid = normalizeRecipient(recipient.trim());
              await this.whatsappService.sendMessage(jid, message.trim());
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true }));
            } catch (err) {
              const errMsg = err instanceof Error ? err.message : String(err);
              // Detect Baileys connection-loss signals (FR-020).
              // If the socket dropped mid-send, proactively update the connection
              // status so the UI reflects the true state before Baileys emits its
              // own connection.update event.
              const isConnectionLoss =
                errMsg.includes('Connection Closed') ||
                errMsg.includes('Connection Lost') ||
                errMsg.includes('Socket closed') ||
                errMsg.includes('stream errored');
              if (isConnectionLoss) {
                this.whatsappService.markDisconnected();
              }
              // Do NOT log errMsg — it may be a Baileys error that reflects
              // content from the message payload (NFR-002).
              log.error('[WhatsAppSendApi] Send failed');
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(
                JSON.stringify({
                  success: false,
                  error: 'send_failed',
                  message: isConnectionLoss
                    ? 'WhatsApp disconnected during send. Please reconnect in Settings → Integrations.'
                    : `Failed to send WhatsApp message: ${errMsg}`,
                }),
              );
            }
          },
        },
      ],
    });

    this.server = server;
    this.port = port;
  }

  getPort(): number | null {
    return this.port;
  }

  stop(): void {
    if (this.server) {
      this.server.close();
      this.server = null;
      this.port = null;
    }
  }
}
