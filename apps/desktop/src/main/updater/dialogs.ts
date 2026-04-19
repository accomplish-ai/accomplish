/**
 * Native dialog wrappers for the auto-updater. All copy is platform-agnostic —
 * the "Download the latest installer" wording works for macOS/Windows/Linux users
 * regardless of package format (AppImage / deb / dmg / NSIS / extracted tarball).
 */

import { app, clipboard, dialog, shell } from 'electron';

/**
 * "Update Ready" dialog — shown after electron-updater has downloaded a new version
 * in the background. Offers to restart now or later.
 */
export async function showUpdateReadyDialog(
  version: string,
  quitAndInstall: () => Promise<void>,
): Promise<void> {
  const { response } = await dialog.showMessageBox({
    type: 'info',
    title: 'Update Ready',
    message: `Version ${version} has been downloaded.`,
    detail: 'The update will be installed when you restart the app. Would you like to restart now?',
    buttons: ['Restart Now', 'Later'],
    defaultId: 0,
    cancelId: 1,
  });
  if (response === 0) {
    await quitAndInstall();
  }
}

/**
 * "No Updates" dialog — shown when a user-initiated check finds nothing new.
 * Silent auto-checks never reach this dialog.
 */
export async function showNoUpdatesDialog(): Promise<void> {
  await dialog.showMessageBox({
    type: 'info',
    title: 'No Updates',
    message: `You're up to date!`,
    detail: `Accomplish ${app.getVersion()} is the latest version.`,
    buttons: ['OK'],
  });
}

/**
 * "Update Check Failed" dialog — shown on fetch failure, manifest parse failure,
 * or unparseable version strings during a user-initiated check. Silent checks
 * never reach this dialog (error is still tracked).
 */
export async function showUpdateCheckFailedDialog(): Promise<void> {
  await dialog.showMessageBox({
    type: 'error',
    title: 'Update Check Failed',
    message: 'Could not check for updates',
    detail: 'Failed to fetch update information. Please try again later.',
    buttons: ['OK'],
  });
}

/**
 * "Update Available" dialog for the manual path (Windows / non-AppImage Linux),
 * where the app cannot auto-install. Offers Download / Copy URL / Later.
 */
export async function showManualUpdateDialog(
  currentVersion: string,
  newVersion: string,
  downloadUrl: string,
): Promise<void> {
  const response = await dialog.showMessageBox({
    type: 'info',
    title: 'Update Available',
    message: `A new version of Accomplish is available!`,
    detail:
      `Version ${newVersion} is available.\n` +
      `You are currently on version ${currentVersion}.\n\n` +
      `Click "Download" to open the download page in your browser.`,
    buttons: ['Download', 'Copy URL', 'Later'],
    defaultId: 0,
    cancelId: 2,
  });

  if (response.response === 0) {
    await shell.openExternal(downloadUrl);
  } else if (response.response === 1) {
    clipboard.writeText(downloadUrl);
  }
}
