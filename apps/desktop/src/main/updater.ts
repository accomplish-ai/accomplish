import { autoUpdater, UpdateInfo } from 'electron-updater';
import { app, BrowserWindow, dialog, shell, clipboard } from 'electron';
import { getLastUpdateCheck, setLastUpdateCheck } from './store/appSettings';
import { disposeTaskManagerAsync } from './opencode/task-manager';
import * as analytics from './analytics';
import https from 'https';

// Update server base URL
const UPDATE_SERVER_URL = 'https://downloads.openwork.me';

// Windows update info from yml
interface WindowsUpdateInfo {
  version: string;
  path: string;
  sha512: string;
  releaseDate: string;
}

/**
 * Fetch and parse the latest-win.yml manifest
 */
async function fetchWindowsUpdateInfo(): Promise<WindowsUpdateInfo | null> {
  return new Promise((resolve) => {
    const url = `${UPDATE_SERVER_URL}/latest-win.yml`;

    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        console.error(`[Updater] Failed to fetch latest-win.yml: ${res.statusCode}`);
        resolve(null);
        return;
      }

      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          // Parse simple yml format (key: value lines)
          const lines = data.split('\n');
          const info: Partial<WindowsUpdateInfo> = {};

          for (const line of lines) {
            const match = line.match(/^(\w+):\s*['"]?([^'"]+)['"]?\s*$/);
            if (match) {
              const [, key, value] = match;
              if (key === 'version') info.version = value;
              if (key === 'path') info.path = value;
              if (key === 'sha512') info.sha512 = value;
              if (key === 'releaseDate') info.releaseDate = value;
            }
          }

          if (info.version && info.path) {
            resolve(info as WindowsUpdateInfo);
          } else {
            console.error('[Updater] Invalid latest-win.yml format');
            resolve(null);
          }
        } catch (error) {
          console.error('[Updater] Failed to parse latest-win.yml:', error);
          resolve(null);
        }
      });
    }).on('error', (error) => {
      console.error('[Updater] Failed to fetch latest-win.yml:', error);
      resolve(null);
    });
  });
}

/**
 * Compare semantic versions
 * Returns: 1 if a > b, -1 if a < b, 0 if equal
 */
function compareVersions(a: string, b: string): number {
  const partsA = a.split('.').map(Number);
  const partsB = b.split('.').map(Number);

  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const numA = partsA[i] || 0;
    const numB = partsB[i] || 0;
    if (numA > numB) return 1;
    if (numA < numB) return -1;
  }
  return 0;
}

/**
 * Show update available dialog with download URL (Windows)
 */
async function showWindowsUpdateDialog(
  currentVersion: string,
  newVersion: string,
  downloadUrl: string
): Promise<void> {
  const response = await dialog.showMessageBox({
    type: 'info',
    title: 'Update Available',
    message: `A new version of Openwork is available!`,
    detail: `Version ${newVersion} is available.\nYou are currently on version ${currentVersion}.\n\nClick "Download" to open the download page in your browser.`,
    buttons: ['Download', 'Copy URL', 'Later'],
    defaultId: 0,
    cancelId: 2,
  });

  if (response.response === 0) {
    // Open in Browser
    await shell.openExternal(downloadUrl);
  } else if (response.response === 1) {
    // Copy URL
    clipboard.writeText(downloadUrl);
  }
}

/**
 * Check for updates on Windows by fetching latest-win.yml
 */
async function checkForUpdatesWindows(silent: boolean): Promise<void> {
  const currentVersion = app.getVersion();

  // Send analytics event
  sendUpdateEvent('update_check', {
    version: currentVersion,
    platform: process.platform,
    arch: process.arch,
  });
  analytics.trackUpdateCheck();

  const updateInfo = await fetchWindowsUpdateInfo();

  if (!updateInfo) {
    if (!silent) {
      await dialog.showMessageBox({
        type: 'error',
        title: 'Update Check Failed',
        message: 'Could not check for updates',
        detail: 'Failed to fetch update information. Please try again later.',
        buttons: ['OK'],
      });
    }
    sendUpdateEvent('update_failed', {
      version: currentVersion,
      errorType: 'FetchError',
      errorMessage: 'Failed to fetch latest-win.yml',
    });
    analytics.trackUpdateFailed(currentVersion, 'FetchError', 'Failed to fetch latest-win.yml');
    return;
  }

  const isNewer = compareVersions(updateInfo.version, currentVersion) > 0;

  if (!isNewer) {
    sendUpdateEvent('update_not_available', {
      version: currentVersion,
    });
    analytics.trackUpdateNotAvailable(currentVersion);

    if (!silent) {
      await dialog.showMessageBox({
        type: 'info',
        title: 'No Updates',
        message: `You're up to date!`,
        detail: `Openwork ${currentVersion} is the latest version.`,
        buttons: ['OK'],
      });
    }
    return;
  }

  // Update available
  // Check if path is already a full URL (starts with http:// or https://)
  const downloadUrl = updateInfo.path.startsWith('http://') || updateInfo.path.startsWith('https://')
    ? updateInfo.path
    : `${UPDATE_SERVER_URL}/${updateInfo.path}`;

  // Store update info for state tracking
  updateAvailable = {
    version: updateInfo.version,
    releaseDate: updateInfo.releaseDate,
  } as UpdateInfo;

  sendUpdateEvent('update_available', {
    currentVersion,
    newVersion: updateInfo.version,
  });
  analytics.trackUpdateAvailable(currentVersion, updateInfo.version);

  // Show dialog with URL (both silent and non-silent show it on Windows)
  await showWindowsUpdateDialog(currentVersion, updateInfo.version, downloadUrl);
}

