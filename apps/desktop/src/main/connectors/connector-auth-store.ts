/**
 * Connector Auth Store
 *
 * Per-provider OAuth token storage backed by the daemon's encrypted
 * secure storage (AES-256-GCM). Each connector gets one instance, keyed
 * by provider ID. Storage key format on the wire: `<providerKey>`
 * (the daemon applies the `connector-auth:` prefix internally).
 *
 * Milestone 3 sub-chunk 3e of the daemon-only-SQLite migration
 * (plan: /Users/yanai/.claude/plans/squishy-exploring-hamster.md).
 *
 * Before 3e: every method was synchronous and read/wrote `StoredAuthEntry`
 * through the local `StorageAPI` wrapper, causing a concurrent-writer
 * hazard with the daemon's own secure-storage file.
 *
 * After 3e: every method is async and goes through
 * `connectors.authEntry.*` RPCs via `connector-auth-entry.ts`. Every
 * caller already runs inside an `async` OAuth flow (discover → register →
 * exchange → persist), so the only downstream change is inserting `await`
 * at each `store.*` call site.
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

  async getOAuthStatus(): Promise<ConnectorOAuthStatus> {
    const entry = await readEntry(this.config);
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

  async getAccessToken(): Promise<string | undefined> {
    const entry = await readEntry(this.config);
    return entry?.accessToken?.trim() || undefined;
  }

  async getServerUrl(): Promise<string | undefined> {
    if (this.config.serverUrl) {
      return this.config.serverUrl;
    }
    if (!this.config.storesServerUrl) {
      return undefined;
    }
    const entry = await readEntry(this.config);
    return entry?.serverUrl?.trim() || undefined;
  }

  async setServerUrl(url: string): Promise<void> {
    if (!this.config.storesServerUrl) {
      return;
    }
    const normalized = url.trim();
    const existing = (await readEntry(this.config)) ?? {};
    const previousUrl = existing.serverUrl?.trim();

    // If URL changed, reset auth state but keep the new URL
    const next: StoredAuthEntry =
      previousUrl === normalized
        ? { ...existing, serverUrl: normalized }
        : { serverUrl: normalized };

    await writeEntry(this.config, next);
  }

  async getClientRegistration(): Promise<OAuthClientRegistration | undefined> {
    if (!this.config.usesDcr) {
      return undefined;
    }
    const entry = await readEntry(this.config);
    const reg = entry?.clientRegistration;
    return reg?.clientId ? reg : undefined;
  }

  async setClientRegistration(reg: OAuthClientRegistration): Promise<void> {
    if (!this.config.usesDcr) {
      return;
    }
    const existing = (await readEntry(this.config)) ?? {};
    await writeEntry(this.config, { ...existing, clientRegistration: reg });
  }

  async setPendingAuth(params: { codeVerifier: string; oauthState: string }): Promise<void> {
    const existing = (await readEntry(this.config)) ?? {};
    const next: StoredAuthEntry = {
      codeVerifier: params.codeVerifier,
      oauthState: params.oauthState,
      serverUrl: resolveServerUrl(this.config, existing),
    };
    if (this.config.usesDcr && existing.clientRegistration) {
      next.clientRegistration = existing.clientRegistration;
    }
    await writeEntry(this.config, next);
  }

  async setTokens(tokens: OAuthTokens, lastValidatedAt?: number): Promise<void> {
    const existing = (await readEntry(this.config)) ?? {};
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
    await writeEntry(this.config, next);
  }

  async setLastValidatedAt(timestamp: number): Promise<void> {
    const existing = (await readEntry(this.config)) ?? {};
    await writeEntry(this.config, { ...existing, lastOAuthValidatedAt: timestamp });
  }

  /** Clear tokens but preserve client registration (DCR) and server URL (storesServerUrl) */
  async clearTokens(): Promise<void> {
    const existing = await readEntry(this.config);
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
      await deleteEntry(this.config);
    } else {
      await writeEntry(this.config, preserved);
    }
  }

  /** Nuke the entire entry including DCR registration */
  async clearAuth(): Promise<void> {
    await deleteEntry(this.config);
  }

  /** Get the stored refresh token (needed by token resolver for silent refresh) */
  async getRefreshToken(): Promise<string | undefined> {
    return (await readEntry(this.config))?.refreshToken;
  }

  /** Returns the stored token expiry timestamp (Unix ms), or undefined if not set. */
  async getTokenExpiry(): Promise<number | undefined> {
    return (await readEntry(this.config))?.expiresAt;
  }
}
