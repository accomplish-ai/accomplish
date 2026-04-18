/**
 * Unit tests for ConnectorAuthStore
 *
 * Milestone 3 sub-chunk 3e of the daemon-only-SQLite migration converted
 * ConnectorAuthStore's methods to async daemon RPCs. These tests now
 * assert against the `connectors.authEntry.*` RPC surface on
 * `getDaemonClient().call(...)` rather than `getStorage()` directly.
 *
 * Validates:
 * - Tokens stored and read correctly
 * - Optional lastOAuthValidatedAt handled when absent
 * - clearTokens() retains serverUrl (for Lightdash/Datadog)
 * - clearTokens() retains clientRegistration (for DCR providers)
 * - clearAuth() removes everything
 * - getOAuthStatus() reflects connected/disconnected/pending state
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConnectorAuthStore } from '@main/connectors/connector-auth-store';
import type { ConnectorAuthStoreConfig } from '@accomplish_ai/agent-core/common';
import type { StoredAuthEntry } from '@main/connectors/connector-auth-types';

// Shared in-memory state for the daemon-mock. Each test resets it in beforeEach.
let mockEntryStore: Record<string, StoredAuthEntry | null> = {};
const mockDaemonCall = vi.fn(async (method: string, params?: unknown) => {
  if (method === 'connectors.authEntry.read') {
    const p = params as { connectorKey: string };
    return mockEntryStore[p.connectorKey] ?? null;
  }
  if (method === 'connectors.authEntry.write') {
    const p = params as { connectorKey: string; entry: StoredAuthEntry };
    mockEntryStore[p.connectorKey] = p.entry;
    return;
  }
  if (method === 'connectors.authEntry.delete') {
    const p = params as { connectorKey: string };
    delete mockEntryStore[p.connectorKey];
    return;
  }
  return undefined;
});

vi.mock('@main/daemon-bootstrap', () => ({
  getDaemonClient: () => ({ call: mockDaemonCall }),
}));

function makeConfig(overrides: Partial<ConnectorAuthStoreConfig> = {}): ConnectorAuthStoreConfig {
  return {
    key: 'test-provider',
    serverUrl: 'https://mcp.example.com/mcp',
    usesDcr: true,
    storesServerUrl: false,
    callback: { host: '127.0.0.1', port: 3120, path: '/callback' },
    ...overrides,
  };
}

function makeStore(overrides: Partial<ConnectorAuthStoreConfig> = {}): ConnectorAuthStore {
  return new ConnectorAuthStore(makeConfig(overrides));
}

describe('ConnectorAuthStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEntryStore = {};
  });

  describe('getOAuthStatus()', () => {
    it('returns disconnected when no entry', async () => {
      const store = makeStore();
      expect(await store.getOAuthStatus()).toEqual({
        connected: false,
        pendingAuthorization: false,
      });
    });

    it('returns connected when accessToken present', async () => {
      mockEntryStore['test-provider'] = { accessToken: 'tok123', lastOAuthValidatedAt: 1000 };
      const store = makeStore();
      const status = await store.getOAuthStatus();
      expect(status.connected).toBe(true);
      expect(status.lastValidatedAt).toBe(1000);
    });

    it('returns connected when only refreshToken present', async () => {
      mockEntryStore['test-provider'] = { refreshToken: 'refresh123' };
      const store = makeStore();
      expect((await store.getOAuthStatus()).connected).toBe(true);
    });

    it('returns pendingAuthorization when oauthState + codeVerifier present but no token', async () => {
      mockEntryStore['test-provider'] = { oauthState: 'state-abc', codeVerifier: 'verifier-xyz' };
      const store = makeStore();
      const status = await store.getOAuthStatus();
      expect(status.connected).toBe(false);
      expect(status.pendingAuthorization).toBe(true);
    });

    it('handles missing lastOAuthValidatedAt gracefully', async () => {
      mockEntryStore['test-provider'] = { accessToken: 'tok' };
      const store = makeStore();
      const status = await store.getOAuthStatus();
      expect(status.connected).toBe(true);
      expect(status.lastValidatedAt).toBeUndefined();
    });
  });

  describe('setTokens()', () => {
    it('stores tokens and sets lastOAuthValidatedAt', async () => {
      const store = makeStore();
      const ts = Date.now();
      await store.setTokens(
        { accessToken: 'tok', tokenType: 'bearer', expiresAt: ts + 3600_000 },
        ts,
      );

      expect(mockDaemonCall).toHaveBeenCalledWith(
        'connectors.authEntry.write',
        expect.objectContaining({
          connectorKey: 'test-provider',
          entry: expect.objectContaining({ accessToken: 'tok', lastOAuthValidatedAt: ts }),
        }),
      );
    });

    it('sets lastOAuthValidatedAt to Date.now() when not provided', async () => {
      const store = makeStore();
      const before = Date.now();
      await store.setTokens({ accessToken: 'tok', tokenType: 'bearer' });
      const after = Date.now();
      const writtenEntry = mockEntryStore['test-provider']!;
      expect(writtenEntry.lastOAuthValidatedAt).toBeGreaterThanOrEqual(before);
      expect(writtenEntry.lastOAuthValidatedAt).toBeLessThanOrEqual(after);
    });
  });

  describe('clearTokens()', () => {
    it('removes tokens but retains clientRegistration when usesDcr', async () => {
      const reg = { clientId: 'client-id', clientSecret: 'secret' };
      mockEntryStore['test-provider'] = { accessToken: 'tok', clientRegistration: reg };
      const store = makeStore({ usesDcr: true });
      await store.clearTokens();
      const written = mockEntryStore['test-provider']!;
      expect(written.accessToken).toBeUndefined();
      expect(written.clientRegistration).toEqual(reg);
    });

    it('retains serverUrl when storesServerUrl is true', async () => {
      mockEntryStore['test-provider'] = {
        accessToken: 'tok',
        serverUrl: 'https://lightdash.example.com/api/v1/mcp',
      };
      const store = makeStore({ storesServerUrl: true, serverUrl: undefined });
      await store.clearTokens();
      const written = mockEntryStore['test-provider']!;
      expect(written.accessToken).toBeUndefined();
      expect(written.serverUrl).toBe('https://lightdash.example.com/api/v1/mcp');
    });

    it('deletes entry entirely when nothing to preserve', async () => {
      mockEntryStore['test-provider'] = { accessToken: 'tok' };
      const store = makeStore({ usesDcr: false, storesServerUrl: false });
      await store.clearTokens();
      expect(mockDaemonCall).toHaveBeenCalledWith('connectors.authEntry.delete', {
        connectorKey: 'test-provider',
      });
      expect(mockEntryStore['test-provider']).toBeUndefined();
    });

    it('does nothing when entry is absent', async () => {
      const store = makeStore();
      await store.clearTokens();
      expect(mockDaemonCall).toHaveBeenCalledTimes(1); // read only
      expect(mockDaemonCall).not.toHaveBeenCalledWith(
        'connectors.authEntry.write',
        expect.anything(),
      );
      expect(mockDaemonCall).not.toHaveBeenCalledWith(
        'connectors.authEntry.delete',
        expect.anything(),
      );
    });
  });

  describe('clearAuth()', () => {
    it('deletes entire entry including client registration', async () => {
      mockEntryStore['test-provider'] = {
        accessToken: 'tok',
        clientRegistration: { clientId: 'x', clientSecret: 'y' },
      };
      const store = makeStore();
      await store.clearAuth();
      expect(mockDaemonCall).toHaveBeenCalledWith('connectors.authEntry.delete', {
        connectorKey: 'test-provider',
      });
    });
  });

  describe('getRefreshToken()', () => {
    it('returns refresh token from stored entry', async () => {
      mockEntryStore['test-provider'] = { refreshToken: 'refresh-tok' };
      const store = makeStore();
      expect(await store.getRefreshToken()).toBe('refresh-tok');
    });

    it('returns undefined when no entry', async () => {
      const store = makeStore();
      expect(await store.getRefreshToken()).toBeUndefined();
    });
  });

  describe('getServerUrl()', () => {
    it('returns static serverUrl from config when set', async () => {
      const store = makeStore({ serverUrl: 'https://static.example.com/mcp' });
      expect(await store.getServerUrl()).toBe('https://static.example.com/mcp');
    });

    it('reads serverUrl from stored entry when storesServerUrl is true', async () => {
      mockEntryStore['test-provider'] = { serverUrl: 'https://dynamic.example.com/mcp' };
      const store = makeStore({ serverUrl: undefined, storesServerUrl: true });
      expect(await store.getServerUrl()).toBe('https://dynamic.example.com/mcp');
    });
  });
});
