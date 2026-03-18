import type { Database } from 'better-sqlite3';
import type { Migration } from './index.js';

export const migration: Migration = {
  version: 10,
  up: (db: Database) => {
    db.exec(
      `ALTER TABLE app_settings ADD COLUMN sandbox_config TEXT NOT NULL DEFAULT '${JSON.stringify({
        mode: 'disabled',
        allowedPaths: [],
        networkRestricted: false,
        allowedHosts: [],
      })}'`,
    );
  },
};
