import type { Database } from 'better-sqlite3';
import type { Migration } from './index.js';

export const migration: Migration = {
  version: 6,
  up: (db: Database) => {
    db.exec(`
      CREATE TABLE skills (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        command TEXT NOT NULL,
        description TEXT NOT NULL,
        source TEXT NOT NULL CHECK (source IN ('official', 'community', 'custom')),
        is_enabled INTEGER NOT NULL DEFAULT 1,
        is_verified INTEGER NOT NULL DEFAULT 0,
        is_hidden INTEGER NOT NULL DEFAULT 0,
        file_path TEXT NOT NULL,
        github_url TEXT,
        updated_at TEXT NOT NULL
      )
    `);

    db.exec(`CREATE INDEX idx_skills_enabled ON skills(is_enabled)`);
    db.exec(`CREATE INDEX idx_skills_source ON skills(source)`);
  },
};
