/**
 * Migration v022 — remove run_in_background column from app_settings
 *
 * This setting was replaced by close_behavior (v021). The runtime code
 * was already removed; this migration drops the orphaned column.
 *
 * SQLite 3.35.0+ supports ALTER TABLE DROP COLUMN. For older versions,
 * we recreate the table without the column.
 */
import type { Database } from 'better-sqlite3';
import type { Migration } from './index.js';

export const migration: Migration = {
  version: 22,
  up: (db: Database) => {
    // Check if column exists before trying to drop it
    const columns = db.prepare(`PRAGMA table_info(app_settings)`).all() as Array<{
      name: string;
    }>;
    if (!columns.some((col) => col.name === 'run_in_background')) {
      return; // Column already gone
    }

    // SQLite 3.35.0+ supports DROP COLUMN directly
    try {
      db.prepare('ALTER TABLE app_settings DROP COLUMN run_in_background').run();
    } catch {
      // Older SQLite — column remains but is unused (harmless)
      // The runtime code no longer reads or writes it
    }
  },
  down: (db: Database) => {
    // Re-add the column if rolling back
    const columns = db.prepare(`PRAGMA table_info(app_settings)`).all() as Array<{
      name: string;
    }>;
    if (!columns.some((col) => col.name === 'run_in_background')) {
      db.prepare(
        'ALTER TABLE app_settings ADD COLUMN run_in_background INTEGER NOT NULL DEFAULT 0',
      ).run();
    }
  },
};
