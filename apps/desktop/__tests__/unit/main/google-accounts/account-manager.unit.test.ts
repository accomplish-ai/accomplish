import { describe, it, expect, vi, beforeEach } from 'vitest';

// Override setup.ts mock to include .log
vi.mock('@main/logging', () => ({
  getLogCollector: vi.fn(() => ({
    log: vi.fn(),
    write: vi.fn(),
    logEnv: vi.fn(),
    flush: vi.fn(),
    getCurrentLogPath: vi.fn(() => '/mock/logs/app.log'),
    getLogDir: vi.fn(() => '/mock/logs'),
    initialize: vi.fn(),
    shutdown: vi.fn(),
  })),
  getLogFileWriter: vi.fn(() => ({ write: vi.fn(), initialize: vi.fn(), shutdown: vi.fn() })),
  initializeLogCollector: vi.fn(),
  shutdownLogCollector: vi.fn(),
  initializeLogFileWriter: vi.fn(),
  shutdownLogFileWriter: vi.fn(),
}));

import { AccountManager } from '@main/google-accounts/account-manager';
import type { StorageAPI } from '@accomplish_ai/agent-core';
import type { GoogleAccountToken } from '@accomplish_ai/agent-core/common';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

// better-sqlite3 is mocked in __tests__/setup.ts

const makeStorage = (): StorageAPI => {
  const store = new Map<string, string>();
  return {
    get: vi.fn((key: string) => store.get(key) ?? null),
    set: vi.fn((key: string, value: string) => {
      store.set(key, value);
    }),
  } as unknown as StorageAPI;
};

const makeDb = () => {
  const rows = new Map<string, unknown>();

  const prepareImpl = (_sql: string) => ({
    run: vi.fn(),
    get: vi.fn((id: string) => rows.get(id)),
    all: vi.fn(() => []),
  });

  return {
    prepare: vi.fn(prepareImpl),
    exec: vi.fn(),
    pragma: vi.fn().mockReturnThis(),
    transaction: vi.fn((fn: () => unknown) => () => fn()),
    close: vi.fn(),
  };
};

