/**
 * Migration v020 — add messaging_config column to app_settings
 *
 * Stores per-platform messaging integration configuration (WhatsApp, Slack, etc.)
 * as a JSON blob. Introduced by ENG-684.
 */
import type { Database } from 'better-sqlite3';
import type { Migration } from './index.js';

export const migration: Migration = {
  version: 20,
  up: (db: Database) => {
    // Add messaging_config column to store WhatsApp/Slack/etc integration settings (ENG-684)
    const columns = db.prepare(`PRAGMA table_info(app_settings)`).all() as Array<{
      name: string;
    }>;
    const hasMessagingConfig = columns.some((column) => {
      return column.name === 'messaging_config';
    });
    if (!hasMessagingConfig) {
      db.exec(`ALTER TABLE app_settings ADD COLUMN messaging_config TEXT DEFAULT NULL`);
    }
  },
};
