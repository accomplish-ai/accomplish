/**
 * Shared types for connector OAuth storage.
 *
 * `StoredAuthEntry` is re-exported from agent-core so desktop and the daemon
 * share one canonical definition. The previous inline copy sat out of sync
 * with the daemon's view until Milestone 2 of the daemon-only-SQLite
 * migration unified them; this file now exists purely for backward-compat
 * imports that still say `from './connector-auth-types'`.
 */

export type { StoredAuthEntry } from '@accomplish_ai/agent-core/desktop-main';

export interface ConnectorOAuthStatus {
  connected: boolean;
  pendingAuthorization: boolean;
  lastValidatedAt?: number;
}
