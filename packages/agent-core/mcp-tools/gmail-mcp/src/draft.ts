import type { gmail_v1 } from 'googleapis';
import { composeRfc2822, base64url } from './gmail-client.js';

type Gmail = gmail_v1.Gmail;

export async function execDraft(gmail: Gmail, email: string, flags: Record<string, string>) {
  const raw = base64url(
    composeRfc2822({
      to: flags['to'] ?? '',
      subject: flags['subject'] ?? '',
      body: flags['body'] ?? '',
    }),
  );
  const res = await gmail.users.drafts.create({ userId: 'me', requestBody: { message: { raw } } });
  return { account: email, draftId: res.data.id, status: 'draft_saved' };
}
