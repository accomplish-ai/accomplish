/**
 * Connector Auth Registry
 *
 * Singleton map of ConnectorAuthStore instances — one per provider that uses
 * an MCP OAuth flow (mcp-dcr or mcp-fixed-client). Providers that use a
 * custom flow (GitHub, Google) have no entry here.
 */

import { getConnectorDefinitions } from '@accomplish_ai/agent-core/common';
import type {
  OAuthProviderId,
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

export function getConnectorAuthStore(id: OAuthProviderId): ConnectorAuthStore | undefined {
  return authStoreMap.get(id);
}

export function getAllConnectorAuthStores(): ReadonlyMap<OAuthProviderId, ConnectorAuthStore> {
  return authStoreMap;
}
