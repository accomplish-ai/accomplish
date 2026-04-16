/**
 * Shared types for connector OAuth storage.
 */

import type { OAuthClientRegistration } from '@accomplish_ai/agent-core/common';

export interface StoredAuthEntry {
  accessToken?: string;
  refreshToken?: string;
  /** Unix ms timestamp — stored in ms (unlike mcp-auth.json which stores seconds) */
  expiresAt?: number;
  /** Unix ms timestamp of last successful token validation */
  lastOAuthValidatedAt?: number;
  clientRegistration?: OAuthClientRegistration;
  serverUrl?: string;
  codeVerifier?: string;
  oauthState?: string;
}

export interface ConnectorOAuthStatus {
  connected: boolean;
  pendingAuthorization: boolean;
  lastValidatedAt?: number;
}
