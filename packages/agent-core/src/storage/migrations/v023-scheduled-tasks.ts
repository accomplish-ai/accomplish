/**
 * Migration v023 — create scheduled_tasks table
 *
 * Persistent storage for cron-based scheduled tasks. Schedules survive
 * daemon restart and OS reboot (when daemon is configured to auto-start).
 *
 * Part of the daemon architecture (ENG-694).
 */
import type { Database } from 'better-sqlite3';
import type { Migration } from './index.js';

export const migration: Migration = {
  version: 23,
  up: (db: Database) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS scheduled_tasks (
        id TEXT PRIMARY KEY,
        cron TEXT NOT NULL,
        prompt TEXT NOT NULL,
        workspace_id TEXT,
        is_enabled INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_run_at TEXT,
        next_run_at TEXT
      )
    `);
    db.exec(
      'CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_enabled ON scheduled_tasks(is_enabled)',
    );
    db.exec(
      'CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_workspace ON scheduled_tasks(workspace_id)',
    );
  },
  down: (db: Database) => {
    db.exec('DROP TABLE IF EXISTS scheduled_tasks');
  },
};
