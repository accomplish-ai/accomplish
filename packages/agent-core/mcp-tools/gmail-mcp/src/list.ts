import type { gmail_v1 } from 'googleapis';
import { getHeader } from './gmail-client.js';

type Gmail = gmail_v1.Gmail;

export async function execList(
  gmail: Gmail,
  email: string,
  flags: Record<string, string>,
  _positional: string,
) {
  const q =
    [flags['query'] ?? '', flags['unread-only'] !== undefined ? 'is:unread' : '']
      .filter(Boolean)
      .join(' ') || undefined;

  const rawMax = Number.parseInt(flags['max'] ?? '20', 10);
  const maxResults = Number.isFinite(rawMax) && rawMax > 0 ? Math.min(rawMax, 100) : 20;

  const listRes = await gmail.users.messages.list({ userId: 'me', q, maxResults });
  const messages = listRes.data.messages ?? [];
  const results = await Promise.allSettled(
    messages
      .filter((m) => m.id != null)
      .map((m) =>
        gmail.users.messages.get({
          userId: 'me',
          id: m.id as string,
          format: 'metadata',
          metadataHeaders: ['Subject', 'From', 'Date'],
        }),
      ),
  );
  return results.flatMap((r) => {
    if (r.status === 'rejected') {
      return [];
    }
    const msg = r.value.data;
    const hdrs = msg.payload?.headers ?? [];
    return [
      {
        account: email,
        messageId: msg.id,
        threadId: msg.threadId,
        subject: getHeader(hdrs, 'Subject'),
        from: getHeader(hdrs, 'From'),
        date: getHeader(hdrs, 'Date'),
        snippet: msg.snippet,
        isUnread: msg.labelIds?.includes('UNREAD') ?? false,
      },
    ];
  });
}
