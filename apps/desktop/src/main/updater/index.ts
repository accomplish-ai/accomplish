/**
 * Auto-updater public API. Main-process only; dynamically imported from app-startup
 * when `isAutoUpdaterEnabled()` is true, so the OSS code path never pulls in
 * electron-updater or its transitive deps.
 *
 * Platform split:
 *   - macOS + AppImage-Linux: native electron-updater (generic provider, default
 *     `'latest'` channel → fetches `latest-mac.yml` / `latest-linux[-arch].yml`)
 *   - Windows + non-AppImage-Linux: manual path (HTTPS GET + js-yaml + semver;
 *     opens download page in browser). See manual-manifest.ts.
 *
 * initUpdater() THROWS on real init failure (lazy import / setFeedURL) so the
 * caller can skip installing the "Check for Updates…" menu. This differs from
 * the commercial port, which swallowed errors.
 *
 * Split across ./state (module state + getUpdateState/setOnUpdateDownloaded),
 * ./store (daily-check throttle), ./listeners (event handlers), ./versioning
 * (pure semver/YAML helpers), and ./manual-manifest (Win/deb-Linux orchestrator).
 */

import type { AppUpdater } from 'electron-updater';
import * as Sentry from '@sentry/electron/main';
import { app, BrowserWindow, dialog } from 'electron';
import fs from 'fs';
import path from 'path';
import { trackUpdateCheck, trackUpdateFailed, trackUpdateInstallStart } from '../analytics/events';
import { getFeedUrl } from './feed-config';
import { registerAutoUpdaterListeners } from './listeners';
import { log } from './logger';
import { checkForUpdatesManual } from './manual-manifest';
import { isTrustedUpdateInfo } from './origin';
import { getDownloadedVersion, setMainWindow, setUserCheckInFlight } from './state';
import { recordCheckedNow, shouldAutoCheck } from './store';

export { shouldAutoCheck } from './store';
export { getUpdateState, setOnUpdateDownloaded } from './state';

let _autoUpdater: AppUpdater | null = null;
async function lazyAutoUpdater(): Promise<AppUpdater> {
  if (!_autoUpdater) {
    const mod = (await import('electron-updater')) as typeof import('electron-updater') & {
      default?: { autoUpdater?: AppUpdater };
    };
    const namedAutoUpdater = Object.prototype.hasOwnProperty.call(mod, 'autoUpdater')
      ? mod.autoUpdater
      : undefined;
    const autoUpdater = namedAutoUpdater ?? mod.default?.autoUpdater;
    if (!autoUpdater) {
      throw new Error('electron-updater autoUpdater export unavailable');
    }
    _autoUpdater = autoUpdater;
  }
  return _autoUpdater;
}

export async function initUpdater(window: BrowserWindow): Promise<void> {
  setMainWindow(window);

  // Defensive — caller should gate on isAutoUpdaterEnabled(), but bail if somehow invoked without URL.
  if (!getFeedUrl()) {
    return;
  }

  // Platforms without native electron-updater. Manual path runs on demand from the menu.
  if (process.platform === 'win32') {
    return;
  }
  if (process.platform === 'linux' && !process.env.APPIMAGE) {
    return;
  }

  try {
    const autoUpdater = await lazyAutoUpdater();
    // Keep downloads under our control so native paths can validate manifest
    // download URLs before electron-updater follows them.
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;

    if (!app.isPackaged) {
      // electron-updater refuses to emit events in dev unless a dev-app-update.yml
      // exists and forceDevUpdateConfig is set. Write one so dev-mode end-to-end works.
      const appPath = app.getAppPath();
      fs.mkdirSync(appPath, { recursive: true });
      fs.writeFileSync(
        path.join(appPath, 'dev-app-update.yml'),
        `provider: generic\nurl: ${getFeedUrl()}\n`,
      );
      autoUpdater.forceDevUpdateConfig = true;
    }

    // No `channel` key: accomplish-release publishes `latest-<platform>.yml` at the
    // URL's root (or under a sub-path for non-stable channels). Default `'latest'`
    // channel in electron-updater fetches exactly that filename.
    autoUpdater.setFeedURL({ provider: 'generic', url: getFeedUrl() });

    registerAutoUpdaterListeners(autoUpdater, quitAndInstall);
  } catch (err) {
    // Capture context locally for Sentry, then re-throw so the caller skips menu installation.
    Sentry.captureException(err, { tags: { component: 'updater', phase: 'init' } });
    throw err;
  }
}

export async function checkForUpdates(silent: boolean): Promise<void> {
  // Defensive double-gate: if the URL was cleared after init, bail.
  if (!getFeedUrl()) {
    return;
  }

  if (process.platform === 'win32') {
    await checkForUpdatesManual(silent, 'win');
    return;
  }
  if (process.platform === 'linux' && !process.env.APPIMAGE) {
    const arch: 'x64' | 'arm64' = process.arch === 'arm64' ? 'arm64' : 'x64';
    await checkForUpdatesManual(silent, 'linux', arch);
    return;
  }

  try {
    setUserCheckInFlight(!silent);
    trackUpdateCheck();
    const autoUpdater = await lazyAutoUpdater();
    const result = await autoUpdater.checkForUpdates();
    if (result?.updateInfo && !isTrustedUpdateInfo(result.updateInfo, getFeedUrl())) {
      return;
    }
    recordCheckedNow();
  } catch (err: unknown) {
    setUserCheckInFlight(false);
    const message = err instanceof Error ? err.message : String(err);
    if (!silent) {
      dialog.showErrorBox('Update Check Failed', message);
    }
    log('ERROR', '[Updater] checkForUpdates failed', { err: message });
    trackUpdateFailed('check_failed', message);
    Sentry.captureException(err, { tags: { component: 'updater', phase: 'check' } });
  }
}

export async function quitAndInstall(): Promise<void> {
  trackUpdateInstallStart(getDownloadedVersion() ?? '');
  const autoUpdater = await lazyAutoUpdater();
  // isSilent=false: show OS restart UI on Windows; isForceRunAfter=true: relaunch after install.
  // app.quit() fires internally → before-quit handler runs shutdownApp() (see main/index.ts).
  autoUpdater.quitAndInstall(false, true);
}

export function autoCheckForUpdates(): void {
  // Double-gate mirrors checkForUpdates — protects against the menu firing a check
  // when the URL has been cleared or is not configured.
  if (!getFeedUrl()) {
    return;
  }
  if (!shouldAutoCheck()) {
    return;
  }
  void checkForUpdates(true);
}
