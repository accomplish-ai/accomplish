import { config } from 'dotenv';
import {
  app,
  BrowserWindow,
  shell,
  ipcMain,
  nativeImage,
  dialog,
  nativeTheme,
  Menu,
} from 'electron';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const APP_DATA_NAME = 'Accomplish';
app.setPath('userData', path.join(app.getPath('appData'), APP_DATA_NAME));

if (process.platform === 'win32') {
  app.setAppUserModelId('ai.accomplish.desktop');
}

import { registerIPCHandlers } from './ipc/handlers';
import { FutureSchemaError } from '@accomplish_ai/agent-core';
import { initThoughtStreamApi, startThoughtStreamServer } from './thought-stream-api';
import type { ProviderId } from '@accomplish_ai/agent-core';
import { getTaskManager, disposeTaskManager, cleanupVertexServiceAccountKey } from './opencode';
import { stopAllBrowserPreviewStreams } from './services/browserPreview';
import { oauthBrowserFlow } from './opencode/auth-browser';
import { slackMcpOAuthFlow } from './opencode/slack-auth';
import { migrateLegacyData } from './store/legacyMigration';
import {
  initializeStorage,
  closeStorage,
  getStorage,
  resetStorageSingleton,
} from './store/storage';
import { getApiKey, clearSecureStorage } from './store/secureStorage';
import * as workspaceManager from './store/workspaceManager';
import { initializeLogCollector, shutdownLogCollector, getLogCollector } from './logging';
import { skillsManager } from './skills';
import { createTray, destroyTray } from './tray';
import { bootstrapDaemon, shutdownDaemon } from './daemon-bootstrap';

if (process.argv.includes('--e2e-skip-auth')) {
  (global as Record<string, unknown>).E2E_SKIP_AUTH = true;
}
if (process.argv.includes('--e2e-mock-tasks') || process.env.E2E_MOCK_TASK_EVENTS === '1') {
  (global as Record<string, unknown>).E2E_MOCK_TASK_EVENTS = true;
}

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
  // Clear secure storage first (while singleton still exists), then null the reference.
  // Reversing this order would cause getStorage() to re-create the singleton.
  clearSecureStorage();
  resetStorageSingleton();
  console.log('[Clean Mode] All singletons reset');
}

app.setName('Accomplish');

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const envPath = app.isPackaged
  ? path.join(process.resourcesPath, '.env')
  : path.join(__dirname, '../../.env');
config({ path: envPath });

process.env.APP_ROOT = path.join(__dirname, '../..');

export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron');

const ROUTER_URL = process.env.ACCOMPLISH_ROUTER_URL;

// In production, web's build output is packaged as an extraResource.
const WEB_DIST = app.isPackaged
  ? path.join(process.resourcesPath, 'web-ui')
  : path.join(process.env.APP_ROOT, '../web/dist/client');

let mainWindow: BrowserWindow | null = null;
let isQuitting = false;

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
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#171717' : '#f9f9f9',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      spellcheck: true,
    },
  });

  mainWindow.webContents.on('context-menu', (_event, params) => {
    if (!params.misspelledWord) {
      return;
    }

    const menuItems: Electron.MenuItemConstructorOptions[] = params.dictionarySuggestions.map(
      (suggestion) => ({
        label: suggestion,
        click: () => mainWindow?.webContents.replaceMisspelling(suggestion),
      }),
    );

    if (menuItems.length > 0) {
      menuItems.push({ type: 'separator' });
    }

    menuItems.push({
      label: 'Add to Dictionary',
      click: () =>
        mainWindow?.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord),
    });

    Menu.buildFromTemplate(menuItems).popup();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:') || url.startsWith('http:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.maximize();

  const isE2EMode = (global as Record<string, unknown>).E2E_SKIP_AUTH === true;
  const isTestEnv = process.env.NODE_ENV === 'test';
  if (!app.isPackaged && !isE2EMode && !isTestEnv) {
    mainWindow.webContents.openDevTools({ mode: 'right' });
  }

  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    // In dev mode, @vitejs/plugin-react injects an inline HMR preamble script that
    // requires 'unsafe-inline'. This is safe since dev builds are never distributed.
    const scriptSrc = app.isPackaged ? "'self'" : "'self' 'unsafe-inline'";
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          `default-src 'self' https:; script-src ${scriptSrc}; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https: ws: wss:; font-src 'self' https: data:; worker-src 'self' blob:`,
        ],
      },
    });
  });

  if (ROUTER_URL) {
    console.log('[Main] Loading from router URL:', ROUTER_URL);
    mainWindow.loadURL(ROUTER_URL);
  } else {
    const indexPath = path.join(WEB_DIST, 'index.html');
    console.log('[Main] Loading from file:', indexPath);
    mainWindow.loadFile(indexPath);
  }
}

