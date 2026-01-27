// apps/desktop/src/main/store/migrations/v005-theme.ts

import type { Database } from 'better-sqlite3';
import type { Migration } from './index';

/**
 * Migration v005: Add theme column
 *
 * Adds theme preference column to support light/dark modes.
 */
export const migration: Migration = {
  version: 5,
  up(db: Database): void {
    db.exec(`
      ALTER TABLE app_settings ADD COLUMN theme TEXT DEFAULT 'light'
    `);
  },
};
