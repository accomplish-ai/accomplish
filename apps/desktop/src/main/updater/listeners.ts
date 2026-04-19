/**
 * electron-updater event-handler registration. Split out so updater/index.ts
 * can stay focused on lifecycle orchestration (init, setFeedURL, check, quit)
 * and stay under the per-file LOC cap.
 *
 * Handlers mutate state through updater/state.ts and fire analytics + logs
 * through the standard wrappers — nothing here is updater-internal state.
 */

import type { AppUpdater, UpdateInfo } from 'electron-updater';
import { app, dialog } from 'electron';
import {
  trackUpdateAvailable,
  trackUpdateDownloadComplete,
  trackUpdateDownloadStart,
  trackUpdateFailed,
  trackUpdateNotAvailable,
} from '../analytics/events';
import { showUpdateCheckFailedDialog, showUpdateReadyDialog } from './dialogs';
import { getFeedUrl } from './feed-config';
import { log } from './logger';
import { isTrustedUpdateInfo } from './origin';
import {
  getMainWindow,
  getUserCheckInFlight,
  invokeOnUpdateDownloaded,
  setDownloadedVersion,
  setUserCheckInFlight,
  setUpdateAvailable,
} from './state';

/**
 * Wire the five electron-updater lifecycle events. Caller passes `quitAndInstall`
 * so the update-downloaded dialog's "Restart Now" button can trigger it without
 * a circular import.
 */
export function registerAutoUpdaterListeners(
  autoUpdater: AppUpdater,
  quitAndInstall: () => Promise<void>,
): void {
  autoUpdater.on('update-available', (info: UpdateInfo) => {
    const shouldNotifyUpdateAvailable = getUserCheckInFlight();
    setUserCheckInFlight(false);
    if (!isTrustedUpdateInfo(info, getFeedUrl())) {
      setUpdateAvailable(null);
      log('WARN', '[Updater] Rejected update with untrusted download URL', {
        version: info.version,
      });
      trackUpdateFailed(
        'invalid_manifest',
        `Native update manifest contains untrusted download URL for version ${info.version}`,
      );
      if (shouldNotifyUpdateAvailable) {
        void showUpdateCheckFailedDialog();
      }
      return;
    }
    setUpdateAvailable(info);
    log('INFO', '[Updater] update-available', { version: info.version });
    trackUpdateAvailable(app.getVersion(), info.version);
    trackUpdateDownloadStart(info.version);
    if (shouldNotifyUpdateAvailable) {
      void dialog.showMessageBox({
        type: 'info',
        title: 'Update Available',
        message: `Version ${info.version} is available.`,
        detail:
          'Accomplish is downloading the update in the background. You will be prompted to restart when it is ready.',
        buttons: ['OK'],
      });
    }
    void autoUpdater.downloadUpdate().catch((error: Error) => {
      log('ERROR', '[Updater] downloadUpdate failed', { err: error.message });
      trackUpdateFailed(error.name || 'download_failed', error.message);
    });
  });

  autoUpdater.on('update-not-available', async () => {
    trackUpdateNotAvailable();
    if (!getUserCheckInFlight()) {
      return;
    }
    setUserCheckInFlight(false);
    await dialog.showMessageBox({
      type: 'info',
      title: 'No Updates',
      message: `You're up to date!`,
      detail: `Accomplish ${app.getVersion()} is the latest version.`,
      buttons: ['OK'],
    });
  });

  autoUpdater.on('download-progress', (progress) => {
    getMainWindow()?.setProgressBar(progress.percent / 100);
  });

  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    log('INFO', '[Updater] update-downloaded', { version: info.version });
    getMainWindow()?.setProgressBar(-1);
    setDownloadedVersion(info.version);
    trackUpdateDownloadComplete(info.version);
    invokeOnUpdateDownloaded();
    void showUpdateReadyDialog(info.version, quitAndInstall);
  });

  autoUpdater.on('error', (error: Error) => {
    setUserCheckInFlight(false);
    getMainWindow()?.setProgressBar(-1);
    log('ERROR', '[Updater] error', { err: error.message });
    trackUpdateFailed(error.name || 'unknown_error', error.message);
  });
}
