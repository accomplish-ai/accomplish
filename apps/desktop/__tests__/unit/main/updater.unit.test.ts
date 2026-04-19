/**
 * Unit tests for the auto-updater public API (updater/index.ts).
 *
 * Manual-manifest path coverage (Win / non-AppImage Linux) lives in
 * updater.manual-manifest.unit.test.ts to keep each file under ~250 LOC.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';

const storeData: Record<string, unknown> = {};

const mockHttpsGet = vi.fn();
vi.mock('https', () => ({
  default: { get: (...args: unknown[]) => mockHttpsGet(...args) },
  get: (...args: unknown[]) => mockHttpsGet(...args),
}));

vi.mock('electron', () => ({
  app: {
    getVersion: vi.fn(() => '0.3.8'),
    getPath: vi.fn(() => '/tmp/test-userdata'),
    getAppPath: vi.fn(() => '/tmp/test-app'),
    isPackaged: true, // skips the dev-app-update.yml fs write in initUpdater
    name: 'Accomplish',
  },
  dialog: { showMessageBox: vi.fn(() => Promise.resolve({ response: 1 })), showErrorBox: vi.fn() },
  BrowserWindow: vi.fn(),
  shell: { openExternal: vi.fn() },
  clipboard: { writeText: vi.fn() },
}));

const mockAutoUpdater = {
  autoDownload: true,
  autoInstallOnAppQuit: false,
  forceDevUpdateConfig: false,
  setFeedURL: vi.fn(),
  checkForUpdates: vi.fn(() => Promise.resolve()),
  downloadUpdate: vi.fn(() => Promise.resolve([])),
  quitAndInstall: vi.fn(),
  on: vi.fn(),
};
// electron-updater is CommonJS. In the ESM main bundle, dynamic import exposes
// `autoUpdater` under `default`, not as a named export.
vi.mock('electron-updater', () => ({ default: { autoUpdater: mockAutoUpdater } }));

vi.mock('electron-store', () => {
  class MockStore {
    get(key: string) {
      return storeData[key];
    }
    set(key: string, val: unknown) {
      storeData[key] = val;
    }
  }
  return { default: MockStore };
});

vi.mock('@sentry/electron/main', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

vi.mock('../../../src/main/analytics/events', () => ({
  trackUpdateCheck: vi.fn(),
  trackUpdateAvailable: vi.fn(),
  trackUpdateNotAvailable: vi.fn(),
  trackUpdateDownloadStart: vi.fn(),
  trackUpdateDownloadComplete: vi.fn(),
  trackUpdateInstallStart: vi.fn(),
  trackUpdateFailed: vi.fn(),
}));

vi.mock('../../../src/main/logging', () => ({
  getLogCollector: () => ({ log: vi.fn() }),
}));

const emptyConfig = {
  buildEnvVersion: '',
  mixpanelToken: '',
  gaApiSecret: '',
  gaMeasurementId: '',
  sentryDsn: '',
  accomplishGatewayUrl: '',
  buildId: '',
  accomplishUpdaterUrl: '',
};

vi.mock('../../../src/main/config/build-config', () => ({
  getBuildConfig: vi.fn(() => ({
    ...emptyConfig,
    accomplishUpdaterUrl: 'https://d.accomplish.ai',
  })),
  isAutoUpdaterEnabled: vi.fn(() => true),
}));

function setPlatform(platform: string): () => void {
  const original = process.platform;
  Object.defineProperty(process, 'platform', { value: platform, configurable: true });
  return () => Object.defineProperty(process, 'platform', { value: original, configurable: true });
}

const mockWindow = { setProgressBar: vi.fn() } as unknown as import('electron').BrowserWindow;

describe('updater', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    for (const key of Object.keys(storeData)) {
      delete storeData[key];
    }
    mockAutoUpdater.checkForUpdates.mockReturnValue(Promise.resolve());
    mockAutoUpdater.downloadUpdate.mockReturnValue(Promise.resolve([]));
    const { getBuildConfig } = await import('../../../src/main/config/build-config');
    vi.mocked(getBuildConfig).mockReturnValue({
      ...emptyConfig,
      accomplishUpdaterUrl: 'https://d.accomplish.ai',
    });
  });

  describe('feed-config', () => {
    it('getFeedUrl trims a single trailing slash', async () => {
      const { getBuildConfig } = await import('../../../src/main/config/build-config');
      vi.mocked(getBuildConfig).mockReturnValue({
        ...emptyConfig,
        accomplishUpdaterUrl: 'https://d.accomplish.ai/test/',
      });
      const { getFeedUrl } = await import('../../../src/main/updater/feed-config');
      expect(getFeedUrl()).toBe('https://d.accomplish.ai/test');
    });

    it('getFeedUrl trims multiple trailing slashes', async () => {
      const { getBuildConfig } = await import('../../../src/main/config/build-config');
      vi.mocked(getBuildConfig).mockReturnValue({
        ...emptyConfig,
        accomplishUpdaterUrl: 'https://d.accomplish.ai/test///',
      });
      const { getFeedUrl } = await import('../../../src/main/updater/feed-config');
      expect(getFeedUrl()).toBe('https://d.accomplish.ai/test');
    });

    it('getManifestName pins the accomplish-release contract', async () => {
      const { getManifestName } = await import('../../../src/main/updater/feed-config');
      expect(getManifestName('win')).toBe('latest-win.yml');
      expect(getManifestName('linux', 'x64')).toBe('latest-linux.yml');
      expect(getManifestName('linux', 'arm64')).toBe('latest-linux-arm64.yml');
    });
  });

  describe('shouldAutoCheck', () => {
    it('returns true on first launch (no previous check)', async () => {
      const { shouldAutoCheck } = await import('../../../src/main/updater');
      expect(shouldAutoCheck()).toBe(true);
    });

    it('returns false when last check was recent', async () => {
      storeData['lastUpdateCheck'] = Date.now();
      const { shouldAutoCheck } = await import('../../../src/main/updater');
      expect(shouldAutoCheck()).toBe(false);
    });

    it('returns true when last check was over 1 day ago', async () => {
      storeData['lastUpdateCheck'] = Date.now() - 2 * 24 * 60 * 60 * 1000;
      const { shouldAutoCheck } = await import('../../../src/main/updater');
      expect(shouldAutoCheck()).toBe(true);
    });
  });

  describe('getUpdateState', () => {
    it('returns initial empty state', async () => {
      const { getUpdateState } = await import('../../../src/main/updater');
      const state = getUpdateState();
      expect(state.updateAvailable).toBe(false);
      expect(state.downloadedVersion).toBeNull();
      expect(state.availableVersion).toBeNull();
    });
  });

  describe('initUpdater', () => {
    it('on darwin, calls setFeedURL WITHOUT a channel key (release contract)', async () => {
      const restore = setPlatform('darwin');
      try {
        const { initUpdater } = await import('../../../src/main/updater');
        await initUpdater(mockWindow);
        expect(mockAutoUpdater.setFeedURL).toHaveBeenCalledWith({
          provider: 'generic',
          url: 'https://d.accomplish.ai',
        });
        // Pin: no channel key in the arg.
        const arg = mockAutoUpdater.setFeedURL.mock.calls[0][0] as Record<string, unknown>;
        expect(arg).not.toHaveProperty('channel');
      } finally {
        restore();
      }
    });

    it('on win32, returns early without calling setFeedURL', async () => {
      const restore = setPlatform('win32');
      try {
        const { initUpdater } = await import('../../../src/main/updater');
        await initUpdater(mockWindow);
        expect(mockAutoUpdater.setFeedURL).not.toHaveBeenCalled();
      } finally {
        restore();
      }
    });

    it('on darwin, registers all 5 autoUpdater event handlers', async () => {
      const restore = setPlatform('darwin');
      try {
        const { initUpdater } = await import('../../../src/main/updater');
        await initUpdater(mockWindow);
        const events = mockAutoUpdater.on.mock.calls.map((c: unknown[]) => c[0]);
        expect(events).toEqual(
          expect.arrayContaining([
            'update-available',
            'update-not-available',
            'download-progress',
            'update-downloaded',
            'error',
          ]),
        );
      } finally {
        restore();
      }
    });

    it('throws on real init failure (setFeedURL throws) and captures Sentry context', async () => {
      const restore = setPlatform('darwin');
      mockAutoUpdater.setFeedURL.mockImplementationOnce(() => {
        throw new Error('Feed setup failed');
      });
      const Sentry = await import('@sentry/electron/main');
      try {
        const { initUpdater } = await import('../../../src/main/updater');
        await expect(initUpdater(mockWindow)).rejects.toThrow('Feed setup failed');
        expect(Sentry.captureException).toHaveBeenCalledWith(
          expect.any(Error),
          expect.objectContaining({
            tags: expect.objectContaining({ component: 'updater', phase: 'init' }),
          }),
        );
      } finally {
        restore();
      }
    });
  });

  describe('gate-off triple — URL empty disables init, check, auto-check', () => {
    beforeEach(async () => {
      const { getBuildConfig } = await import('../../../src/main/config/build-config');
      vi.mocked(getBuildConfig).mockReturnValue({ ...emptyConfig }); // URL empty
    });

    it('initUpdater does not touch electron-updater when URL is empty', async () => {
      const restore = setPlatform('darwin');
      try {
        const { initUpdater } = await import('../../../src/main/updater');
        await initUpdater(mockWindow);
        expect(mockAutoUpdater.setFeedURL).not.toHaveBeenCalled();
        expect(mockAutoUpdater.on).not.toHaveBeenCalled();
      } finally {
        restore();
      }
    });

    it('checkForUpdates(false) is a no-op when URL is empty', async () => {
      const restore = setPlatform('darwin');
      try {
        const { checkForUpdates } = await import('../../../src/main/updater');
        const { dialog } = await import('electron');
        await checkForUpdates(false);
        expect(mockAutoUpdater.checkForUpdates).not.toHaveBeenCalled();
        expect(dialog.showMessageBox).not.toHaveBeenCalled();
        expect(dialog.showErrorBox).not.toHaveBeenCalled();
      } finally {
        restore();
      }
    });

    it('autoCheckForUpdates() is a no-op when URL is empty (no network, no check)', async () => {
      const restore = setPlatform('darwin');
      try {
        const { autoCheckForUpdates } = await import('../../../src/main/updater');
        autoCheckForUpdates();
        await new Promise((r) => setTimeout(r, 20));
        expect(mockAutoUpdater.checkForUpdates).not.toHaveBeenCalled();
      } finally {
        restore();
      }
    });
  });

  describe('checkForUpdates (native path — darwin)', () => {
    it('silent=true calls autoUpdater.checkForUpdates and records lastUpdateCheck', async () => {
      const restore = setPlatform('darwin');
      try {
        const { checkForUpdates } = await import('../../../src/main/updater');
        expect(storeData['lastUpdateCheck']).toBeUndefined();
        await checkForUpdates(true);
        expect(mockAutoUpdater.checkForUpdates).toHaveBeenCalled();
        expect(typeof storeData['lastUpdateCheck']).toBe('number');
      } finally {
        restore();
      }
    });

    it('silent=false with thrown error shows error box', async () => {
      const restore = setPlatform('darwin');
      mockAutoUpdater.checkForUpdates.mockReturnValueOnce(Promise.reject(new Error('Net down')));
      const { dialog } = await import('electron');
      try {
        const { checkForUpdates } = await import('../../../src/main/updater');
        await checkForUpdates(false);
        expect(dialog.showErrorBox).toHaveBeenCalledWith('Update Check Failed', 'Net down');
      } finally {
        restore();
      }
    });

    it('silent=true with thrown error does NOT show error box', async () => {
      const restore = setPlatform('darwin');
      mockAutoUpdater.checkForUpdates.mockReturnValueOnce(Promise.reject(new Error('Net down')));
      const { dialog } = await import('electron');
      try {
        const { checkForUpdates } = await import('../../../src/main/updater');
        await checkForUpdates(true);
        await new Promise((r) => setTimeout(r, 20));
        expect(dialog.showErrorBox).not.toHaveBeenCalled();
      } finally {
        restore();
      }
    });
  });

  describe('autoCheckForUpdates', () => {
    it('invokes checkForUpdates(true) on first launch', async () => {
      const restore = setPlatform('darwin');
      try {
        const { autoCheckForUpdates } = await import('../../../src/main/updater');
        autoCheckForUpdates();
        await new Promise((r) => setTimeout(r, 20));
        expect(mockAutoUpdater.checkForUpdates).toHaveBeenCalled();
      } finally {
        restore();
      }
    });

    it('does not invoke checkForUpdates when last check was recent', async () => {
      storeData['lastUpdateCheck'] = Date.now();
      const { autoCheckForUpdates } = await import('../../../src/main/updater');
      autoCheckForUpdates();
      await new Promise((r) => setTimeout(r, 20));
      expect(mockAutoUpdater.checkForUpdates).not.toHaveBeenCalled();
    });

    it('Windows/manual path: second autoCheckForUpdates after successful fetch is throttled (regression test)', async () => {
      // End-to-end regression for the P1 fix: the manual path must record
      // lastUpdateCheck after a trustworthy manifest, otherwise Windows and
      // non-AppImage Linux auto-checks re-fetch on every launch. Uses the real
      // updater/store.ts module (not a mock) so the shared storeData tracks the
      // real write from recordCheckedNow().
      const restore = setPlatform('win32');
      try {
        // Serve a valid manifest with SAME version as the mocked app (0.3.8) and
        // a same-apex `path:` so the origin check passes. This is the "valid
        // result" case that should record the throttle.
        mockHttpsGet.mockImplementation((_url: string, cb: (res: unknown) => void) => {
          const res = new EventEmitter() as EventEmitter & { statusCode: number };
          res.statusCode = 200;
          setTimeout(() => {
            res.emit(
              'data',
              `version: 0.3.8\npath: https://downloads.accomplish.ai/downloads/0.3.8/windows/a.exe\n`,
            );
            res.emit('end');
          }, 0);
          cb(res);
          return { on: vi.fn() };
        });

        expect(storeData['lastUpdateCheck']).toBeUndefined();
        const { autoCheckForUpdates } = await import('../../../src/main/updater');

        // First launch: throttle is not set → auto-check fetches.
        autoCheckForUpdates();
        await new Promise((r) => setTimeout(r, 20));
        expect(mockHttpsGet).toHaveBeenCalledTimes(1);
        expect(typeof storeData['lastUpdateCheck']).toBe('number');

        // Second launch (same session): throttle is set, fetched within 1 day.
        // autoCheckForUpdates must bail — no new network request.
        mockHttpsGet.mockClear();
        autoCheckForUpdates();
        await new Promise((r) => setTimeout(r, 20));
        expect(mockHttpsGet).not.toHaveBeenCalled();
      } finally {
        restore();
      }
    });
  });

  describe('event handlers (darwin)', () => {
    it('update-available handler records available version and tracks analytics', async () => {
      const restore = setPlatform('darwin');
      const analytics = await import('../../../src/main/analytics/events');
      try {
        const { initUpdater, getUpdateState } = await import('../../../src/main/updater');
        await initUpdater(mockWindow);
        const handler = mockAutoUpdater.on.mock.calls.find(
          (c: unknown[]) => c[0] === 'update-available',
        )?.[1] as (info: { version: string }) => void;
        handler({ version: '1.2.3' });
        expect(getUpdateState().availableVersion).toBe('1.2.3');
        expect(analytics.trackUpdateAvailable).toHaveBeenCalledWith('0.3.8', '1.2.3');
        expect(analytics.trackUpdateDownloadStart).toHaveBeenCalledWith('1.2.3');
        expect(mockAutoUpdater.downloadUpdate).toHaveBeenCalled();
      } finally {
        restore();
      }
    });

    it('update-available handler rejects untrusted native download URLs before download', async () => {
      const restore = setPlatform('darwin');
      const analytics = await import('../../../src/main/analytics/events');
      const { dialog } = await import('electron');
      try {
        const { initUpdater, checkForUpdates, getUpdateState } =
          await import('../../../src/main/updater');
        await initUpdater(mockWindow);
        await checkForUpdates(false);
        const handler = mockAutoUpdater.on.mock.calls.find(
          (c: unknown[]) => c[0] === 'update-available',
        )?.[1] as (info: { version: string; files: Array<{ url: string }>; path: string }) => void;
        handler({
          version: '99.0.0',
          files: [{ url: 'https://evil.example.com/fake.zip' }],
          path: 'https://evil.example.com/fake.zip',
        });
        expect(getUpdateState().availableVersion).toBeNull();
        expect(mockAutoUpdater.downloadUpdate).not.toHaveBeenCalled();
        expect(analytics.trackUpdateAvailable).not.toHaveBeenCalled();
        expect(analytics.trackUpdateDownloadStart).not.toHaveBeenCalled();
        expect(analytics.trackUpdateFailed).toHaveBeenCalledWith(
          'invalid_manifest',
          expect.stringContaining('untrusted download URL'),
        );
        expect(dialog.showMessageBox).toHaveBeenCalledWith(
          expect.objectContaining({ title: 'Update Check Failed' }),
        );
        expect(dialog.showMessageBox).not.toHaveBeenCalledWith(
          expect.objectContaining({ title: 'Update Available' }),
        );
      } finally {
        restore();
      }
    });

    it('download-progress handler updates BrowserWindow progress bar', async () => {
      const restore = setPlatform('darwin');
      try {
        const { initUpdater } = await import('../../../src/main/updater');
        await initUpdater(mockWindow);
        const handler = mockAutoUpdater.on.mock.calls.find(
          (c: unknown[]) => c[0] === 'download-progress',
        )?.[1] as (p: { percent: number }) => void;
        handler({ percent: 75 });
        expect(mockWindow.setProgressBar).toHaveBeenCalledWith(0.75);
      } finally {
        restore();
      }
    });

    it('update-downloaded handler records downloaded version and invokes callback', async () => {
      const restore = setPlatform('darwin');
      try {
        const { initUpdater, getUpdateState, setOnUpdateDownloaded } =
          await import('../../../src/main/updater');
        const callback = vi.fn();
        setOnUpdateDownloaded(callback);
        await initUpdater(mockWindow);
        const handler = mockAutoUpdater.on.mock.calls.find(
          (c: unknown[]) => c[0] === 'update-downloaded',
        )?.[1] as (info: { version: string }) => void;
        handler({ version: '2.0.0' });
        expect(getUpdateState().downloadedVersion).toBe('2.0.0');
        expect(mockWindow.setProgressBar).toHaveBeenCalledWith(-1);
        expect(callback).toHaveBeenCalled();
      } finally {
        restore();
      }
    });
  });

  describe('quitAndInstall', () => {
    it('calls autoUpdater.quitAndInstall(false, true) — shutdownApp handled via before-quit', async () => {
      const restore = setPlatform('darwin');
      try {
        const { initUpdater, quitAndInstall } = await import('../../../src/main/updater');
        await initUpdater(mockWindow);
        await quitAndInstall();
        expect(mockAutoUpdater.quitAndInstall).toHaveBeenCalledWith(false, true);
      } finally {
        restore();
      }
    });
  });
});
