import { google } from 'googleapis';
import fs from 'node:fs';
import type { AccountEntry } from './accounts.js';

export function createCalendarClient(tokenFilePath: string) {
  const tokenData = JSON.parse(fs.readFileSync(tokenFilePath, 'utf-8')) as {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
  };
  const auth = new google.auth.OAuth2();
  auth.setCredentials({
    access_token: tokenData.accessToken,
    refresh_token: tokenData.refreshToken,
    expiry_date: tokenData.expiresAt,
  });
  return google.calendar({ version: 'v3', auth });
}

function parseFlags(parts: string[]): Record<string, string> {
  const flags: Record<string, string> = {};
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].startsWith('--') && i + 1 < parts.length && !parts[i + 1].startsWith('--')) {
      flags[parts[i].slice(2)] = parts[i + 1];
      i++;
    }
  }
  return flags;
}

function formatEvent(
  evt: {
    id?: string | null;
    summary?: string | null;
    start?: { dateTime?: string | null; date?: string | null } | null;
    end?: { dateTime?: string | null; date?: string | null } | null;
    location?: string | null;
    attendees?: Array<{ email?: string | null; responseStatus?: string | null }> | null;
    conferenceData?: {
      entryPoints?: Array<{ entryPointType?: string | null; uri?: string | null }> | null;
    } | null;
    htmlLink?: string | null;
  },
  account?: string,
) {
  const videoLink = evt.conferenceData?.entryPoints?.find((e) => e.entryPointType === 'video')?.uri;
  return {
    ...(account ? { account } : {}),
    eventId: evt.id,
    title: evt.summary,
    start: evt.start?.dateTime ?? evt.start?.date,
    end: evt.end?.dateTime ?? evt.end?.date,
    location: evt.location,
    attendees: evt.attendees?.map((a) => ({ email: a.email, responseStatus: a.responseStatus })),
    ...(videoLink ? { videoLink } : {}),
    ...(evt.htmlLink ? { link: evt.htmlLink } : {}),
  };
}

function handleApiError(error: unknown, email: string): string {
  const err = error as { code?: number; status?: number; message?: string };
  const status = err.status ?? err.code;
  if (status === 401 || status === 403) {
    return `Access denied for account ${email}. Reconnect in Settings → Integrations.`;
  }
  if (status === 404) {
    return 'Event not found. It may have been deleted or is from a different account.';
  }
  return err.message ?? String(error);
}

export async function cmdList(account: AccountEntry, flags: Record<string, string>) {
  const cal = createCalendarClient(account.tokenFilePath);
  const res = await cal.events.list({
    calendarId: 'primary',
    timeMin: flags['start'],
    timeMax: flags['end'],
    singleEvents: true,
    orderBy: 'startTime',
  });
  return (res.data.items ?? []).map((e) => formatEvent(e, account.label));
}

export async function cmdGet(account: AccountEntry, eventId: string) {
  const cal = createCalendarClient(account.tokenFilePath);
  const res = await cal.events.get({ calendarId: 'primary', eventId });
  const evt = res.data;
  return {
    ...formatEvent(evt, account.label),
    description: evt.description,
    attendees: evt.attendees?.map((a) => ({
      email: a.email,
      displayName: a.displayName,
      responseStatus: a.responseStatus,
    })),
  };
}

export async function cmdCreate(account: AccountEntry, flags: Record<string, string>) {
  const cal = createCalendarClient(account.tokenFilePath);
  const attendees = flags['attendees']
    ? flags['attendees'].split(',').map((e) => ({ email: e.trim() }))
    : undefined;
  const res = await cal.events.insert({
    calendarId: 'primary',
    requestBody: {
      summary: flags['title'],
      start: { dateTime: flags['start'] },
      end: { dateTime: flags['end'] },
      location: flags['location'],
      description: flags['description'],
      attendees,
    },
  });
  return formatEvent(res.data, account.label);
}

export async function cmdUpdate(account: AccountEntry, flags: Record<string, string>) {
  const { eventId, title, start, end, location, description } = flags;
  if (!eventId) {
    throw new Error('eventId is required');
  }
  const cal = createCalendarClient(account.tokenFilePath);
  const patch: Record<string, unknown> = {};
  if (title) {
    patch['summary'] = title;
  }
  if (start) {
    patch['start'] = { dateTime: start };
  }
  if (end) {
    patch['end'] = { dateTime: end };
  }
  if (location) {
    patch['location'] = location;
  }
  if (description) {
    patch['description'] = description;
  }
  const res = await cal.events.patch({ calendarId: 'primary', eventId, requestBody: patch });
  return formatEvent(res.data, account.label);
}

