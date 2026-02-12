import type { Database } from 'better-sqlite3';
import type { Migration } from './index.js';

export const migration: Migration = {
  version: 7,
  up: (db: Database) => {
    db.exec(`
      CREATE TABLE connectors (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        url TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'disconnected'
          CHECK (status IN ('connected', 'disconnected', 'error', 'connecting')),
        is_enabled INTEGER NOT NULL DEFAULT 1,
        oauth_metadata_json TEXT,
        client_registration_json TEXT,
        last_connected_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);

    db.exec(`CREATE INDEX idx_connectors_enabled ON connectors(is_enabled)`);
    db.exec(`CREATE INDEX idx_connectors_status ON connectors(status)`);
  },
};
