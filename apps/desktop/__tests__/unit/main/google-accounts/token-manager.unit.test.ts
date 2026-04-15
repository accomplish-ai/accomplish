import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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

import { TokenManager } from '@main/google-accounts/token-manager';
import type { StorageAPI } from '@accomplish_ai/agent-core';
import type { GoogleAccount } from '@accomplish_ai/agent-core/common';

// better-sqlite3 and @main/logging are mocked in __tests__/setup.ts

const makeStorage = (): StorageAPI => {
  const store = new Map<string, string>();
  return {
    get: vi.fn((key: string) => store.get(key) ?? null),
    set: vi.fn((key: string, value: string) => {
      store.set(key, value);
    }),
  } as unknown as StorageAPI;
};

const makeDb = () => ({
  prepare: vi.fn(() => ({
    run: vi.fn(),
    get: vi.fn(() => undefined),
    all: vi.fn(() => []),
  })),
  exec: vi.fn(),
  pragma: vi.fn().mockReturnThis(),
  close: vi.fn(),
});

const makeWindow = () => ({
  isDestroyed: vi.fn(() => false),
  webContents: {
    send: vi.fn(),
    isDestroyed: vi.fn(() => false),
  },
});

// Token endpoint constant kept for documentation; unused at runtime (fetch is mocked)
// const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

function makeStoredToken(
  overrides: Partial<{
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    scopes: string[];
  }> = {},
) {
  return JSON.stringify({
    accessToken: 'old-access',
    refreshToken: 'my-refresh-token',
    expiresAt: Date.now() + 3600_000,
    scopes: ['https://www.googleapis.com/auth/gmail.modify'],
    ...overrides,
  });
}

function makeConnectedAccount(id: string, overrides: Partial<GoogleAccount> = {}): GoogleAccount {
  return {
    googleAccountId: id,
    email: `${id}@gmail.com`,
    displayName: 'User',
    pictureUrl: null,
    label: id,
    status: 'connected',
    connectedAt: new Date().toISOString(),
    lastRefreshedAt: null,
    ...overrides,
  };
}

