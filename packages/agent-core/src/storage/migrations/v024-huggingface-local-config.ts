import type { Database } from 'better-sqlite3';
import type { Migration } from './index.js';

/**
 * Migration v024: Add missing huggingface_local_config column.
 *
 * Migration v019 was incorrectly implemented as a no-op, claiming the column
 * had already been added in v010. In reality v010 only added sandbox_config.
 * This migration adds the column for databases that ran v019 without it.
 * A guard check is used because fresh installs may eventually include this
 * column from a corrected v019 or future schema change.
 */
export const migration: Migration = {
  version: 24,
  up: (db: Database) => {
    const columns = db.pragma('table_info(app_settings)') as Array<{ name: string }>;
    const exists = columns.some((col) => col.name === 'huggingface_local_config');
    if (!exists) {
      db.exec('ALTER TABLE app_settings ADD COLUMN huggingface_local_config TEXT');
    }
  },
};
