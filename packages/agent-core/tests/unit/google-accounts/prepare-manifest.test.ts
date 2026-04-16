/**
 * Tests for `prepareGwsManifest` — the pure helper that reads connected
 * Google accounts from SQLite + SecureStorage, lazy-refreshes tokens that
 * are near expiry, and writes per-account token files + manifest to disk.
 *
 * These tests exercise the daemon's happy paths and failure modes:
 *   - zero connected accounts → undefined (caller skips GWS step)
 *   - one connected account with fresh token → manifest written + summary populated
 *   - near-expiry token triggers inline refresh via fetch
 *   - refresh failure returns the stale token (best-effort) but still succeeds
 *   - pre-migration DB (no `google_accounts` table) → undefined, no throw
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { StorageAPI } from '../../../src/types/storage.js';
import { prepareGwsManifest } from '../../../src/google-accounts/prepare-manifest.js';
import { gwsTokenKey } from '../../../src/google-accounts/constants.js';

interface StmtMock {
  all: ReturnType<typeof vi.fn>;
  run: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
}

function makeStorage(): StorageAPI {
  const store = new Map<string, string>();
  return {
    get: vi.fn((key: string) => store.get(key) ?? null),
    set: vi.fn((key: string, value: string) => {
      store.set(key, value);
    }),
  } as unknown as StorageAPI;
}

function makeDb(accountRows: Record<string, unknown>[]): { prepare: ReturnType<typeof vi.fn> } {
  // Simple in-memory SQL stub: the prepared-statement SELECT returns the
  // provided rows; UPDATE statements no-op. Good enough for prepareGwsManifest
  // which only issues two shapes of queries.
  const selectStmt: StmtMock = {
    all: vi.fn(() => accountRows),
    run: vi.fn(),
    get: vi.fn(() => undefined),
  };
  const updateStmt: StmtMock = {
    all: vi.fn(() => []),
    run: vi.fn(),
    get: vi.fn(() => undefined),
  };
  return {
    prepare: vi.fn((sql: string) => (sql.startsWith('SELECT') ? selectStmt : updateStmt)),
  };
}

function connectedRow(
  id: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    google_account_id: id,
    email: `${id}@gmail.com`,
    display_name: `User ${id}`,
    picture_url: null,
    label: id,
    status: 'connected',
    connected_at: new Date().toISOString(),
    last_refreshed_at: null,
    ...overrides,
  };
}

function makeTokenJson(
  overrides: Partial<{
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    scopes: string[];
  }> = {},
): string {
  return JSON.stringify({
    accessToken: 'old-access',
    refreshToken: 'my-refresh-token',
    expiresAt: Date.now() + 3600_000,
    scopes: ['https://www.googleapis.com/auth/gmail.modify'],
    ...overrides,
  });
}

describe('prepareGwsManifest', () => {
  let tmpDir: string;
  const log = vi.fn();

  beforeEach(() => {
    tmpDir = path.join(
      os.tmpdir(),
      `prep-gws-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    fs.mkdirSync(tmpDir, { recursive: true });
    log.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* best-effort cleanup */
    }
  });

  it('returns undefined when no connected accounts exist', async () => {
    const storage = makeStorage();
    const db = makeDb([]);
    const result = await prepareGwsManifest(storage, db as never, tmpDir, log);
    expect(result).toBeUndefined();
  });

  it('returns undefined when the google_accounts table is missing (pre-migration DB)', async () => {
    const storage = makeStorage();
    // DB.prepare throws — simulates "no such table" on a pre-v028 install
    const db = {
      prepare: vi.fn(() => {
        throw new Error('no such table: google_accounts');
      }),
    };
    const result = await prepareGwsManifest(storage, db as never, tmpDir, log);
    expect(result).toBeUndefined();
    expect(log).toHaveBeenCalledWith(
      'WARN',
      expect.stringContaining('google_accounts read failed'),
      expect.any(Object),
    );
  });

  it('writes the manifest + per-account token file for a connected account with a fresh token', async () => {
    const storage = makeStorage();
    vi.mocked(storage.get).mockImplementation((key: string) =>
      key === gwsTokenKey('uid-1') ? makeTokenJson() : null,
    );
    const db = makeDb([connectedRow('uid-1', { email: 'alice@gmail.com', label: 'Personal' })]);

    const result = await prepareGwsManifest(storage, db as never, tmpDir, log);

    expect(result).toBeDefined();
    expect(result!.manifestPath).toContain('gws-manifests');
    expect(result!.manifestPath).toContain('manifest.json');
    expect(fs.existsSync(result!.manifestPath)).toBe(true);
    const manifest = JSON.parse(fs.readFileSync(result!.manifestPath, 'utf-8'));
    expect(manifest).toHaveLength(1);
    expect(manifest[0].googleAccountId).toBe('uid-1');
    expect(manifest[0].email).toBe('alice@gmail.com');
    expect(manifest[0].tokenFilePath).toContain('gws-tokens');
    expect(manifest[0].tokenFilePath).toContain('uid-1.json');
    expect(fs.existsSync(manifest[0].tokenFilePath)).toBe(true);

    expect(result!.summary).toEqual([
      { label: 'Personal', email: 'alice@gmail.com', status: 'connected' },
    ]);
  });

  it('triggers an inline refresh when the token is within the refresh margin', async () => {
    // Token expires in 5 minutes — below the 10-minute refresh margin.
    const storage = makeStorage();
    const originalRaw = makeTokenJson({ expiresAt: Date.now() + 5 * 60 * 1000 });
    vi.mocked(storage.get).mockImplementation((key: string) =>
      key === gwsTokenKey('uid-1') ? originalRaw : null,
    );
    const db = makeDb([connectedRow('uid-1')]);

    process.env.GOOGLE_CLIENT_ID = 'test-client-id';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ access_token: 'freshly-refreshed', expires_in: 3600 }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await prepareGwsManifest(storage, db as never, tmpDir, log);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://oauth2.googleapis.com/token',
      expect.objectContaining({ method: 'POST' }),
    );
    // The new token should have been written back via storage.set
    expect(vi.mocked(storage.set)).toHaveBeenCalledWith(
      gwsTokenKey('uid-1'),
      expect.stringContaining('freshly-refreshed'),
    );
    // Manifest still produced using the refreshed token
    expect(result!.manifestPath).toBeTruthy();
    const tokenFile = JSON.parse(
      fs.readFileSync(
        JSON.parse(fs.readFileSync(result!.manifestPath, 'utf-8'))[0].tokenFilePath,
        'utf-8',
      ),
    );
    expect(tokenFile.accessToken).toBe('freshly-refreshed');
  });

  it('falls back to the stale token when the inline refresh fails', async () => {
    // Token near expiry → would trigger refresh. The fetch rejects.
    const storage = makeStorage();
    const staleRaw = makeTokenJson({
      accessToken: 'stale-but-still-valid',
      expiresAt: Date.now() + 5 * 60 * 1000,
    });
    vi.mocked(storage.get).mockImplementation((key: string) =>
      key === gwsTokenKey('uid-1') ? staleRaw : null,
    );
    const db = makeDb([connectedRow('uid-1')]);

    process.env.GOOGLE_CLIENT_ID = 'test-client-id';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    const result = await prepareGwsManifest(storage, db as never, tmpDir, log);

    // The manifest is still produced — best-effort means we try the stale
    // token rather than skip the account entirely.
    expect(result!.manifestPath).toBeTruthy();
    const tokenFile = JSON.parse(
      fs.readFileSync(
        JSON.parse(fs.readFileSync(result!.manifestPath, 'utf-8'))[0].tokenFilePath,
        'utf-8',
      ),
    );
    expect(tokenFile.accessToken).toBe('stale-but-still-valid');
    expect(log).toHaveBeenCalledWith(
      'WARN',
      expect.stringContaining('inline refresh network error'),
      expect.any(Object),
    );
  });

  it('skips an account whose stored token is missing or empty', async () => {
    const storage = makeStorage();
    // storage.get returns null for uid-1 (no stored token)
    const db = makeDb([
      connectedRow('uid-1', { email: 'missing@gmail.com', label: 'MissingToken' }),
      connectedRow('uid-2', { email: 'alice@gmail.com', label: 'Present' }),
    ]);
    vi.mocked(storage.get).mockImplementation((key: string) => {
      if (key === gwsTokenKey('uid-2')) {
        return makeTokenJson();
      }
      return null;
    });

    const result = await prepareGwsManifest(storage, db as never, tmpDir, log);

    // uid-2 appears in the manifest; uid-1 is only in the summary (as a
    // signal to the agent that the account exists but was unusable).
    const manifest = JSON.parse(fs.readFileSync(result!.manifestPath, 'utf-8'));
    expect(manifest).toHaveLength(1);
    expect(manifest[0].googleAccountId).toBe('uid-2');

    expect(result!.summary).toHaveLength(2);
    expect(result!.summary.map((s) => s.email).sort()).toEqual([
      'alice@gmail.com',
      'missing@gmail.com',
    ]);
  });
});
