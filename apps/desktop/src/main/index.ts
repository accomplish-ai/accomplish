import { config } from 'dotenv';
import { app, BrowserWindow, shell, ipcMain, nativeImage, dialog } from 'electron';
import path from 'path';
import fs from 'fs';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

// Handle Squirrel.Windows startup events FIRST - before anything else
// These events fire during install/update/uninstall and the app must exit immediately
//
// Squirrel lifecycle:
// 1. --squirrel-install: Called during initial installation
// 2. --squirrel-updated: Called after an update is applied (new version launching)
// 3. --squirrel-uninstall: Called when user uninstalls the app
// 4. --squirrel-obsolete: Called on the OLD version when a new version takes over
// 5. --squirrel-firstrun: Called on first launch after installation (app should continue)
//
// IMPORTANT: For install/update/uninstall, we must:
// - Use spawnSync (not spawn) to ensure shortcuts are created before app exits
// - Register protocol handler during install so accomplish:// links work immediately
// - Exit with process.exit(0) to signal successful handling to the installer
if (process.platform === 'win32') {
  const squirrelCommand = process.argv[1];

  if (squirrelCommand?.startsWith('--squirrel-')) {
    // Prevent multiple app instances from handling Squirrel events concurrently.
    // This addresses the multi-click installer problem where users rapidly clicking
    // the installer can spawn multiple app instances that race to create shortcuts.
    // Note: This doesn't prevent multiple Setup.exe instances (that's Squirrel's job),
    // but it ensures only one app instance processes the install/update/uninstall event.
    const gotSquirrelLock = app.requestSingleInstanceLock();
    if (!gotSquirrelLock) {
      // Another instance is already handling this Squirrel event
      process.exit(0);
    }

    const updateExe = path.resolve(path.dirname(process.execPath), '..', 'Update.exe');
    const exeName = path.basename(process.execPath);
    const updateExeExists = fs.existsSync(updateExe);

    if (squirrelCommand === '--squirrel-install') {
      // First-time installation: create shortcuts and register protocol
      if (updateExeExists) {
        const result = spawnSync(updateExe, ['--createShortcut=' + exeName], {
          timeout: 30000,
          windowsHide: true,
        });
        if (result.error) {
          console.error('[Squirrel] Failed to create shortcuts:', result.error.message);
        }
      } else {
        console.warn('[Squirrel] Update.exe not found at:', updateExe);
      }

      // Register protocol handler during install so accomplish:// links work
      // even before the user launches the app manually for the first time.
      // This is critical for OAuth callbacks to work immediately after install.
      app.setAsDefaultProtocolClient('accomplish');

      app.quit();
      process.exit(0);
    } else if (squirrelCommand === '--squirrel-updated') {
      // App was updated: refresh shortcuts (exe path may have changed)
      if (updateExeExists) {
        const result = spawnSync(updateExe, ['--createShortcut=' + exeName], {
          timeout: 30000,
          windowsHide: true,
        });
        if (result.error) {
          console.error('[Squirrel] Failed to update shortcuts:', result.error.message);
        }
      }

      // Re-register protocol handler after update in case the exe path changed
      app.setAsDefaultProtocolClient('accomplish');

      app.quit();
      process.exit(0);
    } else if (squirrelCommand === '--squirrel-uninstall') {
      // App is being uninstalled: remove shortcuts and unregister protocol
      if (updateExeExists) {
        const result = spawnSync(updateExe, ['--removeShortcut=' + exeName], {
          timeout: 30000,
          windowsHide: true,
        });
        if (result.error) {
          console.error('[Squirrel] Failed to remove shortcuts:', result.error.message);
        }
      }

      // Unregister protocol handler so accomplish:// links don't point to deleted app
      app.removeAsDefaultProtocolClient('accomplish');

      app.quit();
      process.exit(0);
    } else if (squirrelCommand === '--squirrel-obsolete') {
      // Old version is being replaced by a new version - just exit immediately
      app.quit();
      process.exit(0);
    } else if (squirrelCommand === '--squirrel-firstrun') {
      // First launch after installation - app should continue running normally.
      // This is a good place to show a welcome screen or run first-time setup,
      // but for now we just log it and let the app start as usual.
      console.log('[Squirrel] First run after installation');
      // Don't quit - let the app continue to start normally
    }
  }
}

// Data schema version - increment when stored data formats change
// This gives users a clean slate by using a new userData directory
const DATA_SCHEMA_VERSION = 2;
app.setPath('userData', `${app.getPath('userData')}-v${DATA_SCHEMA_VERSION}`);

