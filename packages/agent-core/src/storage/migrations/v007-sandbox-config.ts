import type { Database } from 'better-sqlite3';
import type { Migration } from './index.js';

export const migration: Migration = {
  version: 7,
  up: (db: Database) => {
    const columns = db
      .prepare('PRAGMA table_info(app_settings)')
      .all() as Array<{ name: string }>;

    const hasSandboxConfigColumn = columns.some(
      (column) => column.name === 'sandbox_config'
    );

    if (!hasSandboxConfigColumn) {
      db.exec(`ALTER TABLE app_settings ADD COLUMN sandbox_config TEXT`);
    }
  },
};
