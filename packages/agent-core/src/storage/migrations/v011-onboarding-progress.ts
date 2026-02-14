import type { Database } from 'better-sqlite3';
import type { Migration } from './index.js';

function migrateV011(db: Database): void {
  console.log('Running migration v011: onboarding_progress');

  // Create onboarding_progress table
  db.exec(`
    CREATE TABLE IF NOT EXISTS onboarding_progress (
      id INTEGER PRIMARY KEY CHECK (id = 1), -- Singleton table
      completed_mission_ids TEXT NOT NULL DEFAULT '[]',
      total_points INTEGER NOT NULL DEFAULT 0,
      level INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Initialize with empty progress
  db.exec(`
    INSERT INTO onboarding_progress (id, completed_mission_ids, total_points, level)
    VALUES (1, '[]', 0, 1)
    ON CONFLICT(id) DO NOTHING
  `);

  console.log('Migration v011 completed successfully');
}

export const migration: Migration = {
  version: 11,
  up: migrateV011,
};
