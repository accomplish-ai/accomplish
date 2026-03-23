/**
 * Desktop Control Repository
 *
 * Persists the user's custom blocklist entries as a JSON column
 * in the app_settings table (added by migration v009).
 *
 * Uses .js extensions for ESM imports per CLAUDE.md.
 */

import type { BlocklistEntry } from '../../common/types/desktop.js';
import { getDatabase } from '../database.js';

interface BlocklistRow {
  desktop_blocklist: string | null;
}

function getBlocklistJson(): string | null {
  const db = getDatabase();
  const row = db.prepare('SELECT desktop_blocklist FROM app_settings WHERE id = 1').get() as
    | BlocklistRow
    | undefined;
  return row?.desktop_blocklist ?? null;
}

function isBlocklistEntry(item: unknown): item is BlocklistEntry {
  if (typeof item !== 'object' || item === null) {
    return false;
  }
  const obj = item as Record<string, unknown>;
  return (
    typeof obj.appName === 'string' &&
    typeof obj.pattern === 'string' &&
    typeof obj.reason === 'string'
  );
}

function parseBlocklist(json: string | null): BlocklistEntry[] {
  if (!json) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(isBlocklistEntry);
  } catch {
    return [];
  }
}

export function getDesktopBlocklist(): BlocklistEntry[] {
  return parseBlocklist(getBlocklistJson());
}

export function setDesktopBlocklist(entries: BlocklistEntry[]): void {
  const db = getDatabase();
  db.prepare('UPDATE app_settings SET desktop_blocklist = ? WHERE id = 1').run(
    JSON.stringify(entries),
  );
}

export function addDesktopBlocklistEntry(entry: BlocklistEntry): void {
  const existing = getDesktopBlocklist();
  const filtered = existing.filter((e) => e.appName !== entry.appName);
  filtered.push(entry);
  setDesktopBlocklist(filtered);
}

export function removeDesktopBlocklistEntry(appName: string): void {
  const existing = getDesktopBlocklist();
  const filtered = existing.filter((e) => e.appName !== appName);
  setDesktopBlocklist(filtered);
}
