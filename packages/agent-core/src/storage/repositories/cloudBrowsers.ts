import type { CloudBrowserConfig } from '../../common/types/cloudBrowser.js';
import { getDatabase } from '../database.js';

interface CloudBrowserRow {
  id: string;
  provider_id: string;
  project_id: string;
  enabled: number;
  last_validated_at: string | null;
  created_at: string;
  updated_at: string;
}

function rowToConfig(row: CloudBrowserRow): CloudBrowserConfig {
  return {
    id: row.id,
    providerId: row.provider_id as CloudBrowserConfig['providerId'],
    projectId: row.project_id,
    enabled: row.enabled === 1,
    lastValidated: row.last_validated_at ? new Date(row.last_validated_at).getTime() : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const BROWSERBASE_ID = 'browserbase';

export function getBrowserbaseConfig(): CloudBrowserConfig | null {
  const db = getDatabase();
  const row = db
    .prepare('SELECT * FROM cloud_browsers WHERE provider_id = ? LIMIT 1')
    .get(BROWSERBASE_ID) as CloudBrowserRow | undefined;
  return row ? rowToConfig(row) : null;
}

export function upsertBrowserbaseConfig(projectId: string, enabled: boolean): CloudBrowserConfig {
  const db = getDatabase();
  const now = new Date().toISOString();
  const existing = getBrowserbaseConfig();

  if (existing) {
    db.prepare(
      'UPDATE cloud_browsers SET project_id = ?, enabled = ?, updated_at = ? WHERE id = ?'
    ).run(projectId, enabled ? 1 : 0, now, existing.id);
    return {
      ...existing,
      projectId,
      enabled,
      updatedAt: now,
    };
  }

  const id = `cb_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  db.prepare(
    'INSERT INTO cloud_browsers (id, provider_id, project_id, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, BROWSERBASE_ID, projectId, enabled ? 1 : 0, now, now);

  return {
    id,
    providerId: 'browserbase',
    projectId,
    enabled,
    createdAt: now,
    updatedAt: now,
  };
}

export function setBrowserbaseLastValidated(timestamp: number): void {
  const db = getDatabase();
  db.prepare(
    'UPDATE cloud_browsers SET last_validated_at = ?, updated_at = ? WHERE provider_id = ?'
  ).run(new Date(timestamp).toISOString(), new Date().toISOString(), BROWSERBASE_ID);
}

export function deleteBrowserbaseConfig(): void {
  const db = getDatabase();
  db.prepare('DELETE FROM cloud_browsers WHERE provider_id = ?').run(BROWSERBASE_ID);
}
