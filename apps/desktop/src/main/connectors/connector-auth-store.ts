/**
 * Connector Auth Store
 *
 * Per-provider OAuth token storage backed by SecureStorage (AES-256-GCM).
 * Replaces the commercial version's mcp-auth.json approach (research.md Decision 2).
 * Each connector gets one instance, keyed by provider ID.
 *
 * Storage key format: connector-auth:<providerKey>
 * Stored shape: { accessToken?, refreshToken?, expiresAt?, lastOAuthValidatedAt?,
 *                 clientRegistration?, serverUrl?, codeVerifier?, oauthState? }
 */

import type {
  OAuthTokens,
  OAuthClientRegistration,
  ConnectorAuthStoreConfig,
} from '@accomplish_ai/agent-core/common';
import { getStorage } from '../store/storage';

const STORE_KEY_PREFIX = 'connector-auth:';

interface StoredAuthEntry {
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

export class ConnectorAuthStore {
  constructor(readonly config: ConnectorAuthStoreConfig) {}

  get callbackUrl(): string {
    const { host, port, path } = this.config.callback;
    return `http://${host}:${port}${path}`;
  }

  getOAuthStatus(): ConnectorOAuthStatus {
    const entry = this.readEntry();
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
    const entry = this.readEntry();
    return entry?.accessToken?.trim() || undefined;
  }

  getServerUrl(): string | undefined {
    if (this.config.serverUrl) {
      return this.config.serverUrl;
    }
    if (!this.config.storesServerUrl) {
      return undefined;
    }
    const entry = this.readEntry();
    return entry?.serverUrl?.trim() || undefined;
  }

  setServerUrl(url: string): void {
    if (!this.config.storesServerUrl) {
      return;
    }
    const normalized = url.trim();
    const existing = this.readEntry() ?? {};
    const previousUrl = existing.serverUrl?.trim();

    // If URL changed, reset auth state but keep the new URL
    const next: StoredAuthEntry =
      previousUrl === normalized
        ? { ...existing, serverUrl: normalized }
        : { serverUrl: normalized };

    this.writeEntry(next);
  }

  getClientRegistration(): OAuthClientRegistration | undefined {
    if (!this.config.usesDcr) {
      return undefined;
    }
    const entry = this.readEntry();
    const reg = entry?.clientRegistration;
    return reg?.clientId ? reg : undefined;
  }

  setClientRegistration(reg: OAuthClientRegistration): void {
    const existing = this.readEntry() ?? {};
    this.writeEntry({ ...existing, clientRegistration: reg });
  }

  setPendingAuth(params: { codeVerifier: string; oauthState: string }): void {
    const existing = this.readEntry() ?? {};
    const next: StoredAuthEntry = {
      codeVerifier: params.codeVerifier,
      oauthState: params.oauthState,
      serverUrl: this.resolveServerUrl(existing),
    };
    if (this.config.usesDcr && existing.clientRegistration) {
      next.clientRegistration = existing.clientRegistration;
    }
    this.writeEntry(next);
  }

  setTokens(tokens: OAuthTokens, lastValidatedAt?: number): void {
    const existing = this.readEntry() ?? {};
    const next: StoredAuthEntry = {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
      lastOAuthValidatedAt: lastValidatedAt ?? Date.now(),
      serverUrl: this.resolveServerUrl(existing),
    };
    if (this.config.usesDcr && existing.clientRegistration) {
      next.clientRegistration = existing.clientRegistration;
    }
    this.writeEntry(next);
  }

  setLastValidatedAt(timestamp: number): void {
    const existing = this.readEntry() ?? {};
    this.writeEntry({ ...existing, lastOAuthValidatedAt: timestamp });
  }

  /** Clear tokens but preserve client registration (DCR) and server URL (storesServerUrl) */
  clearTokens(): void {
    const existing = this.readEntry();
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
      this.deleteEntry();
    } else {
      this.writeEntry(preserved);
    }
  }

  /** Nuke the entire entry including DCR registration */
  clearAuth(): void {
    this.deleteEntry();
  }

  /** Get the stored refresh token (needed by token resolver for silent refresh) */
  getRefreshToken(): string | undefined {
    return this.readEntry()?.refreshToken;
  }

  /** Returns the stored token expiry timestamp (Unix ms), or undefined if not set. */
  getTokenExpiry(): number | undefined {
    return this.readEntry()?.expiresAt;
  }

  private readEntry(): StoredAuthEntry | undefined {
    const storage = getStorage();
    const raw = storage.get(`${STORE_KEY_PREFIX}${this.config.key}`);
    if (!raw) {
      return undefined;
    }
    try {
      return JSON.parse(raw) as StoredAuthEntry;
    } catch {
      return undefined;
    }
  }

  private writeEntry(entry: StoredAuthEntry): void {
    const storage = getStorage();
    storage.set(`${STORE_KEY_PREFIX}${this.config.key}`, JSON.stringify(entry));
  }

  private deleteEntry(): void {
    const storage = getStorage();
    storage.set(`${STORE_KEY_PREFIX}${this.config.key}`, '');
  }

  private resolveServerUrl(existing: StoredAuthEntry): string | undefined {
    if (this.config.serverUrl) {
      return this.config.serverUrl;
    }
    if (this.config.storesServerUrl && existing.serverUrl) {
      return existing.serverUrl;
    }
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Connector auth store singletons (one per provider)
// ---------------------------------------------------------------------------

import { getConnectorDefinitions } from '@accomplish_ai/agent-core/common';
import type {
  ConnectorMcpDcrOAuthDefinition,
  ConnectorMcpFixedClientOAuthDefinition,
} from '@accomplish_ai/agent-core/common';
import type { OAuthProviderId } from '@accomplish_ai/agent-core/common';

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
