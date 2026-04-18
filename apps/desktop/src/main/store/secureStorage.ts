/**
 * SecureStorage RPC façade.
 *
 * Milestone 3 of the daemon-only-SQLite migration
 * (plan: /Users/yanai/.claude/plans/squishy-exploring-hamster.md).
 *
 * Before M3: this module held a local `StorageAPI` singleton constructed
 * via `createStorage()`, which wrote directly to `secure-storage.json`.
 * Both Electron main and the daemon touched the same file, which caused
 * the concurrent-writer hazard M2/M3 are meant to fix.
 *
 * After M3: every function here is a thin wrapper around a `secrets.*`
 * daemon RPC. Main no longer opens or writes the secure-storage file —
 * the daemon is the sole writer, and main talks to it over the socket.
 *
 * Signature changes vs. the pre-M3 module:
 *
 *   - `storeApiKey`, `getApiKey`, `deleteApiKey`, `getBedrockCredentials`,
 *     and `storeBedrockCredentials` are now **async**. The wire format is
 *     JSON-RPC over a Unix socket / named pipe; there is no synchronous
 *     way to reach the daemon's storage. Existing sync callers must be
 *     converted to `await`.
 *   - `getAllApiKeys` and `hasAnyApiKey` were already async — unchanged.
 *   - `clearSecureStorage` stays synchronous but is now a no-op: main
 *     holds no local secret state, so there is nothing to clear here.
 *     The CLEAN_START flow at app launch deletes userData before the
 *     daemon is spawned, which wipes the secure-storage file on disk;
 *     this function's sole historical purpose was in-memory singleton
 *     reset, which the RPC façade made obsolete.
 *
 * Startup ordering constraint: every `secrets.*` call routes through
 * `getDaemonClient()`, which throws until `bootstrapDaemon()` resolves.
 * `app-startup.ts` defers every early secret-reader (provider validation,
 * analytics launch-event enrichment) until after the bootstrap await.
 */
import { getDaemonClient } from '../daemon/daemon-lifecycle';
import type { ApiKeyProvider } from '@accomplish_ai/agent-core/desktop-main';

export type { ApiKeyProvider };

export async function storeApiKey(provider: string, apiKey: string): Promise<void> {
  await getDaemonClient().call('secrets.storeApiKey', { provider, apiKey });
}

export async function getApiKey(provider: string): Promise<string | null> {
  return getDaemonClient().call('secrets.getApiKey', { provider });
}

export async function deleteApiKey(provider: string): Promise<boolean> {
  return getDaemonClient().call('secrets.deleteApiKey', { provider });
}

export async function getAllApiKeys(): Promise<Record<string, string | null>> {
  return getDaemonClient().call('secrets.getAllApiKeys');
}

export async function getBedrockCredentials(): Promise<Record<string, string> | null> {
  return getDaemonClient().call('secrets.getBedrockCredentials');
}

export async function storeBedrockCredentials(credentials: string): Promise<void> {
  await getDaemonClient().call('secrets.storeBedrockCredentials', { credentials });
}

export async function hasAnyApiKey(): Promise<boolean> {
  return getDaemonClient().call('secrets.hasAnyApiKey');
}

/**
 * No-op since M3. The pre-M3 implementation reset an in-memory `StorageAPI`
 * singleton in main; main no longer owns that state. The only legitimate
 * caller (CLEAN_START at `index.ts`) runs BEFORE daemon spawn anyway —
 * reaching for the daemon here would fail. Keeping the export + sync
 * signature so existing CLEAN_START code doesn't need changes.
 */
export function clearSecureStorage(): void {
  // intentionally empty
}
