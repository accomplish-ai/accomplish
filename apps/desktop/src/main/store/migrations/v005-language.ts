// apps/desktop/src/main/store/migrations/v005-language.ts

import type { Database } from 'better-sqlite3';
import type { Migration } from './index';

export const migration: Migration = {
  version: 5,
  up(db: Database) {
    // Add language column to app_settings table
    db.exec(`
      ALTER TABLE app_settings
      ADD COLUMN language TEXT NOT NULL DEFAULT 'auto'
    `);
  },
};
