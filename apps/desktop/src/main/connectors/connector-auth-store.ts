/**
 * Connector Auth Store
 *
 * Per-provider OAuth token storage backed by SecureStorage (AES-256-GCM).
 * Replaces the commercial version's mcp-auth.json approach (research.md Decision 2).
 * Each connector gets one instance, keyed by provider ID.
 *
 * Storage key format: connector-auth:<providerKey>
 */

import type {
  OAuthTokens,
  OAuthClientRegistration,
  ConnectorAuthStoreConfig,
} from '@accomplish_ai/agent-core/common';
import type { StoredAuthEntry, ConnectorOAuthStatus } from './connector-auth-types';
import { readEntry, writeEntry, deleteEntry, resolveServerUrl } from './connector-auth-entry';

export type { ConnectorOAuthStatus };

export class ConnectorAuthStore {
  constructor(readonly config: ConnectorAuthStoreConfig) {}

  get callbackUrl(): string {
    const { host, port, path } = this.config.callback;
    return `http://${host}:${port}${path}`;
  }

  getOAuthStatus(): ConnectorOAuthStatus {
    const entry = readEntry(this.config);
    if (!entry) {
      return { connected: false, pendingAuthorization: false };
    }

    const connected = !!(entry.accessToken?.trim() || entry.refreshToken?.trim());

    const pendingAuthorization =
      !connected &&
      typeof entry.oauthState === 'string' &&
      entry.oauthState.trim().length > 0 &&
      typeof entry.codeVerifier === 'string' &&
      entry.codeVerifier.trim().length > 0;

    return {
      connected,
      pendingAuthorization,
      lastValidatedAt: entry.lastOAuthValidatedAt,
    };
  }

  getAccessToken(): string | undefined {
    const entry = readEntry(this.config);
    return entry?.accessToken?.trim() || undefined;
  }

  getServerUrl(): string | undefined {
    if (this.config.serverUrl) {
      return this.config.serverUrl;
    }
    if (!this.config.storesServerUrl) {
      return undefined;
    }
    const entry = readEntry(this.config);
    return entry?.serverUrl?.trim() || undefined;
  }

  setServerUrl(url: string): void {
    if (!this.config.storesServerUrl) {
      return;
    }
    const normalized = url.trim();
    const existing = readEntry(this.config) ?? {};
    const previousUrl = existing.serverUrl?.trim();

    // If URL changed, reset auth state but keep the new URL
    const next: StoredAuthEntry =
      previousUrl === normalized
        ? { ...existing, serverUrl: normalized }
        : { serverUrl: normalized };

    writeEntry(this.config, next);
  }

  getClientRegistration(): OAuthClientRegistration | undefined {
    if (!this.config.usesDcr) {
      return undefined;
    }
    const entry = readEntry(this.config);
    const reg = entry?.clientRegistration;
    return reg?.clientId ? reg : undefined;
  }

  setClientRegistration(reg: OAuthClientRegistration): void {
    if (!this.config.usesDcr) {
      return;
    }
    const existing = readEntry(this.config) ?? {};
    writeEntry(this.config, { ...existing, clientRegistration: reg });
  }

  setPendingAuth(params: { codeVerifier: string; oauthState: string }): void {
    const existing = readEntry(this.config) ?? {};
    const next: StoredAuthEntry = {
      codeVerifier: params.codeVerifier,
      oauthState: params.oauthState,
      serverUrl: resolveServerUrl(this.config, existing),
    };
    if (this.config.usesDcr && existing.clientRegistration) {
      next.clientRegistration = existing.clientRegistration;
    }
    writeEntry(this.config, next);
  }

  setTokens(tokens: OAuthTokens, lastValidatedAt?: number): void {
    const existing = readEntry(this.config) ?? {};
    const next: StoredAuthEntry = {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
      lastOAuthValidatedAt: lastValidatedAt ?? Date.now(),
      serverUrl: resolveServerUrl(this.config, existing),
    };
    if (this.config.usesDcr && existing.clientRegistration) {
      next.clientRegistration = existing.clientRegistration;
    }
    writeEntry(this.config, next);
  }

  setLastValidatedAt(timestamp: number): void {
    const existing = readEntry(this.config) ?? {};
    writeEntry(this.config, { ...existing, lastOAuthValidatedAt: timestamp });
  }

  /** Clear tokens but preserve client registration (DCR) and server URL (storesServerUrl) */
  clearTokens(): void {
    const existing = readEntry(this.config);
    if (!existing) {
      return;
    }
    const preserved: StoredAuthEntry = {};
    if (this.config.usesDcr && existing.clientRegistration) {
      preserved.clientRegistration = existing.clientRegistration;
    }
    if (this.config.storesServerUrl && existing.serverUrl) {
      preserved.serverUrl = existing.serverUrl;
    }
    if (Object.keys(preserved).length === 0) {
      deleteEntry(this.config);
    } else {
      writeEntry(this.config, preserved);
    }
  }

  /** Nuke the entire entry including DCR registration */
  clearAuth(): void {
    deleteEntry(this.config);
  }

  /** Get the stored refresh token (needed by token resolver for silent refresh) */
  getRefreshToken(): string | undefined {
    return readEntry(this.config)?.refreshToken;
  }

  /** Returns the stored token expiry timestamp (Unix ms), or undefined if not set. */
  getTokenExpiry(): number | undefined {
    return readEntry(this.config)?.expiresAt;
  }
}
