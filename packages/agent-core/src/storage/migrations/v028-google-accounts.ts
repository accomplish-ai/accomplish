import type { Database } from 'better-sqlite3';
import type { Migration } from './index.js';

/**
 * Creates the google_accounts table for multi-account Google Workspace support.
 *
 * WHY: Users can connect multiple Google accounts (personal, work, etc.) and the
 * agent needs to route Gmail/Calendar/Drive operations to the correct account.
 * Only non-sensitive metadata is stored here — OAuth tokens are kept in
 * SecureStorage (AES-256-GCM) keyed by google_account_id, never in SQLite.
 */
export const migration: Migration = {
  version: 28,
  up: (db: Database) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS google_accounts (
        google_account_id TEXT PRIMARY KEY,
        email             TEXT NOT NULL,
        display_name      TEXT NOT NULL,
        picture_url       TEXT,
        label             TEXT NOT NULL DEFAULT '',
        status            TEXT NOT NULL DEFAULT 'connected',
        connected_at      TEXT NOT NULL,
        last_refreshed_at TEXT
      )
    `);
  },
  down: (db: Database) => {
    db.exec('DROP TABLE IF EXISTS google_accounts');
  },
};
