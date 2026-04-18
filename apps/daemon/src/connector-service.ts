/**
 * ConnectorService — wraps `ConnectorStorageAPI` (MCP connector registry +
 * typed OAuth-token storage) AND the legacy built-in-connector auth-entry
 * surface that lives under the `connector-auth:<providerKey>` prefix in the
 * secure-storage file. M3 repoints desktop's `connector-handlers.ts`,
 * `connector-auth-entry.ts`, and the MCP OAuth flow helpers onto these
 * routes.
 *
 * Milestone 2 of the daemon-only-SQLite migration
 * (plan: /Users/yanai/.claude/plans/squishy-exploring-hamster.md).
 *
 * Pass-through service — no events emitted. Desktop's connector UI today
 * re-reads on demand rather than subscribing to change events, so a
 * `connectors.changed` notification would be load-bearing for no caller.
 * If M3 wires a subscription surface, add it then.
 *
 * Two disjoint storage surfaces live here because desktop uses both:
 *
 *   1. Custom MCP connectors (the `mcp_connectors` DB table + typed
 *      `OAuthTokens` under the `connector-tokens:<id>` prefix). The first
 *      nine methods cover this surface.
 *   2. Built-in connectors (Slack, Jira, Lightdash, Datadog, monday, Notion,
 *      GitHub, Google) stored as full `StoredAuthEntry` blobs under the
 *      `connector-auth:<providerKey>` prefix. Each entry carries not just
 *      tokens but DCR `clientRegistration`, `serverUrl`, pending-auth PKCE
 *      `codeVerifier` + `oauthState`, and `lastOAuthValidatedAt`. The last
 *      three methods (`readAuthEntry` / `writeAuthEntry` / `deleteAuthEntry`)
 *      cover this surface — byte-identical to what desktop's legacy
 *      `connector-auth-entry.ts` helpers write today.
 */
import type { StorageAPI } from '@accomplish_ai/agent-core';
import type {
  ConnectorStatus,
  McpConnector,
  OAuthTokens,
  StoredAuthEntry,
} from '@accomplish_ai/agent-core';

/**
 * Desktop-side prefix for built-in connector auth entries in the
 * secure-storage file. MUST match the literal in desktop's legacy
 * `connector-auth-entry.ts` — a mismatch would orphan every existing
 * user's Slack / Jira / Lightdash / Datadog / monday / Notion / GitHub
 * session on upgrade. Do not change without a one-shot migration.
 */
const AUTH_ENTRY_PREFIX = 'connector-auth:';

function authEntryKey(connectorKey: string): string {
  return `${AUTH_ENTRY_PREFIX}${connectorKey}`;
}

export class ConnectorService {
  constructor(private readonly storage: StorageAPI) {}

  // ─── Custom MCP connector registry + typed OAuth tokens ─────────────────

  list(): McpConnector[] {
    return this.storage.getAllConnectors();
  }

  getEnabled(): McpConnector[] {
    return this.storage.getEnabledConnectors();
  }

  getById(id: string): McpConnector | null {
    return this.storage.getConnectorById(id);
  }

  upsert(connector: McpConnector): void {
    this.storage.upsertConnector(connector);
  }

  setEnabled(id: string, enabled: boolean): void {
    this.storage.setConnectorEnabled(id, enabled);
  }

  setStatus(id: string, status: ConnectorStatus): void {
    this.storage.setConnectorStatus(id, status);
  }

  delete(id: string): void {
    this.storage.deleteConnector(id);
  }

  storeTokens(connectorId: string, tokens: OAuthTokens): void {
    this.storage.storeConnectorTokens(connectorId, tokens);
  }

  getTokens(connectorId: string): OAuthTokens | null {
    return this.storage.getConnectorTokens(connectorId);
  }

  deleteTokens(connectorId: string): void {
    this.storage.deleteConnectorTokens(connectorId);
  }

  // ─── Built-in connector auth entries (connector-auth:<key> prefix) ─────
  //
  // Read/write/delete the full `StoredAuthEntry` blob used by Slack MCP,
  // Jira, Lightdash, Datadog, monday, Notion, GitHub, Google. Used by the
  // desktop OAuth flows (`mcp-oauth-strategies.ts`, `connector-token-resolver.ts`,
  // `slack-auth/`, `github-oauth-flow.ts`) to persist DCR registrations,
  // pending-auth PKCE state, server URLs, and the eventual tokens.
  //
  // Mirrors the exact behavior of desktop's legacy
  // `apps/desktop/src/main/connectors/connector-auth-entry.ts`:
  //
  //   - `readAuthEntry` returns `null` when the key is unset OR soft-deleted
  //     (written as empty string by `deleteAuthEntry`). JSON parse errors
  //     also yield `null` so a corrupt write doesn't brick the UI.
  //   - `deleteAuthEntry` writes an empty string rather than dropping the
  //     key. SecureStorage has no per-key delete; this is the existing
  //     desktop convention and we hold byte-compat for existing profiles.
  //
  // The parameter is the raw connector key (e.g. `slack`, `jira`) — NOT
  // the full prefixed key. The prefix is applied internally.

  readAuthEntry(connectorKey: string): StoredAuthEntry | null {
    const raw = this.storage.get(authEntryKey(connectorKey));
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw) as StoredAuthEntry;
    } catch {
      return null;
    }
  }

  writeAuthEntry(connectorKey: string, entry: StoredAuthEntry): void {
    this.storage.set(authEntryKey(connectorKey), JSON.stringify(entry));
  }

  deleteAuthEntry(connectorKey: string): void {
    // Soft delete (empty string) matches the existing desktop convention
    // and guarantees that a subsequent `readAuthEntry` returns `null`.
    this.storage.set(authEntryKey(connectorKey), '');
  }
}
