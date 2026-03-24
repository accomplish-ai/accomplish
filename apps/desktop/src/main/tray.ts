import { app, BrowserWindow, Menu, Tray, nativeImage } from 'electron';
import path from 'path';
import { isAutoStartEnabled, enableAutoStart, disableAutoStart } from './daemon/service-manager';

let tray: Tray | null = null;
let activeTaskCount = 0;

function getIconPath(): string {
  const iconFile = process.platform === 'win32' ? 'icon.ico' : 'icon.png';
  if (app.isPackaged) {
    return path.join(process.resourcesPath, iconFile);
  }
  return path.join(process.env.APP_ROOT!, 'resources', iconFile);
}

function buildContextMenu(mainWindow: BrowserWindow | null): Menu {
  const taskLabel = activeTaskCount > 0 ? `Active Tasks: ${activeTaskCount}` : 'No Active Tasks';

  const autoStartChecked = isAutoStartEnabled();

  return Menu.buildFromTemplate([
    {
      label: 'Show Accomplish',
      click: () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    { type: 'separator' },
    { label: taskLabel, enabled: false },
    { type: 'separator' },
    {
      label: 'Start at Login',
      type: 'checkbox',
      checked: autoStartChecked,
      click: (menuItem) => {
        if (menuItem.checked) {
          enableAutoStart();
        } else {
          disableAutoStart();
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.quit();
      },
    },
  ]);
}

export function createTray(mainWindow: BrowserWindow | null): Tray {
  const iconPath = getIconPath();
  const icon = nativeImage.createFromPath(iconPath);

  // Resize for tray (16x16 on most platforms, 22x22 on Linux)
  const trayIcon =
    process.platform === 'linux'
      ? icon.resize({ width: 22, height: 22 })
      : icon.resize({ width: 16, height: 16 });

  tray = new Tray(trayIcon);
  tray.setToolTip('Accomplish');
  tray.setContextMenu(buildContextMenu(mainWindow));

  tray.on('click', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    }
  });

  return tray;
}

export function updateTaskCount(count: number, mainWindow: BrowserWindow | null): void {
  activeTaskCount = count;
  if (tray && !tray.isDestroyed()) {
    tray.setContextMenu(buildContextMenu(mainWindow));
    const tooltip = count > 0 ? `Accomplish — ${count} task(s) running` : 'Accomplish';
    tray.setToolTip(tooltip);
  }
}

export function destroyTray(): void {
  if (tray && !tray.isDestroyed()) {
    tray.destroy();
    tray = null;
  }
}
/**
 * Update the tray icon/tooltip to reflect current task state.
 * Called when a task starts, completes, or fails.
 */
export function updateTray(): void {
  if (tray && !tray.isDestroyed()) {
    tray.setContextMenu(buildContextMenu(null));
  }
}
