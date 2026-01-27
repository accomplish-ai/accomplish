// apps/desktop/src/main/store/migrations/v003-lmstudio.ts

import type { Database } from 'better-sqlite3';
import type { Migration } from './index';

/**
 * Migration v003: Add LM Studio configuration column
 */
export const migration: Migration = {
  version: 3,
  up(db: Database): void {
    db.exec(`
      ALTER TABLE app_settings
      ADD COLUMN lmstudio_config TEXT
    `);
    console.log('[v003] Added lmstudio_config column');
  },
  down(db: Database): void {
    // SQLite 3.35.0+ supports DROP COLUMN
    db.exec(`
      ALTER TABLE app_settings
      DROP COLUMN lmstudio_config
    `);
    console.log('[v003] Removed lmstudio_config column');
  },
};
