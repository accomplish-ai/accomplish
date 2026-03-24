import type { Database } from 'better-sqlite3';
import type { Migration } from './index.js';

export const migration: Migration = {
  version: 13,
  up: (db: Database) => {
    db.exec(`ALTER TABLE app_settings ADD COLUMN run_in_background INTEGER NOT NULL DEFAULT 0`);
  },
};
