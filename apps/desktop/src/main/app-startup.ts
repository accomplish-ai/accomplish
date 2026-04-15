/**
 * app-startup.ts — async startup body for `app.whenReady()`.
 *
 * Extracted from main/index.ts to keep index.ts focused on
 * top-level bootstrap (single-instance lock, env, window factory).
 */

import { app, BrowserWindow, dialog, ipcMain, nativeImage, nativeTheme } from 'electron';
import path from 'path';
import { FutureSchemaError } from '@accomplish_ai/agent-core';
import type { ProviderId } from '@accomplish_ai/agent-core';
// thought-stream-api removed — daemon owns thought/checkpoint streaming.
// Events forwarded via daemon notification subscription (task.thought, task.checkpoint).
import { migrateLegacyData } from './store/legacyMigration';
import { initializeStorage, getStorage } from './store/storage';
import { getApiKey } from './store/secureStorage';
import * as workspaceManager from './store/workspaceManager';
import { getLogCollector } from './logging';
import { skillsManager } from './skills';
import { startHuggingFaceServer } from './providers/huggingface-local';
import { createTray } from './tray';
import {
  bootstrapDaemon,
  registerNotificationForwarding,
  getDaemonClient,
} from './daemon-bootstrap';
import { registerIPCHandlers } from './ipc/handlers';
import { drainProtocolUrlQueue } from './protocol-handlers';
import { getBuildConfig, getBuildId, isAnalyticsEnabled } from './config/build-config';
import { initAnalytics, initDeviceFingerprint } from './analytics/analytics-service';
import { initMixpanel } from './analytics/mixpanel-service';
import { trackAppLaunched } from './analytics/events';

function logMain(level: 'INFO' | 'WARN' | 'ERROR', msg: string, data?: Record<string, unknown>) {
  try {
    const l = getLogCollector();
    if (l?.log) l.log(level, 'main', msg, data);
  } catch (_e) {
    /* best-effort */
  }
}

export type CreateWindowFn = () => void;

/**
 * Async startup body — called inside `app.whenReady().then(...)`.
 */
