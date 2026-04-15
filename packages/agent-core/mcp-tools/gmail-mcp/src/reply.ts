import type { gmail_v1 } from 'googleapis';
import { getHeader, composeRfc2822, base64url } from './gmail-client.js';

type Gmail = gmail_v1.Gmail;

export async function execReply(gmail: Gmail, email: string, flags: Record<string, string>) {
  const msgId = flags['messageId'];
  if (!msgId) {
    throw new Error('Missing required --messageId flag');
  }
  const orig = await gmail.users.messages.get({
    userId: 'me',
    id: msgId,
    format: 'metadata',
    metadataHeaders: ['Subject', 'From', 'Message-ID', 'References'],
  });
  const hdrs = orig.data.payload?.headers ?? [];
  const subject = getHeader(hdrs, 'Subject');
  const origMsgId = getHeader(hdrs, 'Message-ID');
  const refs = [getHeader(hdrs, 'References'), origMsgId].filter(Boolean).join(' ');
  const raw = base64url(
    composeRfc2822({
      to: getHeader(hdrs, 'From'),
      subject: /^re:/i.test(subject.trim()) ? subject : `Re: ${subject}`,
      body: flags['body'] ?? '',
      cc: flags['cc'],
      inReplyTo: origMsgId,
      references: refs,
    }),
  );
  const requestBody: { raw: string; threadId?: string } = { raw };
  if (orig.data.threadId) {
    requestBody.threadId = orig.data.threadId;
  }
  const res = await gmail.users.messages.send({ userId: 'me', requestBody });
  return {
    account: email,
    messageId: res.data.id,
    threadId: res.data.threadId ?? orig.data.threadId ?? null,
    status: 'sent',
  };
}