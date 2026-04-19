/**
 * Application menu. Installed only when the auto-updater is enabled (see
 * app-startup.ts — `initMenu()` runs after a successful `initUpdater()`).
 *
 * The menu exposes "Check for Updates…" (or "Restart to Update (vX.X.X)…" once
 * electron-updater has downloaded a new version). On macOS the updater item sits
 * under the app menu next to About; on Windows/Linux it sits at the top of Help.
 *
 * OSS builds never install this menu — Electron's default menu stays in place.
 */

import { app, dialog, Menu, shell } from 'electron';
import { checkForUpdates, getUpdateState, quitAndInstall, setOnUpdateDownloaded } from './updater';

export function buildAppMenu(): void {
  const isMac = process.platform === 'darwin';
  const { updateAvailable, downloadedVersion } = getUpdateState();

  const updateMenuItem: Electron.MenuItemConstructorOptions =
    updateAvailable && downloadedVersion
      ? {
          label: `Restart to Update (v${downloadedVersion})...`,
          click: () => {
            void quitAndInstall();
          },
        }
      : {
          label: 'Check for Updates...',
          click: () => {
            void checkForUpdates(false);
          },
        };

  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const },
              { type: 'separator' as const },
              updateMenuItem,
              { type: 'separator' as const },
              { role: 'services' as const },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const },
            ],
          },
        ]
      : []),
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac
          ? [{ type: 'separator' as const }, { role: 'front' as const }]
          : [{ role: 'close' as const }]),
      ],
    },
    {
      label: 'Help',
      submenu: [
        ...(!isMac ? [updateMenuItem, { type: 'separator' as const }] : []),
        { label: 'Learn More', click: () => shell.openExternal('https://accomplish.ai') },
        ...(!isMac
          ? [
              { type: 'separator' as const },
              {
                label: 'About Accomplish',
                click: async () => {
                  await dialog.showMessageBox({
                    type: 'info',
                    title: 'About Accomplish',
                    message: 'Accomplish',
                    detail: `Version ${app.getVersion()}\n\nA desktop automation assistant.\n\n© ${new Date().getFullYear()} Accomplish AI`,
                    buttons: ['OK'],
                  });
                },
              },
            ]
          : []),
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

export function refreshAppMenu(): void {
  buildAppMenu();
}

export function initMenu(): void {
  buildAppMenu();
  // After electron-updater downloads a new version, flip the menu label to "Restart to Update…".
  setOnUpdateDownloaded(() => refreshAppMenu());
}
