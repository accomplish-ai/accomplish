import { google } from 'googleapis';
import { loadToken } from './accounts.js';

export function createGmailClient(tokenFilePath: string) {
  const tokenData = loadToken(tokenFilePath);
  const auth = new google.auth.OAuth2();
  auth.setCredentials({
    access_token: tokenData.accessToken,
    refresh_token: tokenData.refreshToken,
    expiry_date: tokenData.expiresAt,
  });
  return google.gmail({ version: 'v1', auth });
}

export function parseFlags(args: string): Record<string, string> {
  const flags: Record<string, string> = {};
  const parts = args.match(/--(\w[\w-]*)(?:\s+(?!"--|$)(\S+(?:\s+(?!--)\S+)*))?/g) ?? [];
  for (const part of parts) {
    const m = part.match(/^--(\w[\w-]*)\s*(.*)/);
    if (m) {
      flags[m[1]] = m[2].trim();
    }
  }
  return flags;
}

export function getHeader(
  headers: Array<{ name?: string | null; value?: string | null }>,
  name: string,
): string {
  return headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? '';
}

function sanitizeHeader(value: string): string {
  return value.replace(/[\r\n]/g, ' ');
}

export function composeRfc2822(fields: {
  to: string;
  from?: string;
  subject: string;
  body: string;
  cc?: string;
  inReplyTo?: string;
  references?: string;
  threadId?: string;
}): string {
  const lines: string[] = [];
  lines.push(`To: ${sanitizeHeader(fields.to)}`);
  if (fields.cc) {
    lines.push(`Cc: ${sanitizeHeader(fields.cc)}`);
  }
  lines.push(`Subject: ${sanitizeHeader(fields.subject)}`);
  lines.push('MIME-Version: 1.0');
  lines.push('Content-Type: text/plain; charset=UTF-8');
  if (fields.inReplyTo) {
    lines.push(`In-Reply-To: ${sanitizeHeader(fields.inReplyTo)}`);
  }
  if (fields.references) {
    lines.push(`References: ${sanitizeHeader(fields.references)}`);
  }
  lines.push('');
  lines.push(fields.body);
  return lines.join('\r\n');
}

export function base64url(raw: string): string {
  return Buffer.from(raw)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

export function handleGmailError(email: string, error: unknown): string {
  const err = error as { code?: number; status?: number; message?: string };
  const status = err.status ?? err.code;
  if (status === 401 || status === 403) {
    return `Access denied for account ${email}. The account may need to be reconnected in Settings → Integrations.`;
  }
  if (status === 429) {
    return `Rate limit reached for account ${email}. Please wait a moment and try again.`;
  }
  return `Error for account ${email}: ${err.message ?? String(error)}`;
}