function makeAccount(
  overrides: Partial<{
    googleAccountId: string;
    email: string;
    displayName: string;
    pictureUrl: string | null;
    label: string;
    connectedAt: string;
  }> = {},
) {
  return {
    googleAccountId: 'uid-1',
    email: 'alice@gmail.com',
    displayName: 'Alice',
    pictureUrl: null,
    label: 'Personal',
    connectedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeToken(overrides: Partial<GoogleAccountToken> = {}): GoogleAccountToken {
  return {
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    expiresAt: Date.now() + 3600_000,
    scopes: ['https://www.googleapis.com/auth/gmail.modify'],
    ...overrides,
  };
}

describe('AccountManager', () => {
  let storage: ReturnType<typeof makeStorage>;
  let db: ReturnType<typeof makeDb>;
  let testDir: string;
  let manager: AccountManager;

  beforeEach(() => {
    storage = makeStorage();
    db = makeDb();
    testDir = path.join(
      os.tmpdir(),
      `am-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    fs.mkdirSync(testDir, { recursive: true });
    manager = new AccountManager(db as never, storage, testDir);
    vi.clearAllMocks();
  });

  describe('addAccount', () => {
    it('inserts a row into the database', () => {
      const mockStmt = { run: vi.fn(), get: vi.fn(() => undefined), all: vi.fn(() => []) };
      db.prepare.mockReturnValue(mockStmt);

      const account = makeAccount();
      const token = makeToken();
      manager.addAccount(account, token);

      expect(db.prepare).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO google_accounts'),
      );
      expect(mockStmt.run).toHaveBeenCalledWith(
        account.googleAccountId,
        account.email,
        account.displayName,
        account.pictureUrl,
        account.label,
        account.connectedAt,
      );
    });

    it('writes the token to SecureStorage', () => {
      const mockStmt = { run: vi.fn(), get: vi.fn(() => undefined), all: vi.fn(() => []) };
      db.prepare.mockReturnValue(mockStmt);

      const account = makeAccount();
      const token = makeToken();
      manager.addAccount(account, token);

      expect(storage.set).toHaveBeenCalledWith(
        `gws:token:${account.googleAccountId}`,
        JSON.stringify(token),
      );
    });

    it('throws if the account is already connected (isDuplicate = true)', () => {
      // First prepare call is isDuplicate check — return a row to simulate duplicate
      const existsStmt = { get: vi.fn(() => ({ '1': 1 })), run: vi.fn(), all: vi.fn(() => []) };
      db.prepare.mockReturnValue(existsStmt);

      expect(() => manager.addAccount(makeAccount(), makeToken())).toThrow(
        'Account already connected',
      );
    });
  });

  describe('removeAccount', () => {
    it('deletes the database row', () => {
      const mockStmt = { run: vi.fn(), get: vi.fn(() => undefined), all: vi.fn(() => []) };
      db.prepare.mockReturnValue(mockStmt);

      manager.removeAccount('uid-1');

      expect(db.prepare).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM google_accounts'),
      );
      expect(mockStmt.run).toHaveBeenCalledWith('uid-1');
    });

    it('blanks the token in SecureStorage', () => {
      const mockStmt = { run: vi.fn(), get: vi.fn(() => undefined), all: vi.fn(() => []) };
      db.prepare.mockReturnValue(mockStmt);

      manager.removeAccount('uid-1');

      expect(storage.set).toHaveBeenCalledWith('gws:token:uid-1', '');
    });
  });

  describe('isDuplicate', () => {
    it('returns true when a row exists', () => {
      const mockStmt = { get: vi.fn(() => ({ '1': 1 })), run: vi.fn(), all: vi.fn(() => []) };
      db.prepare.mockReturnValue(mockStmt);

      expect(manager.isDuplicate('uid-1')).toBe(true);
    });

    it('returns false when no row exists', () => {
      const mockStmt = { get: vi.fn(() => undefined), run: vi.fn(), all: vi.fn(() => []) };
      db.prepare.mockReturnValue(mockStmt);

      expect(manager.isDuplicate('uid-999')).toBe(false);
    });
  });

  describe('getAccountToken', () => {
    it('returns the parsed token for the correct account', () => {
      const token = makeToken();
      vi.mocked(storage.get).mockReturnValue(JSON.stringify(token));

      const result = manager.getAccountToken('uid-1');

      expect(storage.get).toHaveBeenCalledWith('gws:token:uid-1');
      expect(result).toEqual(token);
    });

    it('returns null when no token is stored', () => {
      vi.mocked(storage.get).mockReturnValue(null);

      expect(manager.getAccountToken('uid-1')).toBeNull();
    });

    it('returns null when the stored value is empty string', () => {
      vi.mocked(storage.get).mockReturnValue('');

      expect(manager.getAccountToken('uid-1')).toBeNull();
    });

    it('never returns uid-2 token when asked for uid-1', () => {
      const token1 = makeToken({ accessToken: 'token-for-uid-1' });
      const token2 = makeToken({ accessToken: 'token-for-uid-2' });

      vi.mocked(storage.get).mockImplementation((key: string) => {
        if (key === 'gws:token:uid-1') {
          return JSON.stringify(token1);
        }
        if (key === 'gws:token:uid-2') {
          return JSON.stringify(token2);
        }
        return null;
      });

      const result = manager.getAccountToken('uid-1');
      expect(result?.accessToken).toBe('token-for-uid-1');
      expect(result?.accessToken).not.toBe('token-for-uid-2');
    });
  });

  describe('writeAccountsManifest', () => {
    it('writes a JSON manifest file to the gws-manifests directory', () => {
      const entries = [
        {
          googleAccountId: 'uid-1',
          label: 'Personal',
          email: 'alice@gmail.com',
          tokenFilePath: '/tmp/uid-1.json',
        },
      ];

      const manifestPath = manager.writeAccountsManifest(entries);

      expect(fs.existsSync(manifestPath)).toBe(true);
      const contents = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      expect(contents).toEqual(entries);
    });

    it('sets file permissions to 0o600', () => {
      const entries = [
        {
          googleAccountId: 'uid-1',
          label: 'Work',
          email: 'bob@company.com',
          tokenFilePath: '/tmp/uid-1.json',
        },
      ];

      const manifestPath = manager.writeAccountsManifest(entries);

      // fs.chmodSync is a no-op on Windows, so skip the permission check there
      if (process.platform !== 'win32') {
        const stats = fs.statSync(manifestPath);
        // On Linux/macOS: mode bits 0o100600 means regular file + 0o600 perms
        const perms = stats.mode & 0o777;
        expect(perms).toBe(0o600);
      }
    });

    it('returns the path to the manifest file', () => {
      const manifestPath = manager.writeAccountsManifest([]);

      expect(manifestPath).toContain('gws-manifests');
      expect(manifestPath).toContain('manifest.json');
    });

    it('overwrites a previous manifest atomically', () => {
      const entries1 = [
        {
          googleAccountId: 'uid-1',
          label: 'Personal',
          email: 'alice@gmail.com',
          tokenFilePath: '/tmp/1.json',
        },
      ];
      const entries2 = [
        {
          googleAccountId: 'uid-2',
          label: 'Work',
          email: 'bob@co.com',
          tokenFilePath: '/tmp/2.json',
        },
      ];

      manager.writeAccountsManifest(entries1);
      const manifestPath = manager.writeAccountsManifest(entries2);

      const contents = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      expect(contents).toEqual(entries2);
      expect(contents).not.toEqual(entries1);
    });
  });
});