process.on('uncaughtException', (error) => {
  try {
    const collector = getLogCollector();
    collector.log('ERROR', 'main', `Uncaught exception: ${error.message}`, {
      name: error.name,
      stack: error.stack,
    });
  } catch {
    // ignore - log collector may not be initialized
  }
});

process.on('unhandledRejection', (reason) => {
  try {
    const collector = getLogCollector();
    collector.log('ERROR', 'main', 'Unhandled promise rejection', { reason });
  } catch {
    // ignore - log collector may not be initialized
  }
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
          if (protocolUrl.startsWith('accomplish://callback/mcp')) {
            mainWindow.webContents.send('auth:mcp-callback', protocolUrl);
          } else if (protocolUrl.startsWith('accomplish://callback')) {
            mainWindow.webContents.send('auth:callback', protocolUrl);
          }
        }
      }
    }
  });

  app.whenReady().then(async () => {
    console.log('[Main] Electron app ready, version:', app.getVersion());

    if (process.env.CLEAN_START !== '1') {
      try {
        const didMigrate = migrateLegacyData();
        if (didMigrate) {
          console.log('[Main] Migrated data from legacy userData path');
        }
      } catch (err) {
        console.error('[Main] Legacy data migration failed:', err);
      }
    }

    try {
      initializeStorage();
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

    try {
      workspaceManager.initialize();
    } catch (err) {
      console.error('[Main] Workspace initialization failed:', err);
      throw err;
    }

    try {
      const storage = getStorage();
      const settings = storage.getProviderSettings();
      for (const [id, provider] of Object.entries(settings.connectedProviders)) {
        const providerId = id as ProviderId;
        const credType = provider?.credentials?.type;
        if (!credType || credType === 'api_key') {
          const key = getApiKey(providerId);
          if (!key) {
            console.warn(
              `[Main] Provider ${providerId} has api_key auth but key not found in secure storage`,
            );
            storage.removeConnectedProvider(providerId);
            console.log(`[Main] Removed provider ${providerId} due to missing API key`);
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

    // Must run before createWindow() so backgroundColor matches the theme
    try {
      const storage = getStorage();
      nativeTheme.themeSource = storage.getTheme();
    } catch {
      // First launch or corrupt DB — nativeTheme stays 'system'
    }

    // Bootstrap the daemon RPC layer (child-process with in-process fallback)
    const taskManager = getTaskManager();
    const storage = getStorage();
    await bootstrapDaemon({ taskManager, storage });
    console.log('[Main] Daemon bootstrapped');

    registerIPCHandlers();
    console.log('[Main] IPC handlers registered');

    createWindow();

    if (mainWindow) {
      initThoughtStreamApi(mainWindow);
      startThoughtStreamServer();

      // Intercept window close: hide to tray instead of quitting
      mainWindow.on('close', (event) => {
        if (!isQuitting) {
          event.preventDefault();
          mainWindow?.hide();
          console.log('[Main] Window hidden to tray');
        }
      });

      createTray(mainWindow);
      console.log('[Main] System tray created');
    }

    app.on('activate', () => {
      const windows = BrowserWindow.getAllWindows();
      if (windows.length === 0) {
        createWindow();
        try {
          const l = getLogCollector();
          if (l?.logEnv) {
            l.logEnv('INFO', '[Main] Application reactivated; recreated window');
          }
        } catch (_e) {
          /* ignore */
        }
      } else {
        windows[0].show();
        windows[0].focus();
        try {
          const l = getLogCollector();
          if (l?.logEnv) {
            l.logEnv('INFO', '[Main] Application reactivated; showed existing window');
          }
        } catch (_e) {
          /* ignore */
        }
      }
    });
  });
}

app.on('window-all-closed', () => {
  // With system tray, the app stays alive when all windows are closed.
  // On macOS this was already the default behavior.
  // On Windows/Linux the tray keeps the app running.
  console.log('[Main] All windows closed — app continues in system tray');
});

app.on('before-quit', (event) => {
  if (isQuitting) {
    return;
  }
  isQuitting = true;
  event.preventDefault();

  let logger: ReturnType<typeof getLogCollector> | null = null;
  try {
    logger = getLogCollector();
  } catch {
    /* logger may not be initialized on early quit paths */
  }

  // Await async cleanup before quitting (Dev0907, PR #480, ENG-695)
  void (async () => {
    destroyTray();
    shutdownDaemon();

    const stopBrowserPreviews = stopAllBrowserPreviewStreams();
    try {
      await Promise.race([
        stopBrowserPreviews,
        new Promise<void>((_, reject) => {
          const timeoutId = setTimeout(() => {
            reject(new Error('Timed out stopping browser preview streams'));
          }, 5000);
          void stopBrowserPreviews.finally(() => clearTimeout(timeoutId));
        }),
      ]);
    } catch (error: unknown) {
      logger?.logEnv('ERROR', `[Main] Failed to stop browser preview streams: ${String(error)}`);
    }
    try {
      disposeTaskManager(); // Also cleans up proxies internally
    } catch (error: unknown) {
      logger?.logEnv('ERROR', `[Main] Error during disposeTaskManager: ${String(error)}`);
    }
    try {
      cleanupVertexServiceAccountKey();
    } catch (error: unknown) {
      logger?.logEnv(
        'ERROR',
        `[Main] Error during cleanupVertexServiceAccountKey: ${String(error)}`,
      );
    }
    try {
      oauthBrowserFlow.dispose();
    } catch (error: unknown) {
      logger?.logEnv('ERROR', `[Main] Error during oauthBrowserFlow.dispose: ${String(error)}`);
    }
    try {
      slackMcpOAuthFlow.dispose();
    } catch (error: unknown) {
      logger?.logEnv('ERROR', `[Main] Error during slackMcpOAuthFlow.dispose: ${String(error)}`);
    }
    try {
      workspaceManager.close();
    } catch (error: unknown) {
      logger?.logEnv('ERROR', `[Main] Error during workspaceManager.close: ${String(error)}`);
    }
    try {
      closeStorage();
    } catch (error: unknown) {
      logger?.logEnv('ERROR', `[Main] Error during closeStorage: ${String(error)}`);
    }
    try {
      shutdownLogCollector();
    } finally {
      app.quit();
    }
  })();
});

if (process.platform === 'win32' && !app.isPackaged) {
  app.setAsDefaultProtocolClient('accomplish', process.execPath, [path.resolve(process.argv[1])]);
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
            if (protocolUrl.startsWith('accomplish://callback/mcp')) {
              mainWindow.webContents.send('auth:mcp-callback', protocolUrl);
            } else if (protocolUrl.startsWith('accomplish://callback')) {
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
  if (url.startsWith('accomplish://callback/mcp')) {
    mainWindow?.webContents?.send('auth:mcp-callback', url);
  } else if (url.startsWith('accomplish://callback')) {
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
  return (
    (global as Record<string, unknown>).E2E_MOCK_TASK_EVENTS === true ||
    process.env.E2E_MOCK_TASK_EVENTS === '1'
  );
});