import { registerIPCHandlers } from './ipc/handlers';
import { flushPendingTasks } from './store/taskHistory';
import { disposeTaskManager } from './opencode/task-manager';
import { checkAndCleanupFreshInstall } from './store/freshInstallCleanup';
import { initializeDatabase, closeDatabase } from './store/db';
import { getProviderSettings, clearProviderSettings } from './store/repositories/providerSettings';
import { getApiKey } from './store/secureStorage';
import { FutureSchemaError } from './store/migrations/errors';
import { stopAzureFoundryProxy } from './opencode/azure-foundry-proxy';
import { stopMoonshotProxy } from './opencode/moonshot-proxy';
import { initializeLogCollector, shutdownLogCollector, getLogCollector } from './logging';
import { initUpdater, autoCheckForUpdates, quitAndInstall, setOnUpdateDownloaded } from './updater';
import { createAppMenu, refreshAppMenu } from './menu';
import {
  initAnalytics,
  flushAnalytics,
  trackSessionEnd,
  trackAppBackgrounded,
  trackAppForegrounded,
} from './analytics';

// Local UI - no longer uses remote URL

// Early E2E flag detection - check command-line args before anything else
// This must run synchronously at module load time
if (process.argv.includes('--e2e-skip-auth')) {
  (global as Record<string, unknown>).E2E_SKIP_AUTH = true;
}
if (process.argv.includes('--e2e-mock-tasks') || process.env.E2E_MOCK_TASK_EVENTS === '1') {
  (global as Record<string, unknown>).E2E_MOCK_TASK_EVENTS = true;
}

// Clean mode - wipe all stored data for a fresh start
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
  // Note: Secure storage (API keys, auth tokens) is stored in electron-store
  // which lives in userData, so it gets cleared with the directory above
}

// Set app name before anything else (affects deep link dialogs)
app.name = 'Openwork';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env file from app root
const envPath = app.isPackaged
  ? path.join(process.resourcesPath, '.env')
  : path.join(__dirname, '../../.env');
config({ path: envPath });

// The built directory structure
//
// ├─┬ dist-electron
// │ ├─┬ main
// │ │ └── index.js    > Electron-Main
// │ └─┬ preload
// │   └── index.js    > Preload-Scripts
// ├─┬ dist
// │ └── index.html    > Electron-Renderer

process.env.APP_ROOT = path.join(__dirname, '../..');

export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron');
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist');
export const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;

let mainWindow: BrowserWindow | null = null;

// Get the preload script path
function getPreloadPath(): string {
  return path.join(__dirname, '../preload/index.cjs');
}

function createWindow() {
  console.log('[Main] Creating main application window');

  // Get app icon
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'icon.png')
    : path.join(process.env.APP_ROOT!, 'resources', 'icon.png');
  const icon = nativeImage.createFromPath(iconPath);

  const preloadPath = getPreloadPath();
  console.log('[Main] Using preload script:', preloadPath);

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Openwork',
    icon: icon.isEmpty() ? undefined : icon,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Open external links in browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:') || url.startsWith('http:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // Maximize window by default
  mainWindow.maximize();

  // Open DevTools in dev mode (non-packaged), but not during E2E tests
  const isE2EMode = (global as Record<string, unknown>).E2E_SKIP_AUTH === true;
  if (!app.isPackaged && !isE2EMode) {
    mainWindow.webContents.openDevTools({ mode: 'right' });
  }

  // Load the local UI
  if (VITE_DEV_SERVER_URL) {
    console.log('[Main] Loading from Vite dev server:', VITE_DEV_SERVER_URL);
    mainWindow.loadURL(VITE_DEV_SERVER_URL);
  } else {
    const indexPath = path.join(RENDERER_DIST, 'index.html');
    console.log('[Main] Loading from file:', indexPath);
    mainWindow.loadFile(indexPath);
  }
}

// Global error handlers to prevent crashes from uncaught errors
// These commonly occur when stdout is unavailable (terminal closed, app shutdown)
process.on('uncaughtException', (error) => {
  // Only log to file (not console) to avoid recursive EIO errors
  try {
    const collector = getLogCollector();
    collector.log('ERROR', 'main', `Uncaught exception: ${error.message}`, {
      name: error.name,
      stack: error.stack,
    });
  } catch {
    // Ignore errors during error handling
  }
});

