/**
 * Connector Token Resolver
 *
 * Dispatches the correct OAuth strategy for each built-in connector (ADR-F002).
 * Uses a discriminated union switch with assertNever for compile-time exhaustiveness.
 *
 * Strategies:
 *   mcp-dcr          — Dynamic Client Registration + PKCE (Jira, Notion, monday.com, Lightdash, Datadog)
 *   mcp-fixed-client — Pre-registered client + PKCE (Slack)
 *   desktop-google   — Delegate to existing Google OAuth handler
 *   desktop-github   — gh CLI: `gh auth token`, fallback to `gh auth login`
 */

import { discoverOAuthMetadata, refreshAccessToken } from '@accomplish_ai/agent-core';
import type { OAuthProviderId, ConnectorDesktopOAuthKind } from '@accomplish_ai/agent-core/common';
import { getConnectorDefinition } from '@accomplish_ai/agent-core/common';
import { ConnectorAuthStore } from './connector-auth-store';
import { getConnectorAuthStore } from './connector-auth-registry';
import { performMcpDcrFlow, performMcpFixedClientFlow } from './mcp-oauth-strategies';
import { performDesktopGoogleFlow, performDesktopGithubFlow } from './github-oauth-flow';

export type ConnectorOAuthResult =
  | { ok: true; accessToken: string }
  | {
      ok: false;
      error: 'gh-not-found' | 'oauth-failed' | 'no-server-url' | 'not-configured';
      message?: string;
    };

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Connect a built-in connector: runs the appropriate OAuth strategy.
 * Returns an access token on success.
 */
export async function connectBuiltInConnector(
  providerId: OAuthProviderId,
): Promise<ConnectorOAuthResult> {
  const def = getConnectorDefinition(providerId);
  if (!def) {
    return {
      ok: false,
      error: 'not-configured',
      message: `No connector definition for ${providerId}`,
    };
  }

  const kind = def.desktopOAuth.kind as ConnectorDesktopOAuthKind;

  switch (kind) {
    case 'mcp-dcr':
      return performMcpDcrFlow(providerId, def);
    case 'mcp-fixed-client':
      return performMcpFixedClientFlow(providerId);
    case 'desktop-google':
      return performDesktopGoogleFlow(providerId);
    case 'desktop-github':
      return performDesktopGithubFlow(providerId);
    default:
      return assertNever(kind);
  }
}

/**
 * Resolve a valid access token for an already-connected connector.
 * Auto-refreshes if expired. Returns undefined if not connected.
 */
export async function resolveMcpConnectorAccessToken(
  providerId: OAuthProviderId,
): Promise<string | undefined> {
  const store = getConnectorAuthStore(providerId);
  if (!store) {
    return undefined;
  }

  const accessToken = store.getAccessToken();
  if (!accessToken) {
    return undefined;
  }

  // Try silent token refresh if expired
  const expiry = store.getTokenExpiry();
  if (expiry && Date.now() >= expiry - 5 * 60 * 1000) {
    const refreshed = await tryRefreshToken(store);
    if (refreshed) {
      return refreshed;
    }
    // Refresh failed — return the potentially stale token; let the call fail naturally
  }

  return accessToken;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function tryRefreshToken(store: ConnectorAuthStore): Promise<string | undefined> {
  const serverUrl = store.getServerUrl();
  const clientReg = store.getClientRegistration();
  const refreshToken = store.getRefreshToken();

  if (!serverUrl || !clientReg?.clientId || !refreshToken) {
    return undefined;
  }

  try {
    const metadata = await discoverOAuthMetadata(serverUrl);
    const refreshed = await refreshAccessToken({
      tokenEndpoint: metadata.tokenEndpoint,
      refreshToken,
      clientId: clientReg.clientId,
      clientSecret: clientReg.clientSecret,
    });
    store.setTokens(refreshed, Date.now());
    return refreshed.accessToken;
  } catch {
    return undefined;
  }
}

// TypeScript exhaustiveness guard
function assertNever(value: never): never {
  throw new Error(`Unhandled OAuth kind: ${String(value)}`);
}
