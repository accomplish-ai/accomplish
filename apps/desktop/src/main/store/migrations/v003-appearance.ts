import type { Database } from 'better-sqlite3';
import type { Migration } from './index';

export const migration: Migration = {
  version: 3,
  up(db: Database): void {
    db.exec(`
      ALTER TABLE app_settings
      ADD COLUMN appearance TEXT NOT NULL DEFAULT 'system'
    `);
  },
};
