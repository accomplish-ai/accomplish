import type { Database } from 'better-sqlite3';
import type { Migration } from './index.js';

/**
 * Migration v019: HuggingFace Local provider support.
 *
 * No schema changes needed — the huggingface_local_config column was already
 * added by v010-huggingface-local.ts. This migration is a no-op placeholder
 * to maintain version ordering.
 */
export const migration: Migration = {
  version: 19,
  up: (_db: Database) => {
    // No-op: huggingface_local_config column was already added in v010.
  },
};
