import type { Database } from 'better-sqlite3';
import type { Migration } from './index.js';

/**
 * Migration v018: Add GitHub Copilot provider support.
 *
 * No schema changes needed — Copilot credentials are stored in OpenCode's
 * auth.json (via getCopilotOAuthStatus / setCopilotOAuthTokens) and provider
 * state is stored in the existing provider_settings JSON blob.
 * This migration is a no-op placeholder to maintain version ordering.
 */
export const migration: Migration = {
  version: 18,
  up: (_db: Database) => {
    // No DDL changes needed for copilot provider.
    // Provider state is persisted as JSON inside the existing provider_settings column.
    // OAuth tokens are stored in ~/.local/share/opencode/auth.json by the copilot auth module.
  },
};
