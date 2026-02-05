import type { Database } from 'better-sqlite3';
import type { Migration } from './index.js';

export const migration: Migration = {
  version: 4,
  up(db: Database): void {
    db.exec(`
      ALTER TABLE app_settings ADD COLUMN openai_base_url TEXT DEFAULT ''
    `);
  },
};
