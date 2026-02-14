import type { Database } from 'better-sqlite3';
import type { Migration } from './index.js';

export const migration: Migration = {
  version: 10,
  up: (db: Database) => {
    // Add parameters column to skills table
    db.exec(
      `ALTER TABLE skills ADD COLUMN parameters TEXT DEFAULT NULL`
    );
  },
};
