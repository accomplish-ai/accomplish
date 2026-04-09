/** Supported messaging platform IDs */
export type MessagingPlatform = 'whatsapp' | 'slack' | 'telegram' | 'teams';

/**
 * Connection status for a messaging integration.
 * Mirrors WhatsAppService statuses from PR #595 (aryan877).
 */
export type MessagingConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'qr_ready'
  | 'connected'
  | 'error'
  | 'logged_out';

/** Alias kept for backwards-compat with type-only imports */
export type MessagingProviderId = MessagingPlatform;

/** Per-platform integration config stored in app settings */
export interface MessagingIntegrationConfig {
  /** Platform identifier */
  platform: MessagingPlatform;
  /** Whether the integration is enabled by the user */
  enabled: boolean;
  /** Whether remote tunnel access is enabled */
  tunnelEnabled: boolean;
  /** Current connection status (runtime, not fully persisted) */
  connectionStatus?: MessagingConnectionStatus;
  /** Human-readable label of the connected account (e.g. phone number) */
  accountName?: string;
  /** Connected phone number (WhatsApp) */
  phoneNumber?: string;
  /** Unix timestamp of last successful connection */
  lastConnectedAt?: number;
  /** Unix ms timestamp of last processed inbound message — watermark for offline sync */
  lastProcessedAt?: number;
  /** Message ID of last processed inbound message — dedup at watermark boundary */
  lastProcessedMessageId?: string;
}

/** Top-level messaging configuration stored in app_settings */
export interface MessagingConfig {
  integrations: Partial<Record<MessagingPlatform, MessagingIntegrationConfig>>;
}

/** QR code data emitted while waiting for device pairing */
export interface MessagingQRCode {
  platform: MessagingPlatform;
  /** Raw QR string (encode with any QR library) */
  qrData: string;
  /** Unix ms timestamp when this code expires */
  expiresAt: number;
}

/** Inbound message from a messaging platform */
export interface IncomingMessage {
  platform: MessagingPlatform;
  senderId: string;
  senderName?: string;
  text: string;
  timestamp: number;
  messageId: string;
  /** Chat/channel ID for sending replies */
  chatId: string;
  isGroup?: boolean;
  isFromMe?: boolean;
}

/**
 * Outbound channel adapter interface implemented by WhatsAppService (PR #595).
 * Each channel adapter handles its own connection lifecycle and message routing.
 */
export interface ChannelAdapter {
  readonly channelType: MessagingProviderId;
  getStatus(): MessagingConnectionStatus;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  dispose(): void;
}
