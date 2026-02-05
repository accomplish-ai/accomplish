import type { Database } from 'better-sqlite3';
import type { Migration } from './index.js';

export const migration: Migration = {
  version: 2,
  up(db: Database): void {
    db.exec(`
      ALTER TABLE app_settings
      ADD COLUMN azure_foundry_config TEXT
    `);
    console.log('[v002] Added azure_foundry_config column');
  },
  down(db: Database): void {
    db.exec(`
      ALTER TABLE app_settings
      DROP COLUMN azure_foundry_config
    `);
    console.log('[v002] Removed azure_foundry_config column');
  },
};
