/**
 * app-startup.ts — async startup body for `app.whenReady()`.
 *
 * Extracted from main/index.ts to keep index.ts focused on
 * top-level bootstrap (single-instance lock, env, window factory).
 */

import { app, BrowserWindow, dialog, nativeImage, nativeTheme } from 'electron';
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
      logMain('WARN', '[Main] Daemon bootstrap failed — GUI will open without daemon', {
        error: String(err),
      });
    }
  } else {
    logMain('INFO', '[Main] E2E mock mode — skipping daemon bootstrap');
  }

  registerIPCHandlers();
  logMain('INFO', '[Main] IPC handlers registered');

  createWindow();

  const mainWindow = getMainWindow();
  if (mainWindow) {
    // Forward daemon notifications to the renderer via IPC.
    // Uses a dynamic getter so recreated windows (macOS activate) receive events.
    registerNotificationForwarding(() => getMainWindow());
    logMain('INFO', '[Main] Daemon notification forwarding registered');

    mainWindow.on('close', (event) => {
      if (isQuittingRef.value) {
        return; // Already quitting — let it close
      }

      // Always prevent default and show a confirmation dialog
      event.preventDefault();

      void dialog
        .showMessageBox(mainWindow, {
          type: 'question',
          title: 'Close Accomplish',
          message: 'The background daemon will keep running.',
          detail:
            'Tasks and scheduled jobs will continue in the background. ' +
            'You can reopen the app from the system tray.',
          buttons: ['Close', 'Close & Stop Daemon', 'Cancel'],
          defaultId: 0, // "Close" is the default
          cancelId: 2, // "Cancel" maps to Escape key
          noLink: true,
        })
        .then(({ response }) => {
          if (response === 0) {
            // Close app, daemon keeps running
            logMain('INFO', '[Main] Closing app (daemon keeps running)');
            isQuittingRef.value = true;
            app.quit();
          } else if (response === 1) {
            // Close app AND stop daemon
            logMain('INFO', '[Main] Closing app and stopping daemon');
            try {
              const client = getDaemonClient();
              void client
                .call('daemon.shutdown')
                .catch(() => {})
                .finally(() => {
                  isQuittingRef.value = true;
                  app.quit();
                });
            } catch {
              isQuittingRef.value = true;
              app.quit();
            }
          }
          // response === 2 (Cancel) — do nothing, window stays open
        });
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
      try {
        getLogCollector()?.logEnv?.('INFO', '[Main] Application reactivated; recreated window');
      } catch (_e) {
        /* ignore */
      }
    } else {
      windows[0].show();
      windows[0].focus();
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