export async function startApp(
  createWindow: CreateWindowFn,
  getMainWindow: () => BrowserWindow | null,
  isQuittingRef: { value: boolean },
): Promise<void> {
  logMain('INFO', `[Main] Electron app ready, version: ${app.getVersion()}`);

  // Set build identity for daemon version-guard (used by in-process DaemonServer
  // and compared against standalone daemon's ping response)
  process.env.ACCOMPLISH_BUILD_ID = getBuildId();

  if (process.env.CLEAN_START !== '1') {
    try {
      const didMigrate = migrateLegacyData();
      if (didMigrate) logMain('INFO', '[Main] Migrated data from legacy userData path');
    } catch (err) {
      logMain('ERROR', '[Main] Legacy data migration failed', { err: String(err) });
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
    logMain('ERROR', '[Main] Workspace initialization failed', { err: String(err) });
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
          logMain(
            'WARN',
            `[Main] Provider ${providerId} has api_key auth but key not found in secure storage`,
          );
          storage.removeConnectedProvider(providerId);
          logMain('INFO', `[Main] Removed provider ${providerId} due to missing API key`);
        }
      }
    }
    const hfConfig = storage.getHuggingFaceLocalConfig();
    if (hfConfig?.enabled && hfConfig.selectedModelId) {
      logMain(
        'INFO',
        `[Main] Auto-starting HuggingFace server for model: ${hfConfig.selectedModelId}`,
      );
      startHuggingFaceServer(hfConfig.selectedModelId)
        .then((result) => {
          if (!result.success) {
            logMain('ERROR', '[Main] Failed to auto-start HuggingFace local server', {
              error: result.error,
            });
          }
        })
        .catch((err: unknown) => {
          logMain('ERROR', '[Main] Failed to auto-start HuggingFace local server (thrown)', {
            err: String(err),
          });
        });
    }
  } catch (err) {
    logMain('ERROR', '[Main] Provider validation failed', { err: String(err) });
  }

  // Clean up stale accomplish-ai provider if free mode is no longer available.
  // Handles the case where a user switches from Free to OSS build.
  try {
    const { isFreeMode } = await import('./config/build-config');
    if (!isFreeMode()) {
      const s = getStorage();
      const provider = s.getConnectedProvider('accomplish-ai');
      if (provider) {
        s.removeConnectedProvider('accomplish-ai');
        if (s.getActiveProviderId() === 'accomplish-ai') {
          s.setActiveProvider(null);
        }
        logMain('INFO', '[Main] Removed stale accomplish-ai provider (free mode not available)');
      }
    }
  } catch {
    // best-effort cleanup
  }

  // Initialize analytics — no-op when build.env is absent (OSS builds)
  let isFirstLaunch = false;
  try {
    if (isAnalyticsEnabled()) {
      const result = initAnalytics();
      isFirstLaunch = result.isFirstLaunch;
      initDeviceFingerprint();
    }
    if (getBuildConfig().mixpanelToken) {
      initMixpanel();
    }
    if (isAnalyticsEnabled()) {
      trackAppLaunched(isFirstLaunch).catch((err) =>
        logMain('WARN', '[Main] trackAppLaunched failed', { err: String(err) }),
      );
    }
  } catch (err) {
    logMain('WARN', '[Main] Analytics initialization failed', { err: String(err) });
  }

  await skillsManager.initialize();

  if (process.platform === 'darwin' && app.dock) {
    const iconPath = app.isPackaged
      ? path.join(process.resourcesPath, 'icon.png')
      : path.join(process.env.APP_ROOT!, 'resources', 'icon.png');
    const icon = nativeImage.createFromPath(iconPath);
    if (!icon.isEmpty()) app.dock.setIcon(icon);
  }

  try {
    nativeTheme.themeSource = getStorage().getTheme();
  } catch {
    // First launch or corrupt DB — nativeTheme stays 'system'
  }

  // Daemon bootstrap is non-blocking — the GUI must always open even if
  // the daemon fails to start. The status dot and toast will show the user
  // that the daemon is disconnected, and task launch will be disabled.
  // Skip daemon entirely in E2E mock mode — tests use mock task events.
  if (process.env.E2E_MOCK_TASK_EVENTS !== '1') {
    try {
      await bootstrapDaemon();
      logMain('INFO', '[Main] Daemon connected');
    } catch (err) {
      const { DaemonRestartError } = await import('./daemon/daemon-connector');
      if (err instanceof DaemonRestartError) {
        logMain('ERROR', '[Main] Failed to restart daemon after upgrade', {
          error: String(err),
        });
        const { dialog } = await import('electron');
        dialog.showMessageBox({
          type: 'warning',
          title: 'Background Service Update',
          message:
            'The background service from a previous version could not be stopped. ' +
            'Please fully quit the application (check the system tray), wait a few seconds, ' +
            'and reopen it. If the issue persists, restart your computer.',
        });
      } else {
        logMain('WARN', '[Main] Daemon bootstrap failed — GUI will open without daemon', {
          error: String(err),
        });
      }
    }
  } else {
    logMain('INFO', '[Main] E2E mock mode — skipping daemon bootstrap');
  }

  // Initialize Google account managers (lazy singletons — safe after initializeStorage())
  let googleAccountManager: import('./google-accounts/account-manager').AccountManager | undefined;
  let googleTokenManager: import('./google-accounts/token-manager').TokenManager | undefined;
  let startGoogleOAuthFn:
    | typeof import('./google-accounts/google-auth').startGoogleOAuth
    | undefined;
  let cancelGoogleOAuthFn:
    | typeof import('./google-accounts/google-auth').cancelGoogleOAuth
    | undefined;
  try {
    const { getAccountManager, getTokenManager, startGoogleOAuth, cancelGoogleOAuth } =
      await import('./google-accounts/index');
    googleAccountManager = getAccountManager();
    googleTokenManager = getTokenManager();
    startGoogleOAuthFn = startGoogleOAuth;
    cancelGoogleOAuthFn = cancelGoogleOAuth;
  } catch (err) {
    logMain('WARN', '[Main] Google account managers unavailable', { err: String(err) });
  }
  // Register IPC handlers exactly once, after the import attempt settles
  registerIPCHandlers(
    googleAccountManager,
    googleTokenManager,
    startGoogleOAuthFn,
    cancelGoogleOAuthFn,
  );
  logMain('INFO', '[Main] IPC handlers registered');

  createWindow();

  const mainWindow = getMainWindow();
  if (mainWindow) {
    // Wire TokenManager window reference and start refresh timers for connected accounts
    if (googleTokenManager && googleAccountManager) {
      try {
        googleTokenManager.setWindow(mainWindow);
        googleTokenManager.startAllTimers(googleAccountManager.listAccounts());
        logMain('INFO', '[Main] Google account token refresh timers started');
      } catch (err) {
        logMain('WARN', '[Main] Failed to start Google token refresh timers', {
          err: String(err),
        });
      }
    }
    // Forward daemon notifications to the renderer via IPC.
    // Uses a dynamic getter so recreated windows (macOS activate) receive events.
    registerNotificationForwarding(() => getMainWindow());
    logMain('INFO', '[Main] Daemon notification forwarding registered');

    mainWindow.on('close', (event) => {
      if (isQuittingRef.value) {
        return; // Already quitting — let it close
      }

      // Skip close dialog in E2E mode — tests need clean app.close()
      if (process.env.E2E_MOCK_TASK_EVENTS === '1') {
        return;
      }

      // Show a themed close dialog in the renderer instead of a native OS dialog.
      // The renderer sends back the user's decision via IPC.
      event.preventDefault();

      mainWindow.webContents.send('app:close-requested');

      // One-time listener for the response
      const handler = async (_evt: Electron.IpcMainEvent, decision: string) => {
        ipcMain.removeListener('app:close-response', handler);

        if (decision === 'keep-daemon') {
          logMain('INFO', '[Main] Closing app (daemon keeps running)');
          isQuittingRef.value = true;
          app.quit();
        } else if (decision === 'stop-daemon') {
          logMain('INFO', '[Main] Closing app and stopping daemon');
          // Suppress auto-reconnect so the disconnect doesn't trigger the toast
          try {
            const { suppressReconnect } = await import('./daemon/daemon-connector');
            suppressReconnect();
          } catch {
            /* connector may not be loaded */
          }
          // Fire-and-forget: tell daemon to shut down, then quit immediately.
          // The daemon handles its own drain phase independently.
          try {
            const client = getDaemonClient();
            client.call('daemon.shutdown').catch(() => {});
          } catch {
            // Daemon may already be down
          }
          isQuittingRef.value = true;
          app.quit();
        }
        // decision === 'cancel' — do nothing, window stays open
      };
      ipcMain.on('app:close-response', handler);
    });

    createTray(mainWindow);
    logMain('INFO', '[Main] System tray created');

    // Drain any protocol URLs that arrived before the window was created
    drainProtocolUrlQueue(mainWindow);
  }

  app.on('activate', () => {
    const windows = BrowserWindow.getAllWindows();
    if (windows.length === 0) {
      createWindow();
      // Rebind TokenManager to the newly created window so background
      // notifications target the fresh BrowserWindow reference
      if (googleTokenManager) {
        const newWindow = getMainWindow();
        if (newWindow) {
          googleTokenManager.setWindow(newWindow);
        }
      }
      try {
        getLogCollector()?.logEnv?.('INFO', '[Main] Application reactivated; recreated window');
      } catch (_e) {
        /* ignore */
      }
    } else {
      windows[0].show();
      windows[0].focus();
      // Ensure TokenManager always holds a reference to the current focused window
      if (googleTokenManager) {
        googleTokenManager.setWindow(windows[0]);
      }
      try {
        getLogCollector()?.logEnv?.(
          'INFO',
          '[Main] Application reactivated; showed existing window',
        );
      } catch (_e) {
        /* ignore */
      }
    }
  });
}