// Configure auto-updater (used for macOS/Linux)
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true; // Install pending update on next app quit/launch

// Update state
let updateAvailable: UpdateInfo | null = null;
let downloadedVersion: string | null = null;
let mainWindow: BrowserWindow | null = null;
let onUpdateDownloaded: (() => void) | null = null;

/**
 * Set callback to be called when an update is downloaded
 * Used to refresh the menu with updated label
 */
export function setOnUpdateDownloaded(callback: () => void): void {
  onUpdateDownloaded = callback;
}

/**
 * Initialize the updater with the main window reference
 */
export function initUpdater(window: BrowserWindow): void {
  mainWindow = window;

  // Configure feed URL to Cloudflare R2 update server
  // Squirrel.Windows expects RELEASES file and .nupkg packages
  // macOS/Linux use latest.yml / latest-mac.yml
  autoUpdater.setFeedURL({
    provider: 'generic',
    url: 'https://downloads.openwork.me',
  });

  // Event handlers
  autoUpdater.on('update-available', (info: UpdateInfo) => {
    updateAvailable = info;
    sendUpdateEvent('update_available', {
      currentVersion: app.getVersion(),
      newVersion: info.version,
    });
    // Track analytics
    analytics.trackUpdateAvailable(app.getVersion(), info.version);
  });

  autoUpdater.on('update-not-available', () => {
    sendUpdateEvent('update_not_available', {
      version: app.getVersion(),
    });
    // Track analytics
    analytics.trackUpdateNotAvailable(app.getVersion());
  });

  autoUpdater.on('download-progress', (progress) => {
    sendUpdateEvent('update_download_progress', {
      percent: progress.percent,
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total,
    });
  });

  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    downloadedVersion = info.version;
    sendUpdateEvent('update_download_complete', {
      newVersion: info.version,
    });
    // Track analytics
    analytics.trackUpdateDownloadComplete(info.version);
    // Notify that update is downloaded (e.g., to refresh menu)
    if (onUpdateDownloaded) {
      onUpdateDownloaded();
    }
  });

  autoUpdater.on('error', (error: Error) => {
    sendUpdateEvent('update_failed', {
      version: app.getVersion(),
      errorType: error.name,
      errorMessage: error.message,
    });
    // Track analytics
    analytics.trackUpdateFailed(app.getVersion(), error.name, error.message);
  });
}

/**
 * Send update event to renderer for analytics tracking
 */
function sendUpdateEvent(type: string, data: Record<string, unknown>): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update:event', { type, ...data });
  }
}

/**
 * Check for updates
 * @param silent - If true, don't show dialogs for "no update" or errors
 */
export async function checkForUpdates(silent: boolean = false): Promise<void> {
  // Windows uses a different update flow - fetch yml and show download URL
  if (process.platform === 'win32') {
    await checkForUpdatesWindows(silent);
    return;
  }

  // macOS/Linux: Use electron-updater
  // Send analytics event (to renderer for UI and track directly)
  sendUpdateEvent('update_check', {
    version: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
  });
  analytics.trackUpdateCheck();

  try {
    const result = await autoUpdater.checkForUpdates();

    if (!result || !result.updateInfo) {
      if (!silent) {
        await dialog.showMessageBox({
          type: 'info',
          title: 'No Updates',
          message: `You're up to date!`,
          detail: `Openwork ${app.getVersion()} is the latest version.`,
          buttons: ['OK'],
        });
      }
      return;
    }

    // Update available - prompt user (only if not silent)
    if (updateAvailable && !silent) {
      const response = await dialog.showMessageBox({
        type: 'info',
        title: 'Update Available',
        message: `A new version of Openwork is available!`,
        detail: `Version ${updateAvailable.version} is ready to download.\n\nYou are currently on version ${app.getVersion()}.`,
        buttons: ['Download', 'Later'],
        defaultId: 0,
        cancelId: 1,
      });

      if (response.response === 0) {
        downloadUpdate();
      }
    } else if (!silent) {
      // No update available - show "up to date" dialog
      await dialog.showMessageBox({
        type: 'info',
        title: 'No Updates',
        message: `You're up to date!`,
        detail: `Openwork ${app.getVersion()} is the latest version.`,
        buttons: ['OK'],
      });
    }
  } catch (error) {
    console.error('[Updater] Check failed:', error);
    if (!silent) {
      await dialog.showMessageBox({
        type: 'error',
        title: 'Update Check Failed',
        message: 'Could not check for updates',
        detail: error instanceof Error ? error.message : 'Unknown error',
        buttons: ['OK'],
      });
    }
  }
}

