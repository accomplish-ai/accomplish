import type { Database } from 'better-sqlite3';
import type { Migration } from './index.js';

export const migration: Migration = {
    version: 9,
    up: (db: Database) => {
        // Add cloud_browser_config column to app_settings table
        // Stores JSON configuration for cloud browser providers (Browserbase, etc.)
        db.prepare('ALTER TABLE app_settings ADD COLUMN cloud_browser_config TEXT DEFAULT NULL').run();
    },
};
