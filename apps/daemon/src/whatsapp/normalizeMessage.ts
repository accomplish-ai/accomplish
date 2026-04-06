/**
 * normalizeMessage — extracts a normalized message payload from a raw Baileys
 * `messages.upsert` entry.
 *
 * Extracted from WhatsAppService for modularity.
 */

export interface NormalizedMessage {
  messageId: string;
  senderId: string;
  senderName?: string;
  text: string;
  timestamp: number;
  isGroup: boolean;
  isFromMe: boolean;
}

/**
 * Attempt to extract text content and metadata from a raw Baileys message.
 * Returns `null` when the message has no usable text.
 */
export function normalizeMessage(msg: Record<string, unknown>): NormalizedMessage | null {
  if (!msg.message) {
    return null;
  }

  const message = msg.message as Record<string, unknown>;
  const extendedText = message.extendedTextMessage as Record<string, unknown> | undefined;
  const imageMsg = message.imageMessage as Record<string, unknown> | undefined;
  const videoMsg = message.videoMessage as Record<string, unknown> | undefined;
  const docMsg = message.documentMessage as Record<string, unknown> | undefined;

  const text =
    (message.conversation as string) ||
    (extendedText?.text as string) ||
    (imageMsg?.caption as string) ||
    (videoMsg?.caption as string) ||
    (docMsg?.caption as string) ||
    (docMsg?.title as string) ||
    '';

  if (!text.trim()) {
    return null;
  }

  const key = msg.key as Record<string, unknown>;
  const senderId = (key.remoteJid as string) || '';
  const isGroup = senderId.endsWith('@g.us');
  const senderName = (msg.pushName as string) || undefined;
  const isFromMe = key.fromMe === true;

  const rawTs = msg.messageTimestamp;
  let ts: number;
  if (typeof rawTs === 'number') {
    ts = rawTs;
  } else if (rawTs != null && typeof rawTs === 'object' && 'toNumber' in (rawTs as object)) {
    ts = (rawTs as { toNumber(): number }).toNumber();
  } else {
    ts = 0;
  }

  return {
    messageId: (key.id as string) || '',
    senderId,
    senderName,
    text,
    timestamp: ts * 1000,
    isGroup,
    isFromMe,
  };
}
