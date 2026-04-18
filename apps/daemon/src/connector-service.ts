/**
 * ConnectorService — wraps `ConnectorStorageAPI` (MCP connector registry +
 * typed OAuth-token storage) so M3 can repoint desktop's `connector-handlers.ts`
 * and `connector-auth-entry.ts` off the direct `getStorage()` path.
 *
 * Milestone 2 of the daemon-only-SQLite migration
 * (plan: /Users/yanai/.claude/plans/squishy-exploring-hamster.md).
 *
 * Pass-through service — no events emitted. Desktop's connector UI today
 * re-reads on demand rather than subscribing to change events, so a
 * `connectors.changed` notification would be load-bearing for no caller.
 * If M3 wires a subscription surface, add it then.
 *
 * NOTE on token storage: the typed `ConnectorStorageAPI.storeConnectorTokens`
 * encrypts via SecureStorage under a per-connector key. The existing
 * desktop `connector-auth-entry.ts` writes to the same SecureStorage file
 * but under a `connector-auth:<key>` prefix — M3 decides whether to migrate
 * existing keys to the typed API's key space or keep a parallel path.
 */
import type { StorageAPI } from '@accomplish_ai/agent-core';
import type { ConnectorStatus, McpConnector, OAuthTokens } from '@accomplish_ai/agent-core';

export class ConnectorService {
  constructor(private readonly storage: StorageAPI) {}

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
}
