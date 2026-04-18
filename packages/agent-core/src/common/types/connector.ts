export enum OAuthProviderId {
  Slack = 'slack',
  Google = 'google',
  Jira = 'jira',
  GitHub = 'github',
  Monday = 'monday',
  Notion = 'notion',
  Lightdash = 'lightdash',
  Datadog = 'datadog',
}

export function isOAuthProviderId(value: string): value is OAuthProviderId {
  return Object.values(OAuthProviderId).includes(value as OAuthProviderId);
}

export function getOAuthProviderDisplayName(providerId: OAuthProviderId): string {
  switch (providerId) {
    case OAuthProviderId.Slack:
      return 'Slack';
    case OAuthProviderId.Google:
      return 'Google Drive';
    case OAuthProviderId.Jira:
      return 'Jira';
    case OAuthProviderId.GitHub:
      return 'GitHub';
    case OAuthProviderId.Monday:
      return 'monday.com';
    case OAuthProviderId.Notion:
      return 'Notion';
    case OAuthProviderId.Lightdash:
      return 'Lightdash';
    case OAuthProviderId.Datadog:
      return 'Datadog';
  }
}

export type ConnectorStatus = 'connected' | 'disconnected' | 'error' | 'connecting';

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  tokenType: string;
  expiresAt?: number; // unix timestamp ms
  scope?: string;
}

export interface OAuthMetadata {
  issuer?: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  registrationEndpoint?: string;
  /** Introspection endpoint for token validation (ADR-F004) */
  introspectionEndpoint?: string;
  scopesSupported?: string[];
}

export interface OAuthClientRegistration {
  clientId: string;
  clientSecret?: string;
  /** Resource server URI for DCR flows (ADR-F004) */
  resourceServer?: string;
  /** MCP resource URI for DCR flows (ADR-F004) */
  mcp_resource_uri?: string;
}

export interface McpConnector {
  id: string;
  name: string;
  url: string;
  status: ConnectorStatus;
  isEnabled: boolean;
  oauthMetadata?: OAuthMetadata;
  clientRegistration?: OAuthClientRegistration;
  lastConnectedAt?: string;
  /** Unix ms timestamp of when the OAuth token was last confirmed valid (ADR-F004) */
  lastOAuthValidatedAt?: number;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Built-in connector registry types (ADR-F001, ADR-F002)
// ---------------------------------------------------------------------------

/** OAuth strategy discriminant for built-in connectors (ADR-F002) */
export type ConnectorDesktopOAuthKind =
  | 'mcp-dcr'
  | 'mcp-fixed-client'
  | 'desktop-google'
  | 'desktop-github';

export interface ConnectorCallbackBinding {
  readonly host: string;
  readonly port: number;
  readonly path: string;
}

export interface ConnectorAuthStoreConfig {
  readonly key: string;
  readonly serverUrl?: string;
  readonly usesDcr: boolean;
  readonly storesServerUrl: boolean;
  readonly callback: ConnectorCallbackBinding;
}

/**
 * On-disk shape of a built-in connector's OAuth state, stored under the
 * `connector-auth:<key>` prefix in the secure-storage file. Holds the full
 * OAuth journey — PKCE verifier + state for in-flight authorizations, DCR
 * client registration for MCP-DCR flows, serverUrl for connectors that
 * support custom endpoints, plus the eventual tokens — so a single read
 * can resume or validate a session.
 *
 * Distinct from `OAuthTokens` (stored via `ConnectorStorageAPI.storeConnectorTokens`
 * under the `connector-tokens:<id>` prefix, used for the custom MCP connector
 * table). Milestone 2 of the daemon-only-SQLite migration moved this shape
 * into agent-core so the daemon's `connectors.authEntry.*` RPCs and the
 * desktop consumers share one definition.
 */
export interface StoredAuthEntry {
  accessToken?: string;
  refreshToken?: string;
  /** Unix ms timestamp — stored in ms (unlike mcp-auth.json which stores seconds). */
  expiresAt?: number;
  /** Unix ms timestamp of last successful token validation. */
  lastOAuthValidatedAt?: number;
  clientRegistration?: OAuthClientRegistration;
  serverUrl?: string;
  codeVerifier?: string;
  oauthState?: string;
}

interface ConnectorDesktopOAuthBase {
  readonly kind: ConnectorDesktopOAuthKind;
}

export interface ConnectorMcpDcrOAuthDefinition extends ConnectorDesktopOAuthBase {
  readonly kind: 'mcp-dcr';
  readonly store: ConnectorAuthStoreConfig;
  readonly discoveryError: string;
  readonly registrationError: string;
  readonly tokenExchangeError: string;
  readonly extraAuthParams?: Record<string, string>;
}

export interface ConnectorMcpFixedClientOAuthDefinition extends ConnectorDesktopOAuthBase {
  readonly kind: 'mcp-fixed-client';
  readonly store: ConnectorAuthStoreConfig;
  readonly clientId: string;
  readonly discoveryError: string;
  readonly tokenExchangeError: string;
}

export interface ConnectorCustomOAuthDefinition extends ConnectorDesktopOAuthBase {
  readonly kind: 'desktop-google' | 'desktop-github';
}

export type ConnectorDesktopOAuthDefinition =
  | ConnectorMcpDcrOAuthDefinition
  | ConnectorMcpFixedClientOAuthDefinition
  | ConnectorCustomOAuthDefinition;

/** Centralized connector metadata (ADR-F001) */
export interface ConnectorDefinition {
  /** Must match an OAuthProviderId value */
  readonly id: OAuthProviderId;
  /** Brand name — not translated (proper noun) */
  readonly displayName: string;
  /** @-mention reference prompt injected into agent context */
  readonly referencePrompt?: string;
  /** Desktop OAuth/runtime strategy */
  readonly desktopOAuth: ConnectorDesktopOAuthDefinition;
}

/** Auth status for a single built-in connector */
export interface ConnectorAuthStatus {
  readonly providerId: OAuthProviderId;
  readonly connected: boolean;
  readonly pendingAuthorization: boolean;
  readonly lastValidatedAt?: number;
}
