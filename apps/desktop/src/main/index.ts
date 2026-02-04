import { config } from 'dotenv';
import { app, BrowserWindow, shell, ipcMain, nativeImage, dialog } from 'electron';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// Hardcode userData path to ensure consistent data location across all versions
const APP_DATA_NAME = 'Accomplish';
app.setPath('userData', path.join(app.getPath('appData'), APP_DATA_NAME));

if (process.platform === 'win32') {
  app.setAppUserModelId('ai.accomplish.desktop');
}

import { registerIPCHandlers } from './ipc/handlers';
import {
  flushPendingTasks,
  getProviderSettings,
  clearProviderSettings,
  FutureSchemaError,
  stopAzureFoundryProxy,
  stopMoonshotProxy,
} from '@accomplish/core';
import { disposeTaskManager } from './opencode';
import { oauthBrowserFlow } from './opencode/auth-browser';
import { migrateLegacyData } from './store/legacyMigration';
import { initializeDatabase, closeDatabase } from './store/db';
import { getApiKey } from './store/secureStorage';
import { initializeLogCollector, shutdownLogCollector, getLogCollector } from './logging';
import { skillsManager } from './skills';

// E2E flags must be detected synchronously at module load time before app.whenReady()
if (process.argv.includes('--e2e-skip-auth')) {
  (global as Record<string, unknown>).E2E_SKIP_AUTH = true;
}
if (process.argv.includes('--e2e-mock-tasks') || process.env.E2E_MOCK_TASK_EVENTS === '1') {
  (global as Record<string, unknown>).E2E_MOCK_TASK_EVENTS = true;
}

// Use CLEAN_START env var since CLI args don't pass through vite to Electron
if (process.env.CLEAN_START === '1') {
  const userDataPath = app.getPath('userData');
  console.log('[Clean Mode] Clearing userData directory:', userDataPath);
  try {
    if (fs.existsSync(userDataPath)) {
      fs.rmSync(userDataPath, { recursive: true, force: true });
      console.log('[Clean Mode] Successfully cleared userData');
    }
  } catch (err) {
    console.error('[Clean Mode] Failed to clear userData:', err);
  }
}

app.setName('Accomplish');

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const envPath = app.isPackaged
  ? path.join(process.resourcesPath, '.env')
  : path.join(__dirname, '../../.env');
config({ path: envPath });

process.env.APP_ROOT = path.join(__dirname, '../..');

export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron');
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist');
export const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;

let mainWindow: BrowserWindow | null = null;

function getPreloadPath(): string {
  return path.join(__dirname, '../preload/index.cjs');
}

function createWindow() {
  console.log('[Main] Creating main application window');

  const iconFile = process.platform === 'win32' ? 'icon.ico' : 'icon.png';
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, iconFile)
    : path.join(process.env.APP_ROOT!, 'resources', iconFile);
  const icon = nativeImage.createFromPath(iconPath);
  if (process.platform === 'darwin' && app.dock && !icon.isEmpty()) {
    app.dock.setIcon(icon);
  }

  const preloadPath = getPreloadPath();
  console.log('[Main] Using preload script:', preloadPath);

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Accomplish',
    icon: icon.isEmpty() ? undefined : icon,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:') || url.startsWith('http:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.maximize();

  const isE2EMode = (global as Record<string, unknown>).E2E_SKIP_AUTH === true;
  if (!app.isPackaged && !isE2EMode) {
    mainWindow.webContents.openDevTools({ mode: 'right' });
  }

  if (VITE_DEV_SERVER_URL) {
    console.log('[Main] Loading from Vite dev server:', VITE_DEV_SERVER_URL);
    mainWindow.loadURL(VITE_DEV_SERVER_URL);
  } else {
    const indexPath = path.join(RENDERER_DIST, 'index.html');
    console.log('[Main] Loading from file:', indexPath);
    mainWindow.loadFile(indexPath);
  }
}

// Log to file only to avoid recursive EIO errors when stdout is unavailable
process.on('uncaughtException', (error) => {
  try {
    const collector = getLogCollector();
    collector.log('ERROR', 'main', `Uncaught exception: ${error.message}`, {
      name: error.name,
      stack: error.stack,
    });
  } catch {}
});

