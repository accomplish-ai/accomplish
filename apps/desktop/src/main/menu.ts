import { Menu, app, shell, dialog, MenuItemConstructorOptions } from 'electron';
import { checkForUpdates, getUpdateState, promptRestart, quitAndInstall } from './updater';

/**
 * Get the appropriate label for the update menu item based on current state
 */
function getUpdateMenuLabel(): string {
  const state = getUpdateState();
  if (state.downloadedVersion) {
    return `Restart to Update (v${state.downloadedVersion})...`;
  }
  return 'Check for Updates...';
}

/**
 * Create and set the application menu
 */
export function createAppMenu(): void {
  const isMac = process.platform === 'darwin';
  const state = getUpdateState();

  const template: MenuItemConstructorOptions[] = [
    // App menu (macOS only)
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const },
              {
                label: getUpdateMenuLabel(),
                click: async () => {
                  const currentState = getUpdateState();
                  if (currentState.downloadedVersion) {
                    // Update already downloaded, install it
                    await quitAndInstall();
                  } else {
                    // Check for updates
                    await checkForUpdates(false);
                  }
                },
              },
              { type: 'separator' as const },
              { role: 'services' as const },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const },
            ],
          } as MenuItemConstructorOptions,
        ]
      : []),

    // Edit menu
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        ...(isMac
          ? [
              { role: 'pasteAndMatchStyle' as const },
              { role: 'delete' as const },
              { role: 'selectAll' as const },
            ]
          : [
              { role: 'delete' as const },
              { type: 'separator' as const },
              { role: 'selectAll' as const },
            ]),
      ],
    },

    // View menu
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

    // Window menu
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac
          ? [
              { type: 'separator' as const },
              { role: 'front' as const },
              { type: 'separator' as const },
              { role: 'window' as const },
            ]
          : [{ role: 'close' as const }]),
      ],
    },

    // Help menu
    {
      role: 'help',
      submenu: [
        // Add update menu item for Windows (macOS has it in app menu)
        // On Windows, updates open browser for download, so no "Restart to Update" state
        ...(!isMac
          ? [
              {
                label: 'Check for Updates...',
                click: async () => {
                  await checkForUpdates(false);
                },
              },
              { type: 'separator' as const },
            ]
          : []),
        {
          label: 'Contact Support',
          click: async () => {
            await shell.openExternal('mailto:openwork-support@accomplish.ai');
          },
        },
        {
          label: 'Visit Website',
          click: async () => {
            await shell.openExternal('https://openwork.ai');
          },
        },
        // About menu item for Windows/Linux (macOS uses role: 'about' in app menu)
        ...(!isMac
          ? [
              { type: 'separator' as const },
              {
                label: 'About Openwork',
                click: async () => {
                  await dialog.showMessageBox({
                    type: 'info',
                    title: 'About Openwork',
                    message: 'Openwork',
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

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

/**
 * Refresh the application menu to update dynamic labels (e.g., update status)
 */
export function refreshAppMenu(): void {
  createAppMenu();
}
