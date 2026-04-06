/**
 * WhatsAppService — Baileys-based WhatsApp channel adapter (daemon version)
 *
 * Handles connection lifecycle, QR-code authentication, and message reception.
 * Runs in the daemon process (no electron imports).
 *
 * Implementation split across:
 *   normalizeMessage.ts   — inbound message parsing
 *   reconnection.ts       — exponential-backoff reconnect logic
 *   authCleanup.ts        — auth-state filesystem helpers
 *   whatsapp-session.ts   — onConnectionUpdate handler logic
 */
import { EventEmitter } from 'events';
import path from 'path';
import type {
  MessagingConnectionStatus,
  MessagingProviderId,
  ChannelAdapter,
} from '@accomplish_ai/agent-core/common';
import { normalizeMessage } from './normalizeMessage.js';
import { cleanupAuthState } from './authCleanup.js';
import { createReconnectState, clearReconnectTimer, type ReconnectState } from './reconnection.js';
import { handleConnectionUpdate, type WhatsAppServiceEvents } from './whatsapp-session.js';
import { log } from '../logger.js';
export type { WhatsAppServiceEvents };

export class WhatsAppService extends EventEmitter implements ChannelAdapter {
  readonly channelType: MessagingProviderId = 'whatsapp';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private socket: any | null = null;
  private status: MessagingConnectionStatus = 'disconnected';
  private reconnect: ReconnectState = createReconnectState();
  private authStatePath: string;
  private disposed = false;
  private manualDisconnect = false;
  private qrCode: string | null = null;
  private qrIssuedAt: number | null = null;
  /** Track message IDs sent by this daemon to filter out echo upserts. */
  private sentMessageIds = new Set<string>();

  constructor(dataDir: string) {
    super();
    this.authStatePath = path.join(dataDir, 'whatsapp-auth');
  }

  getStatus(): MessagingConnectionStatus {
    return this.status;
  }

  private setStatus(s: MessagingConnectionStatus): void {
    this.status = s;
    this.emit('status', s);
  }

  async connect(): Promise<void> {
    if (this.disposed) {
      throw new Error('WhatsApp service has been disposed');
    }
    clearReconnectTimer(this.reconnect);
    this.reconnect.scheduled = false;
    this.reconnect.attempts = 0;
    this.manualDisconnect = false;
    if (this.status === 'connecting') {
      return;
    }
    this.setStatus('connecting');

    try {
      const baileys = await import('@whiskeysockets/baileys');
      if (this.disposed) {
        this.setStatus('disconnected');
        return;
      }
      const {
        default: makeWASocket,
        useMultiFileAuthState,
        DisconnectReason,
        fetchLatestBaileysVersion,
        jidNormalizedUser,
      } = baileys;
      const pino = (await import('pino')).default;

      let version: [number, number, number] | undefined;
      try {
        version = (await fetchLatestBaileysVersion()).version;
      } catch (err) {
        log.warn('[WhatsApp] Failed to fetch latest version, using default:', err);
      }

      const { state, saveCreds } = await useMultiFileAuthState(this.authStatePath);
      if (this.disposed) {
        this.setStatus('disconnected');
        return;
      }
      this.disposeSocket();

      const socket = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        browser: ['Accomplish', 'Desktop', '1.0.0'],
      });
      if (this.disposed) {
        socket.end(new Error('WhatsApp service disposed during connect'));
        return;
      }
      this.socket = socket;
      this.socket.ev.on('creds.update', saveCreds);
      this.socket.ev.on(
        'connection.update',
        (update: { connection?: string; lastDisconnect?: { error?: unknown }; qr?: string }) =>
          handleConnectionUpdate(
            update,
            DisconnectReason as unknown as Record<string, number>,
            jidNormalizedUser,
            {
              reconnect: this.reconnect,
              authStatePath: this.authStatePath,
              disposed: this.disposed,
              manualDisconnect: this.manualDisconnect,
              socket: this.socket,
              setStatus: (s) => this.setStatus(s),
              setQrCode: (qr) => {
                this.qrCode = qr;
                this.qrIssuedAt = Date.now();
              },
              emitQr: (qr) => this.emit('qr', qr),
              emitPhoneNumber: (p) => this.emit('phoneNumber', p),
              emitOwnerLid: (lid) => this.emit('ownerLid', lid),
              reconnect_connect: () => {
                this.connect().catch((e) => log.error('[WhatsApp] Reconnect failed:', e));
              },
            },
          ),
      );
      this.socket.ev.on('messages.upsert', (upsert: { type: string; messages: unknown[] }) => {
        // Process both 'notify' (real-time) and 'append' (offline sync) messages.
        // The TaskBridge guards (self-chat-only, rate limiting, watermark) prevent
        // old history messages from being processed as new tasks.
        for (const raw of upsert.messages as Array<Record<string, unknown>>) {
          // Skip echoes of messages this daemon sent (prevents feedback loops
          // where outbound replies trigger new inbound message processing).
          const key = raw.key as Record<string, unknown> | undefined;
          const msgId = key?.id as string | undefined;
          if (msgId && this.sentMessageIds.has(msgId)) {
            this.sentMessageIds.delete(msgId);
            continue;
          }
          const msg = normalizeMessage(raw);
          if (msg) {
            this.emit('message', msg);
          }
        }
      });
    } catch (err) {
      this.setStatus('disconnected');
      throw err;
    }
  }

  async sendMessage(recipientId: string, text: string): Promise<void> {
    if (!this.socket) {
      throw new Error('WhatsApp is not connected');
    }
    const result = await this.socket.sendMessage(recipientId, { text });
    // Track the sent message ID so the upsert handler can skip the echo
    if (result?.key?.id) {
      this.sentMessageIds.add(result.key.id as string);
      // Prevent unbounded growth — keep only the last 100
      if (this.sentMessageIds.size > 100) {
        const first = this.sentMessageIds.values().next().value;
        if (first) {
          this.sentMessageIds.delete(first);
        }
      }
    }
  }

  getQrCode(): string | null {
    return this.qrCode;
  }

  getQrIssuedAt(): number | null {
    return this.qrIssuedAt;
  }

  async disconnect(): Promise<void> {
    this.manualDisconnect = true;
    this.reconnect.scheduled = false;
    this.reconnect.attempts = 0;
    clearReconnectTimer(this.reconnect);
    if (this.socket) {
      this.socket.ev.removeAllListeners('creds.update');
      this.socket.ev.removeAllListeners('connection.update');
      this.socket.ev.removeAllListeners('messages.upsert');
      await this.socket.logout().catch(() => {});
      this.socket.end(new Error('User requested disconnect'));
      this.socket = null;
    }
    this.qrCode = null;
    this.qrIssuedAt = null;
    cleanupAuthState(this.authStatePath);
    this.setStatus('disconnected');
  }

  dispose(): void {
    this.disposed = true;
    this.qrCode = null;
    this.qrIssuedAt = null;
    clearReconnectTimer(this.reconnect);
    this.disposeSocket();
    this.removeAllListeners();
  }

  private disposeSocket(): void {
    if (!this.socket) {
      return;
    }
    this.socket.ev.removeAllListeners('creds.update');
    this.socket.ev.removeAllListeners('connection.update');
    this.socket.ev.removeAllListeners('messages.upsert');
    this.socket.end(new Error('Socket replaced'));
    this.socket = null;
  }
}
