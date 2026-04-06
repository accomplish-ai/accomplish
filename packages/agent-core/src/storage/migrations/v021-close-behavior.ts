/**
 * Migration v021 — add close_behavior column to app_settings
 *
 * Controls what happens when the user clicks the window close button:
 * - 'keep-daemon' (default): hide window to tray, daemon keeps running
 * - 'stop-daemon': shutdown daemon and quit app entirely
 *
 * Part of the daemon architecture (ENG-694).
 */
import type { Database } from 'better-sqlite3';
import type { Migration } from './index.js';

export const migration: Migration = {
  version: 21,
  up: (db: Database) => {
    // Add close_behavior column — controls window close button behavior
    const columns = db.prepare(`PRAGMA table_info(app_settings)`).all() as Array<{
      name: string;
    }>;
    if (!columns.some((col) => col.name === 'close_behavior')) {
      db.prepare(
        `ALTER TABLE app_settings ADD COLUMN close_behavior TEXT NOT NULL DEFAULT 'keep-daemon'`,
      ).run();
    }
  },
  down: (db: Database) => {
    // SQLite doesn't support DROP COLUMN in older versions; recreate if needed.
    // For forward-only migrations, this is a no-op.
    void db;
  },
};
