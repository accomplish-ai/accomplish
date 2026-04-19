import type { Database } from 'better-sqlite3';
import type { Migration } from './index.js';

/**
 * v031 — Drop the unused `app_settings.desktop_blocklist` column.
 *
 * The MCP feature that wrote this column has been removed. The column
 * was added by v014 and re-added defensively by v027 for DBs upgraded
 * from the commercial schema; per AGENTS.md, neither released migration
 * is edited here.
 *
 * SQLite 3.35+ supports `ALTER TABLE ... DROP COLUMN`; better-sqlite3
 * 12.x ships SQLite ≥ 3.45. SQLite has no `DROP COLUMN IF EXISTS`, so
 * gate on PRAGMA table_info to stay idempotent — handles schemas where
 * the column is already absent (e.g. a DB restored from elsewhere, or a
 * repeated run).
 */
export const migration: Migration = {
  version: 31,
  up: (db: Database) => {
    const cols = db.prepare('PRAGMA table_info(app_settings)').all() as Array<{ name: string }>;
    if (cols.some((c) => c.name === 'desktop_blocklist')) {
      db.exec('ALTER TABLE app_settings DROP COLUMN desktop_blocklist');
    }
  },
};
