import type { Database } from 'better-sqlite3';
import type { Migration } from './index.js';

export const migration: Migration = {
  version: 15,
  up(db: Database): void {
    db.exec(`
      ALTER TABLE providers ADD COLUMN custom_base_url TEXT DEFAULT NULL
    `);
  },
};

