import type { Database } from 'better-sqlite3';
import type { Migration } from './index.js';

export const migration: Migration = {
  version: 9,
  up: (db: Database) => {
    db.exec(`
      CREATE TABLE cloud_browsers (
        id TEXT PRIMARY KEY,
        provider_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        last_validated_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);

    db.exec(`CREATE INDEX idx_cloud_browsers_provider ON cloud_browsers(provider_id)`);
    db.exec(`CREATE INDEX idx_cloud_browsers_enabled ON cloud_browsers(enabled)`);
  },
};
