import type { Database } from 'better-sqlite3';
import type { Migration } from './index.js';

export const migration: Migration = {
  version: 9,
  up: (db: Database) => {
    // Add safety level setting (paranoid, normal, fast)
    db.exec(
      `ALTER TABLE app_settings ADD COLUMN safety_level TEXT NOT NULL DEFAULT 'normal'`
    );
    
    // Add dry-run mode setting
    db.exec(
      `ALTER TABLE app_settings ADD COLUMN dry_run_mode INTEGER NOT NULL DEFAULT 0`
    );
    
    // Add provider profile setting (stores active profile name)
    db.exec(
      `ALTER TABLE app_settings ADD COLUMN provider_profile TEXT NOT NULL DEFAULT 'balanced'`
    );
    
    // Add auto fallback setting (automatically fallback to other providers on failure)
    db.exec(
      `ALTER TABLE app_settings ADD COLUMN auto_fallback INTEGER NOT NULL DEFAULT 1`
    );
  },
};
