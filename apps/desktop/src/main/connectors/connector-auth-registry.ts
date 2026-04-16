/**
 * Connector Auth Registry
 *
 * Singleton map of ConnectorAuthStore instances — one per provider that uses
 * an MCP OAuth flow (mcp-dcr or mcp-fixed-client), plus a synthetic entry for
 * desktop-github so the gh CLI token can be persisted across restarts.
 */

import { getConnectorDefinitions, OAuthProviderId } from '@accomplish_ai/agent-core/common';
import type {
  ConnectorMcpDcrOAuthDefinition,
  ConnectorMcpFixedClientOAuthDefinition,
} from '@accomplish_ai/agent-core/common';
import { ConnectorAuthStore } from './connector-auth-store';

function hasStore(oauth: {
  kind: string;
}): oauth is ConnectorMcpDcrOAuthDefinition | ConnectorMcpFixedClientOAuthDefinition {
  return oauth.kind === 'mcp-dcr' || oauth.kind === 'mcp-fixed-client';
}

const authStoreMap = new Map<OAuthProviderId, ConnectorAuthStore>();

for (const def of getConnectorDefinitions()) {
  if (hasStore(def.desktopOAuth)) {
    authStoreMap.set(def.id, new ConnectorAuthStore(def.desktopOAuth.store));
  }
}

// GitHub uses the gh CLI for auth (no MCP OAuth), so no store config exists on
// the connector definition. Add a synthetic store so the token retrieved via
// `gh auth token` can be persisted to SecureStorage and survives restarts.
authStoreMap.set(
  OAuthProviderId.GitHub,
  new ConnectorAuthStore({
    key: 'github',
    usesDcr: false,
    storesServerUrl: false,
    // Callback fields are never used for the gh CLI flow; use dummy values.
    callback: { host: '127.0.0.1', port: 0, path: '/' },
  }),
);

export function getConnectorAuthStore(id: OAuthProviderId): ConnectorAuthStore | undefined {
  return authStoreMap.get(id);
}

export function getAllConnectorAuthStores(): ReadonlyMap<OAuthProviderId, ConnectorAuthStore> {
  return authStoreMap;
}
