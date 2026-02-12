import type { Database } from 'better-sqlite3';
import type { Migration } from './index.js';

export const migration: Migration = {
  version: 8,
  up: (db: Database) => {
    db.exec(`
      CREATE TABLE task_favorites (
        task_id TEXT PRIMARY KEY,
        prompt TEXT NOT NULL,
        summary TEXT,
        favorited_at TEXT NOT NULL
      )
    `);
    db.exec(`CREATE INDEX idx_task_favorites_favorited_at ON task_favorites(favorited_at)`);
  },
};