export async function cmdDelete(account: AccountEntry, eventId: string) {
  const cal = createCalendarClient(account.tokenFilePath);
  await cal.events.delete({ calendarId: 'primary', eventId });
  return { status: 'deleted', eventId };
}

export async function cmdRsvp(account: AccountEntry, flags: Record<string, string>) {
  const { eventId, status } = flags;
  if (!eventId) {
    throw new Error('Missing required flag --eventId');
  }
  if (!status) {
    throw new Error('Missing required flag --status');
  }
  const validStatuses = ['accepted', 'declined', 'tentative', 'needsAction'];
  if (!validStatuses.includes(status)) {
    throw new Error(`Invalid --status: ${status}`);
  }
  const cal = createCalendarClient(account.tokenFilePath);
  const getRes = await cal.events.get({ calendarId: 'primary', eventId });
  const attendees = (getRes.data.attendees ?? []).map((a) =>
    a.self ? { ...a, responseStatus: status } : a,
  );
  const res = await cal.events.patch({
    calendarId: 'primary',
    eventId,
    requestBody: { attendees },
  });
  return {
    account: account.label,
    eventId,
    responseStatus: res.data.attendees?.find((a) => a.self)?.responseStatus,
  };
}

export async function cmdFreeTime(
  accounts: AccountEntry[],
  flags: Record<string, string>,
): Promise<unknown> {
  const duration = Number.parseInt(flags['duration'] ?? '30', 10);
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error('Invalid --duration: must be a positive integer (minutes)');
  }
  const rangeStart = new Date(flags['start']);
  if (Number.isNaN(rangeStart.getTime())) {
    throw new Error('Invalid --start: must be a valid ISO 8601 date-time string');
  }
  const rangeEnd = new Date(flags['end']);
  if (Number.isNaN(rangeEnd.getTime())) {
    throw new Error('Invalid --end: must be a valid ISO 8601 date-time string');
  }

  const allEvents = await Promise.allSettled(accounts.map((acc) => cmdList(acc, flags)));

  const rejected = allEvents.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
  if (rejected.length > 0) {
    const reasons = rejected.map((r) => String(r.reason)).join('; ');
    throw new Error(`Failed to fetch events for one or more accounts: ${reasons}`);
  }

  const busy: Array<{ start: Date; end: Date }> = [];
  for (const result of allEvents) {
    if (result.status === 'fulfilled') {
      for (const evt of result.value) {
        if (evt.start && evt.end) {
          busy.push({ start: new Date(evt.start as string), end: new Date(evt.end as string) });
        }
      }
    }
  }

  busy.sort((a, b) => a.start.getTime() - b.start.getTime());

  // Merge overlapping intervals
  const merged: Array<{ start: Date; end: Date }> = [];
  for (const interval of busy) {
    if (merged.length > 0 && interval.start <= merged[merged.length - 1].end) {
      merged[merged.length - 1].end = new Date(
        Math.max(merged[merged.length - 1].end.getTime(), interval.end.getTime()),
      );
    } else {
      merged.push({ ...interval });
    }
  }

  const slots: Array<{ start: string; end: string }> = [];
  let cursor = rangeStart;

  for (const block of merged) {
    if (cursor < block.start) {
      const gapMs = block.start.getTime() - cursor.getTime();
      if (gapMs >= duration * 60 * 1000) {
        slots.push({ start: cursor.toISOString(), end: block.start.toISOString() });
        if (slots.length >= 10) {
          break;
        }
      }
    }
    if (block.end > cursor) {
      cursor = block.end;
    }
  }

  if (slots.length < 10 && cursor < rangeEnd) {
    const gapMs = rangeEnd.getTime() - cursor.getTime();
    if (gapMs >= duration * 60 * 1000) {
      slots.push({ start: cursor.toISOString(), end: rangeEnd.toISOString() });
    }
  }

  if (slots.length === 0) {
    return 'No free slots found in the requested range. Consider widening the search window.';
  }

  return slots.slice(0, 10);
}

export { parseFlags, handleApiError };
