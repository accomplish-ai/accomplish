/**
 * Unit tests for the manual-manifest path used on Windows and non-AppImage Linux
 * (deb, extracted tarballs). Covers: release-contract filenames, YAML parse
 * robustness via js-yaml, semver edge cases, dialog button routing.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';

vi.mock('electron', () => ({
  app: { getVersion: vi.fn(() => '0.3.8'), isPackaged: true, name: 'Accomplish' },
  dialog: { showMessageBox: vi.fn(() => Promise.resolve({ response: 2 })), showErrorBox: vi.fn() },
  shell: { openExternal: vi.fn() },
  clipboard: { writeText: vi.fn() },
}));

vi.mock('@sentry/electron/main', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

vi.mock('../../../src/main/analytics/events', () => ({
  trackUpdateCheck: vi.fn(),
  trackUpdateAvailable: vi.fn(),
  trackUpdateNotAvailable: vi.fn(),
  trackUpdateFailed: vi.fn(),
  trackUpdateDownloadStart: vi.fn(),
  trackUpdateDownloadComplete: vi.fn(),
  trackUpdateInstallStart: vi.fn(),
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

vi.mock('../../../src/main/updater/store', () => ({
  shouldAutoCheck: vi.fn(() => true),
  recordCheckedNow: vi.fn(),
}));

function mockHttpResponse(statusCode: number, body: string) {
  const res = new EventEmitter() as EventEmitter & { statusCode: number };
  res.statusCode = statusCode;
  setTimeout(() => {
    res.emit('data', body);
    res.emit('end');
  }, 0);
  return res;
}

const mockHttpsGet = vi.fn();
vi.mock('https', () => ({
  default: { get: (...args: unknown[]) => mockHttpsGet(...args) },
  get: (...args: unknown[]) => mockHttpsGet(...args),
}));

describe('manual-manifest', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { getBuildConfig } = await import('../../../src/main/config/build-config');
    vi.mocked(getBuildConfig).mockReturnValue({
      ...emptyConfig,
      accomplishUpdaterUrl: 'https://d.accomplish.ai',
    });
    // Default manifest — version 1.0.0 is newer than mocked app 0.3.8.
    mockHttpsGet.mockImplementation((_url: string, cb: (res: unknown) => void) => {
      cb(
        mockHttpResponse(
          200,
          `version: 1.0.0\npath: https://downloads.accomplish.ai/downloads/1.0.0/windows/Accomplish-1.0.0.exe\nsha512: abc\nreleaseDate: '2026-01-01'\n`,
        ),
      );
      return { on: vi.fn() };
    });
  });

  describe('release-contract URL (latest-<platform>.yml, no channel suffix)', () => {
    it('Windows fetches latest-win.yml', async () => {
      let fetched = '';
      mockHttpsGet.mockImplementation((url: string, cb: (res: unknown) => void) => {
        fetched = url;
        cb(mockHttpResponse(200, `version: 0.3.8\npath: https://downloads.accomplish.ai/a.exe\n`));
        return { on: vi.fn() };
      });
      const { checkForUpdatesManual } = await import('../../../src/main/updater/manual-manifest');
      await checkForUpdatesManual(true, 'win');
      expect(fetched).toBe('https://d.accomplish.ai/latest-win.yml');
    });

    it('Linux x64 fetches latest-linux.yml', async () => {
      let fetched = '';
      mockHttpsGet.mockImplementation((url: string, cb: (res: unknown) => void) => {
        fetched = url;
        cb(mockHttpResponse(200, `version: 0.3.8\npath: https://downloads.accomplish.ai/a.deb\n`));
        return { on: vi.fn() };
      });
      const { checkForUpdatesManual } = await import('../../../src/main/updater/manual-manifest');
      await checkForUpdatesManual(true, 'linux', 'x64');
      expect(fetched).toBe('https://d.accomplish.ai/latest-linux.yml');
    });

    it('Linux arm64 fetches latest-linux-arm64.yml', async () => {
      let fetched = '';
      mockHttpsGet.mockImplementation((url: string, cb: (res: unknown) => void) => {
        fetched = url;
        cb(mockHttpResponse(200, `version: 0.3.8\npath: https://downloads.accomplish.ai/a.deb\n`));
        return { on: vi.fn() };
      });
      const { checkForUpdatesManual } = await import('../../../src/main/updater/manual-manifest');
      await checkForUpdatesManual(true, 'linux', 'arm64');
      expect(fetched).toBe('https://d.accomplish.ai/latest-linux-arm64.yml');
    });

    it('trailing slash in URL does not produce a double-slash', async () => {
      const { getBuildConfig } = await import('../../../src/main/config/build-config');
      vi.mocked(getBuildConfig).mockReturnValue({
        ...emptyConfig,
        accomplishUpdaterUrl: 'https://d.accomplish.ai/test/',
      });
      let fetched = '';
      mockHttpsGet.mockImplementation((url: string, cb: (res: unknown) => void) => {
        fetched = url;
        cb(mockHttpResponse(200, `version: 0.3.8\npath: https://downloads.accomplish.ai/a.exe\n`));
        return { on: vi.fn() };
      });
      const { checkForUpdatesManual } = await import('../../../src/main/updater/manual-manifest');
      await checkForUpdatesManual(true, 'win');
      expect(fetched).toBe('https://d.accomplish.ai/test/latest-win.yml');
    });
  });

  describe('manifest parsing (js-yaml)', () => {
    it('malformed YAML silent: tracks failure, no dialog', async () => {
      mockHttpsGet.mockImplementation((_url: string, cb: (res: unknown) => void) => {
        cb(mockHttpResponse(200, '\x00\xff not valid yaml at all\x00'));
        return { on: vi.fn() };
      });
      const analytics = await import('../../../src/main/analytics/events');
      const { dialog } = await import('electron');
      const { checkForUpdatesManual } = await import('../../../src/main/updater/manual-manifest');
      await checkForUpdatesManual(true, 'win');
      expect(analytics.trackUpdateFailed).toHaveBeenCalledWith(
        'invalid_manifest',
        expect.any(String),
      );
      expect(dialog.showMessageBox).not.toHaveBeenCalled();
    });

    it('malformed YAML non-silent: shows Update Check Failed dialog', async () => {
      mockHttpsGet.mockImplementation((_url: string, cb: (res: unknown) => void) => {
        cb(mockHttpResponse(200, '\x00\xff not valid yaml at all\x00'));
        return { on: vi.fn() };
      });
      const { dialog } = await import('electron');
      const { checkForUpdatesManual } = await import('../../../src/main/updater/manual-manifest');
      await checkForUpdatesManual(false, 'win');
      expect(dialog.showMessageBox).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Update Check Failed' }),
      );
    });

    it('YAML missing version: tracked as invalid_manifest', async () => {
      mockHttpsGet.mockImplementation((_url: string, cb: (res: unknown) => void) => {
        cb(mockHttpResponse(200, `path: https://downloads.accomplish.ai/a.exe\nsha512: abc\n`));
        return { on: vi.fn() };
      });
      const analytics = await import('../../../src/main/analytics/events');
      const { checkForUpdatesManual } = await import('../../../src/main/updater/manual-manifest');
      await checkForUpdatesManual(true, 'win');
      expect(analytics.trackUpdateFailed).toHaveBeenCalledWith(
        'invalid_manifest',
        expect.any(String),
      );
    });

    it('unparseable remote version non-silent: tracks invalid_version AND shows failure dialog (never "No Updates")', async () => {
      // Release ships a manifest whose version string cannot be coerced to semver.
      // Must NOT fold into trackUpdateNotAvailable — that would tell the user they
      // are up to date when in fact the release system is broken.
      mockHttpsGet.mockImplementation((_url: string, cb: (res: unknown) => void) => {
        cb(
          mockHttpResponse(
            200,
            `version: "not-a-version"\npath: https://downloads.accomplish.ai/a.exe\n`,
          ),
        );
        return { on: vi.fn() };
      });
      const analytics = await import('../../../src/main/analytics/events');
      const { dialog } = await import('electron');
      const { checkForUpdatesManual } = await import('../../../src/main/updater/manual-manifest');
      await checkForUpdatesManual(false, 'win');
      expect(analytics.trackUpdateFailed).toHaveBeenCalledWith(
        'invalid_version',
        expect.stringContaining('not-a-version'),
      );
      expect(analytics.trackUpdateNotAvailable).not.toHaveBeenCalled();
      expect(dialog.showMessageBox).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Update Check Failed' }),
      );
      expect(dialog.showMessageBox).not.toHaveBeenCalledWith(
        expect.objectContaining({ title: 'No Updates' }),
      );
    });

    it('unparseable remote version silent: still tracked, no dialog', async () => {
      mockHttpsGet.mockImplementation((_url: string, cb: (res: unknown) => void) => {
        cb(
          mockHttpResponse(
            200,
            `version: "garbage"\npath: https://downloads.accomplish.ai/a.exe\n`,
          ),
        );
        return { on: vi.fn() };
      });
      const analytics = await import('../../../src/main/analytics/events');
      const { dialog } = await import('electron');
      const { checkForUpdatesManual } = await import('../../../src/main/updater/manual-manifest');
      await checkForUpdatesManual(true, 'win');
      expect(analytics.trackUpdateFailed).toHaveBeenCalledWith(
        'invalid_version',
        expect.stringContaining('garbage'),
      );
      expect(dialog.showMessageBox).not.toHaveBeenCalled();
    });
  });

  describe('daily-check throttle (recordCheckedNow)', () => {
    it('records after successful fetch+parse (so autoCheckForUpdates throttles next time)', async () => {
      const { recordCheckedNow } = await import('../../../src/main/updater/store');
      const { checkForUpdatesManual } = await import('../../../src/main/updater/manual-manifest');
      await checkForUpdatesManual(true, 'win');
      expect(recordCheckedNow).toHaveBeenCalledTimes(1);
    });

    it('does NOT record when fetch fails (so a transient network error retries on next launch)', async () => {
      mockHttpsGet.mockImplementation((_url: string, cb: (res: unknown) => void) => {
        cb(mockHttpResponse(500, ''));
        return { on: vi.fn() };
      });
      const { recordCheckedNow } = await import('../../../src/main/updater/store');
      const { checkForUpdatesManual } = await import('../../../src/main/updater/manual-manifest');
      await checkForUpdatesManual(true, 'win');
      expect(recordCheckedNow).not.toHaveBeenCalled();
    });

    it('does NOT record when manifest is malformed', async () => {
      mockHttpsGet.mockImplementation((_url: string, cb: (res: unknown) => void) => {
        cb(mockHttpResponse(200, '\x00garbage'));
        return { on: vi.fn() };
      });
      const { recordCheckedNow } = await import('../../../src/main/updater/store');
      const { checkForUpdatesManual } = await import('../../../src/main/updater/manual-manifest');
      await checkForUpdatesManual(true, 'win');
      expect(recordCheckedNow).not.toHaveBeenCalled();
    });

    it('does NOT record when manifest path is off-apex (so next launch retries if server is fixed)', async () => {
      // Poisoned manifest with a newer version but an attacker-controlled download URL.
      // The app rejects the manifest — and must NOT throttle the next check, because
      // the server may fix the manifest within minutes.
      mockHttpsGet.mockImplementation((_url: string, cb: (res: unknown) => void) => {
        cb(mockHttpResponse(200, `version: 9.9.9\npath: https://evil.example.com/malware.exe\n`));
        return { on: vi.fn() };
      });
      const { recordCheckedNow } = await import('../../../src/main/updater/store');
      const { checkForUpdatesManual } = await import('../../../src/main/updater/manual-manifest');
      await checkForUpdatesManual(true, 'win');
      expect(recordCheckedNow).not.toHaveBeenCalled();
    });
  });

  describe('manifest path origin validation', () => {
    it('rejects absolute path on a different apex (poisoned manifest defense)', async () => {
      // Simulated attack: manifest looks legitimate but `path:` redirects to evil host.
      mockHttpsGet.mockImplementation((_url: string, cb: (res: unknown) => void) => {
        cb(mockHttpResponse(200, `version: 9.9.9\npath: https://evil.example.com/malware.exe\n`));
        return { on: vi.fn() };
      });
      const analytics = await import('../../../src/main/analytics/events');
      const { dialog, shell } = await import('electron');
      const { checkForUpdatesManual } = await import('../../../src/main/updater/manual-manifest');
      await checkForUpdatesManual(false, 'win');
      expect(analytics.trackUpdateFailed).toHaveBeenCalledWith(
        'invalid_manifest',
        expect.stringContaining('evil.example.com'),
      );
      expect(dialog.showMessageBox).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Update Check Failed' }),
      );
      expect(shell.openExternal).not.toHaveBeenCalled();
    });

    it('accepts same-apex subdomain (downloads.accomplish.ai vs feed d.accomplish.ai)', async () => {
      mockHttpsGet.mockImplementation((_url: string, cb: (res: unknown) => void) => {
        cb(
          mockHttpResponse(
            200,
            `version: 9.9.9\npath: https://downloads.accomplish.ai/downloads/9.9.9/windows/a.exe\n`,
          ),
        );
        return { on: vi.fn() };
      });
      const { dialog } = await import('electron');
      const { checkForUpdatesManual } = await import('../../../src/main/updater/manual-manifest');
      await checkForUpdatesManual(false, 'win');
      expect(dialog.showMessageBox).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Update Available' }),
      );
    });
  });

  describe('fetchManifest synchronous-throw safety', () => {
    it('never rejects when https.get throws synchronously (e.g. malformed URL)', async () => {
      mockHttpsGet.mockImplementation(() => {
        throw new TypeError('Invalid URL');
      });
      const analytics = await import('../../../src/main/analytics/events');
      const { checkForUpdatesManual } = await import('../../../src/main/updater/manual-manifest');
      // Must not reject — contract says "never throws" regardless of URL shape.
      await expect(checkForUpdatesManual(true, 'win')).resolves.toBeUndefined();
      expect(analytics.trackUpdateFailed).toHaveBeenCalledWith('fetch_failed', expect.any(String));
    });
  });

  describe('dialog routing', () => {
    it('newer version available: shows Update Available dialog', async () => {
      const { dialog } = await import('electron');
      const { checkForUpdatesManual } = await import('../../../src/main/updater/manual-manifest');
      await checkForUpdatesManual(false, 'win');
      expect(dialog.showMessageBox).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Update Available' }),
      );
    });

    it('same version: shows No Updates dialog when not silent', async () => {
      mockHttpsGet.mockImplementation((_url: string, cb: (res: unknown) => void) => {
        cb(mockHttpResponse(200, `version: 0.3.8\npath: https://downloads.accomplish.ai/a.exe\n`));
        return { on: vi.fn() };
      });
      const { dialog } = await import('electron');
      const { checkForUpdatesManual } = await import('../../../src/main/updater/manual-manifest');
      await checkForUpdatesManual(false, 'win');
      expect(dialog.showMessageBox).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'No Updates' }),
      );
    });

    it('same version silent: no dialog', async () => {
      mockHttpsGet.mockImplementation((_url: string, cb: (res: unknown) => void) => {
        cb(mockHttpResponse(200, `version: 0.3.8\npath: https://downloads.accomplish.ai/a.exe\n`));
        return { on: vi.fn() };
      });
      const { dialog } = await import('electron');
      const { checkForUpdatesManual } = await import('../../../src/main/updater/manual-manifest');
      await checkForUpdatesManual(true, 'win');
      expect(dialog.showMessageBox).not.toHaveBeenCalled();
    });

    it('fetch 500 silent: no dialog', async () => {
      mockHttpsGet.mockImplementation((_url: string, cb: (res: unknown) => void) => {
        cb(mockHttpResponse(500, ''));
        return { on: vi.fn() };
      });
      const { dialog } = await import('electron');
      const { checkForUpdatesManual } = await import('../../../src/main/updater/manual-manifest');
      await checkForUpdatesManual(true, 'win');
      expect(dialog.showMessageBox).not.toHaveBeenCalled();
    });

    it('fetch 500 non-silent: shows Update Check Failed dialog', async () => {
      mockHttpsGet.mockImplementation((_url: string, cb: (res: unknown) => void) => {
        cb(mockHttpResponse(500, ''));
        return { on: vi.fn() };
      });
      const { dialog } = await import('electron');
      const { checkForUpdatesManual } = await import('../../../src/main/updater/manual-manifest');
      await checkForUpdatesManual(false, 'win');
      expect(dialog.showMessageBox).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Update Check Failed' }),
      );
    });

    it('Download button opens external URL from manifest', async () => {
      const { dialog, shell } = await import('electron');
      vi.mocked(dialog.showMessageBox).mockResolvedValueOnce({ response: 0 } as Awaited<
        ReturnType<typeof dialog.showMessageBox>
      >);
      const { checkForUpdatesManual } = await import('../../../src/main/updater/manual-manifest');
      await checkForUpdatesManual(false, 'win');
      expect(shell.openExternal).toHaveBeenCalledWith(
        'https://downloads.accomplish.ai/downloads/1.0.0/windows/Accomplish-1.0.0.exe',
      );
    });

    it('Copy URL button writes URL to clipboard', async () => {
      const { dialog, clipboard } = await import('electron');
      vi.mocked(dialog.showMessageBox).mockResolvedValueOnce({ response: 1 } as Awaited<
        ReturnType<typeof dialog.showMessageBox>
      >);
      const { checkForUpdatesManual } = await import('../../../src/main/updater/manual-manifest');
      await checkForUpdatesManual(false, 'win');
      expect(clipboard.writeText).toHaveBeenCalledWith(
        'https://downloads.accomplish.ai/downloads/1.0.0/windows/Accomplish-1.0.0.exe',
      );
    });
  });

  describe('URL is empty', () => {
    it('returns early without network call', async () => {
      const { getBuildConfig } = await import('../../../src/main/config/build-config');
      vi.mocked(getBuildConfig).mockReturnValue({ ...emptyConfig }); // URL empty
      const { checkForUpdatesManual } = await import('../../../src/main/updater/manual-manifest');
      await checkForUpdatesManual(false, 'win');
      expect(mockHttpsGet).not.toHaveBeenCalled();
    });
  });
});