describe('TokenManager', () => {
  let storage: ReturnType<typeof makeStorage>;
  let db: ReturnType<typeof makeDb>;
  let mainWindow: ReturnType<typeof makeWindow>;
  let manager: TokenManager;

  beforeEach(() => {
    vi.useFakeTimers();
    storage = makeStorage();
    db = makeDb();
    mainWindow = makeWindow();
    manager = new TokenManager(storage as never, db as never, mainWindow as never);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe('scheduleRefresh', () => {
    it('fires refreshToken after (expiresAt - margin) ms', () => {
      const refreshSpy = vi.spyOn(manager, 'refreshToken').mockResolvedValue(undefined);
      const MARGIN = 10 * 60 * 1000; // TOKEN_REFRESH_MARGIN_MS
      const expiresAt = Date.now() + 3600_000;
      const expectedDelay = expiresAt - Date.now() - MARGIN;

      manager.scheduleRefresh('uid-1', expiresAt);

      // Timer should not have fired yet
      expect(refreshSpy).not.toHaveBeenCalled();

      // Advance past the expected delay
      vi.advanceTimersByTime(expectedDelay + 100);

      expect(refreshSpy).toHaveBeenCalledWith('uid-1');
    });

    it('cancels any existing timer before scheduling a new one', () => {
      const refreshSpy = vi.spyOn(manager, 'refreshToken').mockResolvedValue(undefined);
      const expiresAt = Date.now() + 3600_000;

      manager.scheduleRefresh('uid-1', expiresAt);
      // Re-schedule before the timer fires
      manager.scheduleRefresh('uid-1', expiresAt + 1000);

      vi.advanceTimersByTime(expiresAt - Date.now() + 1000);

      // Should only fire once for the last scheduled refresh
      expect(refreshSpy).toHaveBeenCalledTimes(1);
    });

    it('fires immediately when expiresAt is in the past', () => {
      const refreshSpy = vi.spyOn(manager, 'refreshToken').mockResolvedValue(undefined);
      const expiresAt = Date.now() - 1000; // already expired

      manager.scheduleRefresh('uid-1', expiresAt);
      vi.advanceTimersByTime(100);

      expect(refreshSpy).toHaveBeenCalledWith('uid-1');
    });
  });

  describe('cancelRefresh', () => {
    it('prevents a scheduled refresh from firing', () => {
      const refreshSpy = vi.spyOn(manager, 'refreshToken').mockResolvedValue(undefined);
      const expiresAt = Date.now() + 3600_000;

      manager.scheduleRefresh('uid-1', expiresAt);
      manager.cancelRefresh('uid-1');

      vi.runAllTimers();

      expect(refreshSpy).not.toHaveBeenCalled();
    });

    it('is a no-op when no timer exists for the account', () => {
      expect(() => manager.cancelRefresh('uid-nonexistent')).not.toThrow();
    });
  });

  describe('startAllTimers', () => {
    it('schedules a refresh for each connected account with a stored token', () => {
      const scheduleSpy = vi.spyOn(manager, 'scheduleRefresh').mockImplementation(() => {});
      const expiresAt = Date.now() + 7200_000;

      vi.mocked(storage.get).mockReturnValue(makeStoredToken({ expiresAt }));

      const accounts = [makeConnectedAccount('uid-1'), makeConnectedAccount('uid-2')];

      manager.startAllTimers(accounts);

      expect(scheduleSpy).toHaveBeenCalledTimes(2);
      expect(scheduleSpy).toHaveBeenCalledWith('uid-1', expiresAt);
      expect(scheduleSpy).toHaveBeenCalledWith('uid-2', expiresAt);
    });

    it('skips accounts that are not in connected status', () => {
      const scheduleSpy = vi.spyOn(manager, 'scheduleRefresh').mockImplementation(() => {});
      vi.mocked(storage.get).mockReturnValue(makeStoredToken());

      const accounts = [
        makeConnectedAccount('uid-1', { status: 'expired' }),
        makeConnectedAccount('uid-2', { status: 'connected' }),
      ];

      manager.startAllTimers(accounts);

      expect(scheduleSpy).toHaveBeenCalledTimes(1);
      expect(scheduleSpy).toHaveBeenCalledWith('uid-2', expect.any(Number));
    });

    it('skips accounts with no stored token', () => {
      const scheduleSpy = vi.spyOn(manager, 'scheduleRefresh').mockImplementation(() => {});
      vi.mocked(storage.get).mockReturnValue(null);

      manager.startAllTimers([makeConnectedAccount('uid-1')]);

      expect(scheduleSpy).not.toHaveBeenCalled();
    });
  });

  describe('refreshToken — permanent failure', () => {
    it('sets account status to expired on 401', async () => {
      const mockStmt = { run: vi.fn(), get: vi.fn(), all: vi.fn(() => []) };
      db.prepare.mockReturnValue(mockStmt);
      vi.mocked(storage.get).mockReturnValue(makeStoredToken());

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 401,
          json: async () => ({ error: 'unauthorized' }),
        }),
      );

      await manager.refreshToken('uid-1');

      expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining("SET status = 'expired'"));
      expect(mockStmt.run).toHaveBeenCalledWith('uid-1');
    });

    it('sets account status to expired on 403', async () => {
      const mockStmt = { run: vi.fn(), get: vi.fn(), all: vi.fn(() => []) };
      db.prepare.mockReturnValue(mockStmt);
      vi.mocked(storage.get).mockReturnValue(makeStoredToken());

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 403,
          json: async () => ({ error: 'forbidden' }),
        }),
      );

      await manager.refreshToken('uid-1');

      expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining("SET status = 'expired'"));
    });

    it('sets account status to expired on invalid_grant error', async () => {
      const mockStmt = { run: vi.fn(), get: vi.fn(), all: vi.fn(() => []) };
      db.prepare.mockReturnValue(mockStmt);
      vi.mocked(storage.get).mockReturnValue(makeStoredToken());

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 400,
          json: async () => ({ error: 'invalid_grant' }),
        }),
      );

      await manager.refreshToken('uid-1');

      expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining("SET status = 'expired'"));
    });

    it('sends gws:account:status-changed IPC event on permanent failure', async () => {
      const mockStmt = { run: vi.fn(), get: vi.fn(), all: vi.fn(() => []) };
      db.prepare.mockReturnValue(mockStmt);
      vi.mocked(storage.get).mockReturnValue(makeStoredToken());

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 401,
          json: async () => ({}),
        }),
      );

      await manager.refreshToken('uid-1');

      expect(mainWindow.webContents.send).toHaveBeenCalledWith(
        'gws:account:status-changed',
        'uid-1',
        'expired',
      );
    });

    it('does not send IPC event when mainWindow is null', async () => {
      const managerNoWindow = new TokenManager(storage as never, db as never, null);
      const mockStmt = { run: vi.fn(), get: vi.fn(), all: vi.fn(() => []) };
      db.prepare.mockReturnValue(mockStmt);
      vi.mocked(storage.get).mockReturnValue(makeStoredToken());

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 401,
          json: async () => ({}),
        }),
      );

      // Should not throw
      await expect(managerNoWindow.refreshToken('uid-1')).resolves.toBeUndefined();
    });
  });

  describe('refreshToken — success', () => {
    it('stores the new token and re-schedules refresh', async () => {
      const mockStmt = { run: vi.fn(), get: vi.fn(), all: vi.fn(() => []) };
      db.prepare.mockReturnValue(mockStmt);
      vi.mocked(storage.get).mockReturnValue(makeStoredToken());

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => ({ access_token: 'new-access-token', expires_in: 3600 }),
        }),
      );

      const scheduleSpy = vi.spyOn(manager, 'scheduleRefresh').mockImplementation(() => {});

      await manager.refreshToken('uid-1');

      expect(storage.set).toHaveBeenCalledWith(
        'gws:token:uid-1',
        expect.stringContaining('new-access-token'),
      );
      expect(scheduleSpy).toHaveBeenCalledWith('uid-1', expect.any(Number));
    });
  });

  describe('refreshToken — in-flight snapshot guard', () => {
    it('does not overwrite token if storage changed during in-flight refresh', async () => {
      const mockStmt = { run: vi.fn(), get: vi.fn(), all: vi.fn(() => []) };
      db.prepare.mockReturnValue(mockStmt);

      const originalRaw = makeStoredToken();
      const reconnectedRaw = makeStoredToken({
        accessToken: 'reconnected-access',
        refreshToken: 'new-refresh-token',
      });

      // First call returns the original token (snapshot); subsequent calls return the new token
      let getCallCount = 0;
      vi.mocked(storage.get).mockImplementation(() => {
        getCallCount++;
        return getCallCount === 1 ? originalRaw : reconnectedRaw;
      });

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => ({ access_token: 'refreshed-access', expires_in: 3600 }),
        }),
      );

      const scheduleSpy = vi.spyOn(manager, 'scheduleRefresh').mockImplementation(() => {});

      await manager.refreshToken('uid-1');

      // The stored token changed mid-flight, so the write must be suppressed
      expect(storage.set).not.toHaveBeenCalled();
      expect(scheduleSpy).not.toHaveBeenCalled();
    });
  });

  describe('setWindow', () => {
    it('updates the window reference used for IPC events', async () => {
      const managerNoWindow = new TokenManager(storage as never, db as never, null);
      const newWindow = makeWindow();
      managerNoWindow.setWindow(newWindow as never);

      const mockStmt = { run: vi.fn(), get: vi.fn(), all: vi.fn(() => []) };
      db.prepare.mockReturnValue(mockStmt);
      vi.mocked(storage.get).mockReturnValue(makeStoredToken());

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 401,
          json: async () => ({}),
        }),
      );

      await managerNoWindow.refreshToken('uid-1');

      expect(newWindow.webContents.send).toHaveBeenCalledWith(
        'gws:account:status-changed',
        'uid-1',
        'expired',
      );
    });
  });
});
