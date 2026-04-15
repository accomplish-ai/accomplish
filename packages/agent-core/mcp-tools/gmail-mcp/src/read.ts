import type { gmail_v1 } from 'googleapis';
import { getHeader } from './gmail-client.js';

type Gmail = gmail_v1.Gmail;

export function extractBody(payload: gmail_v1.Schema$MessagePart | undefined): string {
  if (!payload) {
    return '';
  }
  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64').toString('utf-8');
  }
  // Scan parts: prefer plain-text, remember HTML as fallback
  let htmlFallback = '';
  for (const part of payload.parts ?? []) {
    if (part.mimeType === 'text/plain') {
      const text = extractBody(part);
      if (text) {
        return text;
      }
    } else if (part.mimeType === 'text/html' && !htmlFallback) {
      htmlFallback = extractBody(part);
    }
  }
  if (htmlFallback) {
    return htmlFallback;
  }
  // HTML fallback for HTML-only messages (no plain-text part found)
  if (payload.mimeType === 'text/html' && payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64').toString('utf-8');
  }
  return '';
}

export async function execRead(gmail: Gmail, email: string, messageId: string) {
  const msg = await gmail.users.messages.get({ userId: 'me', id: messageId, format: 'full' });
  const hdrs = msg.data.payload?.headers ?? [];
  const attachments = (msg.data.payload?.parts ?? [])
    .filter((p) => p.filename && p.body?.size)
    .map((p) => ({ filename: p.filename!, mimeType: p.mimeType ?? '', size: p.body?.size ?? 0 }));
  return {
    account: email,
    messageId: msg.data.id,
    threadId: msg.data.threadId,
    subject: getHeader(hdrs, 'Subject'),
    from: getHeader(hdrs, 'From'),
    to: getHeader(hdrs, 'To'),
    cc: getHeader(hdrs, 'Cc'),
    date: getHeader(hdrs, 'Date'),
    body: extractBody(msg.data.payload),
    attachments,
  };
}
