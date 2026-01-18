// apps/desktop/src/main/store/migrations/v003-openai-base-url.ts

import type { Database } from 'better-sqlite3';
import type { Migration } from './index';

/**
 * Migration v003: Add OpenAI base URL column
 *
 * Adds optional OpenAI base URL override for OpenAI-compatible endpoints.
 */
export const migration: Migration = {
  version: 3,
  up(db: Database): void {
    db.exec(`
      ALTER TABLE app_settings ADD COLUMN openai_base_url TEXT DEFAULT ''
    `);
  },
};