process.on('unhandledRejection', (reason) => {
  try {
    const collector = getLogCollector();
    collector.log('ERROR', 'main', 'Unhandled promise rejection', { reason });
  } catch {
    // Ignore errors during error handling
  }
});

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  console.log('[Main] Second instance attempted; quitting');
  app.quit();
} else {
  // Initialize logging FIRST - before anything else
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

      // On Windows, protocol URLs come through commandLine on second-instance
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

    // Check for fresh install and cleanup old data BEFORE initializing stores
    // This ensures users get a clean slate after reinstalling from DMG
    try {
      const didCleanup = await checkAndCleanupFreshInstall();
      if (didCleanup) {
        console.log('[Main] Cleaned up data from previous installation');
      }
    } catch (err) {
      console.error('[Main] Fresh install cleanup failed:', err);
    }

    // Initialize database and run migrations
    try {
      initializeDatabase();
    } catch (err) {
      if (err instanceof FutureSchemaError) {
        await dialog.showMessageBox({
          type: 'error',
          title: 'Update Required',
          message: `This data was created by a newer version of Openwork (schema v${err.storedVersion}).`,
          detail: `Your app supports up to schema v${err.appVersion}. Please update Openwork to continue.`,
          buttons: ['Quit'],
        });
        app.quit();
        return;
      }
      throw err;
    }

    // Validate provider settings - if DB says a provider is connected with api_key
    // but the key doesn't exist in secure storage, clear provider settings
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

    // Set dock icon on macOS
    if (process.platform === 'darwin' && app.dock) {
      const iconPath = app.isPackaged
        ? path.join(process.resourcesPath, 'icon.png')
        : path.join(process.env.APP_ROOT!, 'resources', 'icon.png');
      const icon = nativeImage.createFromPath(iconPath);
      if (!icon.isEmpty()) {
        app.dock.setIcon(icon);
      }
    }

    // Register IPC handlers before creating window
    registerIPCHandlers();
    console.log('[Main] IPC handlers registered');

    // Initialize analytics
    initAnalytics();
    console.log('[Main] Analytics initialized');

    createWindow();

    // Set up application menu
    createAppMenu();

    // Initialize updater with main window
    if (mainWindow) {
      initUpdater(mainWindow);

      // Refresh menu when update is downloaded to show "Restart to Update" label
      setOnUpdateDownloaded(() => {
        refreshAppMenu();
      });

      // Auto-check for updates after a short delay (let app fully load)
      setTimeout(() => {
        autoCheckForUpdates().catch((err) => {
          console.error('[Main] Auto-update check failed:', err);
        });
      }, 5000);
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
        console.log('[Main] Application reactivated; recreated window');
      }
    });

    // Track app focus/blur for session analytics
    app.on('browser-window-blur', () => {
      trackAppBackgrounded();
    });

    app.on('browser-window-focus', () => {
      trackAppForegrounded();
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    console.log('[Main] All windows closed; quitting app');
    app.quit();
  }
});

// Flush pending task history writes and dispose TaskManager before quitting
app.on('before-quit', () => {
  console.log('[Main] App before-quit event fired');
  flushPendingTasks();
  // Dispose all active tasks and cleanup PTY processes
  disposeTaskManager();
  // Stop Azure Foundry proxy server if running
  stopAzureFoundryProxy().catch((err) => {
    console.error('[Main] Failed to stop Azure Foundry proxy:', err);
  });
  // Stop Moonshot proxy server if running
  stopMoonshotProxy().catch((err) => {
    console.error('[Main] Failed to stop Moonshot proxy:', err);
  });
  // Close database connection
  closeDatabase();
  // Flush and shutdown logging LAST to capture all shutdown logs
  shutdownLogCollector();
  // Track session end and flush analytics
  trackSessionEnd();
  flushAnalytics();
});

// Handle custom protocol (accomplish://)
// On Windows in dev mode, we need to pass the script path for protocol registration
if (process.platform === 'win32' && !app.isPackaged) {
  app.setAsDefaultProtocolClient('accomplish', process.execPath, [
    path.resolve(process.argv[1]),
  ]);
} else {
  app.setAsDefaultProtocolClient('accomplish');
}

// Handle protocol URL from process.argv (Windows first launch with protocol URL)
function handleProtocolUrlFromArgs(): void {
  if (process.platform === 'win32') {
    const protocolUrl = process.argv.find((arg) => arg.startsWith('accomplish://'));
    if (protocolUrl) {
      console.log('[Main] Received protocol URL from argv:', protocolUrl);
      // Delay sending until window is ready
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

// Check for protocol URL on startup
handleProtocolUrlFromArgs();

app.on('open-url', (event, url) => {
  event.preventDefault();
  console.log('[Main] Received protocol URL:', url);
  // Handle protocol URL
  if (url.startsWith('accomplish://callback')) {
    mainWindow?.webContents?.send('auth:callback', url);
  }
});

// IPC Handlers
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

ipcMain.handle('update:install', async () => {
  await quitAndInstall();
});
