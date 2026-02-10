import type {
  McpConnector,
  ConnectorStatus,
  OAuthMetadata,
  OAuthClientRegistration,
} from '../../common/types/connector.js';
import { getDatabase } from '../database.js';

interface ConnectorRow {
  id: string;
  name: string;
  url: string;
  status: string;
  is_enabled: number;
  oauth_metadata_json: string | null;
  client_registration_json: string | null;
  last_connected_at: string | null;
  created_at: string;
  updated_at: string;
}

function safeJsonParse<T>(json: string | null): T | undefined {
  if (!json) return undefined;
  try {
    return JSON.parse(json) as T;
  } catch {
    console.error('Failed to parse JSON from database:', json.slice(0, 100));
    return undefined;
  }
}

function rowToConnector(row: ConnectorRow): McpConnector {
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    status: row.status as ConnectorStatus,
    isEnabled: row.is_enabled === 1,
    oauthMetadata: safeJsonParse<OAuthMetadata>(row.oauth_metadata_json),
    clientRegistration: safeJsonParse<OAuthClientRegistration>(row.client_registration_json),
    lastConnectedAt: row.last_connected_at || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getAllConnectors(): McpConnector[] {
  const db = getDatabase();
  const rows = db.prepare('SELECT * FROM connectors ORDER BY created_at DESC').all() as ConnectorRow[];
  return rows.map(rowToConnector);
}

export function getEnabledConnectors(): McpConnector[] {
  const db = getDatabase();
  const rows = db
    .prepare('SELECT * FROM connectors WHERE is_enabled = 1 ORDER BY created_at DESC')
    .all() as ConnectorRow[];
  return rows.map(rowToConnector);
}

export function getConnectorById(id: string): McpConnector | null {
  const db = getDatabase();
  const row = db.prepare('SELECT * FROM connectors WHERE id = ?').get(id) as ConnectorRow | undefined;
  return row ? rowToConnector(row) : null;
}

export function upsertConnector(connector: McpConnector): void {
  const db = getDatabase();
  db.prepare(`
    INSERT INTO connectors (id, name, url, status, is_enabled, oauth_metadata_json, client_registration_json, last_connected_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      url = excluded.url,
      status = excluded.status,
      is_enabled = excluded.is_enabled,
      oauth_metadata_json = excluded.oauth_metadata_json,
      client_registration_json = excluded.client_registration_json,
      last_connected_at = excluded.last_connected_at,
      updated_at = excluded.updated_at
  `).run(
    connector.id,
    connector.name,
    connector.url,
    connector.status,
    connector.isEnabled ? 1 : 0,
    connector.oauthMetadata ? JSON.stringify(connector.oauthMetadata) : null,
    connector.clientRegistration ? JSON.stringify(connector.clientRegistration) : null,
    connector.lastConnectedAt || null,
    connector.createdAt,
    connector.updatedAt,
  );
}

export function setConnectorEnabled(id: string, enabled: boolean): void {
  const db = getDatabase();
  db.prepare('UPDATE connectors SET is_enabled = ?, updated_at = ? WHERE id = ?')
    .run(enabled ? 1 : 0, new Date().toISOString(), id);
}

export function setConnectorStatus(id: string, status: ConnectorStatus): void {
  const db = getDatabase();
  db.prepare('UPDATE connectors SET status = ?, updated_at = ? WHERE id = ?')
    .run(status, new Date().toISOString(), id);
}

export function deleteConnector(id: string): void {
  const db = getDatabase();
  db.prepare('DELETE FROM connectors WHERE id = ?').run(id);
}

export function clearAllConnectors(): void {
  const db = getDatabase();
  db.prepare('DELETE FROM connectors').run();
}
