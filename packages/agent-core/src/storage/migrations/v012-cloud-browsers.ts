import type { Database } from 'better-sqlite3';
import type { Migration } from './index.js';

export const migration: Migration = {
  version: 12,
  up: (db: Database) => {
    db.exec(`ALTER TABLE app_settings ADD COLUMN cloud_browser_config TEXT DEFAULT NULL`);
  },
};
