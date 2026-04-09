import type { Database } from 'better-sqlite3';
import type { Migration } from './index.js';

/**
 * Adds the `language` column to `app_settings`.
 *
 * Stores the user's UI language preference so the agent can communicate
 * in the same language the user has selected in Settings.
 * The column defaults to `'auto'`, which lets the model respond in English
 * unless the user explicitly chooses a language.
 */
export const migration: Migration = {
  version: 26,
  up: (db: Database) => {
    db.exec(`ALTER TABLE app_settings ADD COLUMN language TEXT NOT NULL DEFAULT 'auto'`);
  },
};