/**
 * Download the available update
 * Uses native auto-updater for all platforms (Squirrel on Windows, Sparkle-like on macOS)
 */
export function downloadUpdate(): void {
  if (!updateAvailable) {
    console.warn('[Updater] No update available to download');
    return;
  }

  sendUpdateEvent('update_download_start', {
    newVersion: updateAvailable.version,
  });
  // Track analytics
  analytics.trackUpdateDownloadStart(updateAvailable.version);

  autoUpdater.downloadUpdate();
}

/**
 * Quit and install the downloaded update
 */
export async function quitAndInstall(): Promise<void> {
  if (!downloadedVersion) {
    console.warn('[Updater] No update downloaded to install');
    return;
  }

  sendUpdateEvent('update_install_start', {
    newVersion: downloadedVersion,
  });
  // Track analytics
  analytics.trackUpdateInstallStart(downloadedVersion);

  // Dispose all running tasks with timeout before quitting
  // This ensures PTY processes are killed quickly rather than hanging
  try {
    console.log('[Updater] Disposing tasks before quit...');
    await disposeTaskManagerAsync(2000);
    console.log('[Updater] Tasks disposed successfully');
  } catch (error) {
    console.error('[Updater] Task disposal error:', error);
    // Continue with quit even if disposal fails
  }

  // Give analytics time to send
  await new Promise((resolve) => setTimeout(resolve, 500));

  autoUpdater.quitAndInstall();
}

/**
 * Show dialog prompting user to restart for update
 */
export async function promptRestart(): Promise<void> {
  if (!downloadedVersion) return;

  const response = await dialog.showMessageBox({
    type: 'info',
    title: 'Update Ready',
    message: 'Update ready to install',
    detail: `Openwork ${downloadedVersion} has been downloaded.\n\nRestart now to complete the update.`,
    buttons: ['Restart Now', 'Later'],
    defaultId: 0,
    cancelId: 1,
  });

  if (response.response === 0) {
    await quitAndInstall();
  }
}

/**
 * Check if auto-check is due (first launch or > 7 days since last check)
 */
export function shouldAutoCheck(): boolean {
  const lastCheck = getLastUpdateCheck();
  if (!lastCheck) return true; // First launch

  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  return Date.now() - lastCheck > sevenDaysMs;
}

/**
 * Perform silent auto-check on app launch
 */
export async function autoCheckForUpdates(): Promise<void> {
  if (!shouldAutoCheck()) {
    console.log('[Updater] Skipping auto-check, last check was recent');
    return;
  }

  console.log('[Updater] Performing auto-check for updates');

  // Save check timestamp - only for auto-checks, not manual checks
  setLastUpdateCheck(Date.now());

  // Windows: checkForUpdates handles showing the URL dialog
  if (process.platform === 'win32') {
    await checkForUpdates(false); // Not silent - show dialog if update available
    return;
  }

  // macOS/Linux: Silent check, then prompt if update available
  await checkForUpdates(true); // silent mode

  // If update available, prompt user (don't auto-download without consent)
  if (updateAvailable) {
    const response = await dialog.showMessageBox({
      type: 'info',
      title: 'Update Available',
      message: `A new version of Openwork is available!`,
      detail: `Version ${updateAvailable.version} is ready to download.\n\nYou are currently on version ${app.getVersion()}.`,
      buttons: ['Download', 'Later'],
      defaultId: 0,
      cancelId: 1,
    });

    if (response.response === 0) {
      downloadUpdate();
    }
  }
}

/**
 * Get current update state
 */
export function getUpdateState(): {
  updateAvailable: boolean;
  downloadedVersion: string | null;
  availableVersion: string | null;
} {
  return {
    updateAvailable: updateAvailable !== null,
    downloadedVersion,
    availableVersion: updateAvailable?.version || null,
  };
}
