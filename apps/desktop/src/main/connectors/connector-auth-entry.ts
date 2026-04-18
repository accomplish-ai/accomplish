/**
 * SecureStorage helpers for connector OAuth entries — now async RPC façades.
 *
 * Milestone 3 sub-chunk 3e of the daemon-only-SQLite migration
 * (plan: /Users/yanai/.claude/plans/squishy-exploring-hamster.md).
 *
 * Before 3e: these functions called `getStorage().get()` / `getStorage().set()`
 * directly, which touched the local `StorageAPI`'s wrapper around
 * `secure-storage.json`. That meant both Electron main and the daemon wrote
 * to the same file — a concurrent-writer hazard.
 *
 * After 3e: the daemon is the sole writer via `connectors.authEntry.*`
 * RPCs. Main has no local storage singleton to touch. The wire payload
 * carries the full `StoredAuthEntry` blob (tokens, DCR clientRegistration,
 * serverUrl, pending-auth PKCE state, lastOAuthValidatedAt).
 *
 * All three accessors are now async. `ConnectorAuthStore` (the thin class
 * built on top) was converted to async in the same pass.
 */
import type { ConnectorAuthStoreConfig } from '@accomplish_ai/agent-core/common';
import { getDaemonClient } from '../daemon-bootstrap';
import type { StoredAuthEntry } from './connector-auth-types';

export async function readEntry(
  config: ConnectorAuthStoreConfig,
): Promise<StoredAuthEntry | undefined> {
  const entry = await getDaemonClient().call('connectors.authEntry.read', {
    connectorKey: config.key,
  });
  return entry ?? undefined;
}

export async function writeEntry(
  config: ConnectorAuthStoreConfig,
  entry: StoredAuthEntry,
): Promise<void> {
  await getDaemonClient().call('connectors.authEntry.write', {
    connectorKey: config.key,
    entry,
  });
}

export async function deleteEntry(config: ConnectorAuthStoreConfig): Promise<void> {
  await getDaemonClient().call('connectors.authEntry.delete', {
    connectorKey: config.key,
  });
}

/**
 * Pure helper — no storage, no RPC. Picks between the static config URL and
 * the dynamic entry URL based on `storesServerUrl`. Kept sync because every
 * caller has already awaited `readEntry()`.
 */
export function resolveServerUrl(
  config: ConnectorAuthStoreConfig,
  existing: StoredAuthEntry,
): string | undefined {
  if (config.serverUrl) {
    return config.serverUrl;
  }
  if (config.storesServerUrl && existing.serverUrl) {
    return existing.serverUrl;
  }
  return undefined;
}