process.on('unhandledRejection', (reason) => {
  try {
    const collector = getLogCollector();
    collector.log('ERROR', 'main', 'Unhandled promise rejection', { reason });
  } catch {}
});

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  console.log('[Main] Second instance attempted; quitting');
  app.quit();
} else {
  initializeLogCollector();
  getLogCollector().logEnv('INFO', 'App starting', {
    version: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.version,
  });

  app.on('second-instance', (_event, commandLine) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
      console.log('[Main] Focused existing instance after second-instance event');

      if (process.platform === 'win32') {
        const protocolUrl = commandLine.find((arg) => arg.startsWith('accomplish://'));
        if (protocolUrl) {
          console.log('[Main] Received protocol URL from second-instance:', protocolUrl);
          if (protocolUrl.startsWith('accomplish://callback')) {
            mainWindow.webContents.send('auth:callback', protocolUrl);
          }
        }
      }
    }
  });

  app.whenReady().then(async () => {
    console.log('[Main] Electron app ready, version:', app.getVersion());

    try {
      const didMigrate = migrateLegacyData();
      if (didMigrate) {
        console.log('[Main] Migrated data from legacy userData path');
      }
    } catch (err) {
      console.error('[Main] Legacy data migration failed:', err);
    }

    try {
      initializeDatabase();
    } catch (err) {
      if (err instanceof FutureSchemaError) {
        await dialog.showMessageBox({
          type: 'error',
          title: 'Update Required',
          message: `This data was created by a newer version of Accomplish (schema v${err.storedVersion}).`,
          detail: `Your app supports up to schema v${err.appVersion}. Please update Accomplish to continue.`,
          buttons: ['Quit'],
        });
        app.quit();
        return;
      }
      throw err;
    }

    // Clear provider settings if DB says api_key auth but key is missing from secure storage
    try {
      const settings = getProviderSettings();
      for (const [providerId, provider] of Object.entries(settings.connectedProviders)) {
        if (provider?.credentials?.type === 'api_key') {
          const key = getApiKey(providerId);
          if (!key) {
            console.warn(`[Main] Provider ${providerId} has api_key auth but key not found in secure storage`);
            clearProviderSettings();
            console.log('[Main] Cleared provider settings due to missing API keys');
            break;
          }
        }
      }
    } catch (err) {
      console.error('[Main] Provider validation failed:', err);
    }

    await skillsManager.initialize();

    if (process.platform === 'darwin' && app.dock) {
      const iconPath = app.isPackaged
        ? path.join(process.resourcesPath, 'icon.png')
        : path.join(process.env.APP_ROOT!, 'resources', 'icon.png');
      const icon = nativeImage.createFromPath(iconPath);
      if (!icon.isEmpty()) {
        app.dock.setIcon(icon);
      }
    }

    registerIPCHandlers();
    console.log('[Main] IPC handlers registered');

    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
        console.log('[Main] Application reactivated; recreated window');
      }
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  flushPendingTasks();
  disposeTaskManager();
  oauthBrowserFlow.dispose();
  stopAzureFoundryProxy().catch((err) => {
    console.error('[Main] Failed to stop Azure Foundry proxy:', err);
  });
  stopMoonshotProxy().catch((err) => {
    console.error('[Main] Failed to stop Moonshot proxy:', err);
  });
  closeDatabase();
  shutdownLogCollector();
});

// On Windows in dev mode, pass the script path for protocol registration
if (process.platform === 'win32' && !app.isPackaged) {
  app.setAsDefaultProtocolClient('accomplish', process.execPath, [
    path.resolve(process.argv[1]),
  ]);
} else {
  app.setAsDefaultProtocolClient('accomplish');
}

function handleProtocolUrlFromArgs(): void {
  if (process.platform === 'win32') {
    const protocolUrl = process.argv.find((arg) => arg.startsWith('accomplish://'));
    if (protocolUrl) {
      app.whenReady().then(() => {
        setTimeout(() => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            if (protocolUrl.startsWith('accomplish://callback')) {
              mainWindow.webContents.send('auth:callback', protocolUrl);
            }
          }
        }, 1000);
      });
    }
  }
}

handleProtocolUrlFromArgs();

app.on('open-url', (event, url) => {
  event.preventDefault();
  if (url.startsWith('accomplish://callback')) {
    mainWindow?.webContents?.send('auth:callback', url);
  }
});

ipcMain.handle('app:version', () => {
  return app.getVersion();
});

ipcMain.handle('app:platform', () => {
  return process.platform;
});

ipcMain.handle('app:is-e2e-mode', () => {
  return (global as Record<string, unknown>).E2E_MOCK_TASK_EVENTS === true ||
    process.env.E2E_MOCK_TASK_EVENTS === '1';
});
