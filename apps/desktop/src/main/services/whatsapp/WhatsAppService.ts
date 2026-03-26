/**
 * WhatsAppService — Baileys-based WhatsApp channel adapter
 *
 * Contributed by aryan877 (PR #595 feat/whatsapp-integration).
 * Handles connection lifecycle, QR-code authentication, and message reception.
 *
 * Implementation split across:
 *   normalizeMessage.ts   — inbound message parsing
 *   reconnection.ts       — exponential-backoff reconnect logic
 *   authCleanup.ts        — auth-state filesystem helpers
 *   connectionHandler.ts  — connection.update event handler
 */
import { EventEmitter } from 'events';
import path from 'path';
import { app } from 'electron';
import type {
  MessagingConnectionStatus,
  MessagingProviderId,
  ChannelAdapter,
} from '@accomplish_ai/agent-core/common';
import { normalizeMessage } from './normalizeMessage.js';
import { cleanupAuthState } from './authCleanup.js';
import {
  createReconnectState,
  clearReconnectTimer,
  scheduleReconnect,
  type ReconnectState,
} from './reconnection.js';

export interface WhatsAppServiceEvents {
  qr: (qrString: string) => void;
  status: (status: MessagingConnectionStatus) => void;
  message: (msg: {
    messageId: string;
    senderId: string;
    senderName?: string;
    text: string;
    timestamp: number;
    isGroup: boolean;
    isFromMe: boolean;
  }) => void;
  phoneNumber: (phoneNumber: string) => void;
  ownerLid: (lid: string) => void;
}

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

  constructor() {
    super();
    this.authStatePath = path.join(app.getPath('userData'), 'whatsapp-auth');
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
        console.warn('[WhatsApp] Failed to fetch latest version, using default:', err);
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
          this.onConnectionUpdate(
            update,
            DisconnectReason as unknown as Record<string, number>,
            jidNormalizedUser,
          ),
      );
      this.socket.ev.on('messages.upsert', (upsert: { type: string; messages: unknown[] }) => {
        if (upsert.type !== 'notify') {
          return;
        }
        for (const raw of upsert.messages as Array<Record<string, unknown>>) {
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

  private onConnectionUpdate(
    update: { connection?: string; lastDisconnect?: { error?: unknown }; qr?: string },
    DisconnectReason: Record<string, number>,
    jidNormalizedUser: (jid: string) => string,
  ): void {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      this.qrCode = qr;
      this.setStatus('qr_ready');
      this.emit('qr', qr);
    }
    if (connection === 'close') {
      this.qrCode = null;
      if (this.manualDisconnect) {
        this.setStatus('disconnected');
        return;
      }
      const code = (lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)
        ?.output?.statusCode;
      if (code === DisconnectReason.loggedOut || code === DisconnectReason.forbidden) {
        this.setStatus('logged_out');
        cleanupAuthState(this.authStatePath);
      } else if (
        code === DisconnectReason.restartRequired ||
        code === DisconnectReason.badSession
      ) {
        if (code === DisconnectReason.badSession) {
          cleanupAuthState(this.authStatePath);
        }
        if (!this.disposed) {
          this.connect().catch((e) => console.error('[WhatsApp] Reconnect failed:', e));
        }
      } else if (code === DisconnectReason.connectionReplaced) {
        console.warn('[WhatsApp] Connection replaced');
        this.setStatus('disconnected');
      } else if (!this.disposed) {
        scheduleReconnect(
          this.reconnect,
          () => this.connect(),
          () => this.setStatus('disconnected'),
        );
      }
    }
    if (connection === 'open') {
      this.qrCode = null;
      this.reconnect.attempts = 0;
      this.reconnect.scheduled = false;
      this.setStatus('connected');
      const user = this.socket?.user;
      if (user?.id) {
        this.emit('phoneNumber', user.id.split(':')[0].split('@')[0]);
      }
      if (user?.lid) {
        this.emit('ownerLid', jidNormalizedUser(user.lid));
      }
    }
  }

  async sendMessage(recipientId: string, text: string): Promise<void> {
    if (!this.socket) {
      throw new Error('WhatsApp is not connected');
    }
    await this.socket.sendMessage(recipientId, { text });
  }

  getQrCode(): string | null {
    return this.qrCode;
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
    cleanupAuthState(this.authStatePath);
    this.setStatus('disconnected');
  }

  dispose(): void {
    this.disposed = true;
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
