/**
 * app-startup.ts — async startup body for `app.whenReady()`.
 *
 * Extracted from main/index.ts to keep index.ts focused on
 * top-level bootstrap (single-instance lock, env, window factory).
 */

import { app, BrowserWindow, dialog, ipcMain, nativeImage, nativeTheme, shell } from 'electron';
import path from 'path';
import type { ProviderId } from '@accomplish_ai/agent-core/desktop-main';
import { migrateLegacyData } from './store/legacyMigration';
import { getLegacyElectronStorePaths } from './store/storage';
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

/**
 * Bootstrap the daemon, prompting the user via a native modal on every
 * failure. Returns `'connected'` when the socket is up, or `'quit'` if
 * the user explicitly chose to exit from the failure modal.
 *
 * Added in M5's review cycle to replace the pre-M5 "log a warning and
 * open a broken GUI" behavior. See the caller for the full justification.
 */
async function bootstrapDaemonWithRetry(): Promise<'connected' | 'quit'> {
  // Outer loop: one iteration per bootstrap attempt. We re-enter it on
  // every 'retry' choice. On success we return.
  // Inner loop: handles the 'open-logs' action without re-bootstrapping,
  // so the user can inspect the log file and come back to the same
  // retry/quit choice on the same error.
  for (;;) {
    try {
      await bootstrapDaemon();
      logMain('INFO', '[Main] Daemon connected');
      return 'connected';
    } catch (err) {
      const { DaemonRestartError } = await import('./daemon/daemon-connector');

      // Upgrade-path failure — a stale daemon from a previous version is
      // still running and we can't kill it from here. No amount of retry
      // will clear this without manual user action, so skip the retry
      // loop and surface the original warning text.
      if (err instanceof DaemonRestartError) {
        logMain('ERROR', '[Main] Failed to restart daemon after upgrade', { error: String(err) });
        await dialog.showMessageBox({
          type: 'warning',
          title: 'Background Service Update',
          message: 'The background service from a previous version could not be stopped.',
          detail:
            'Please fully quit the application (check the system tray), wait a few seconds, ' +
            'and reopen it. If the issue persists, restart your computer.',
          buttons: ['Quit'],
        });
        return 'quit';
      }

      logMain('ERROR', '[Main] Daemon bootstrap failed', { error: String(err) });

      // Nested prompt loop — 'open-logs' loops back here without retrying;
      // 'retry' / 'quit' break out to the outer loop.
      for (;;) {
        const response = await dialog.showMessageBox({
          type: 'error',
          title: 'Accomplish cannot start',
          message: 'The background service failed to start.',
          detail:
            'Accomplish stores your settings, conversations, and credentials in a background ' +
            'process. Without it the app cannot load.\n\n' +
            `Error: ${err instanceof Error ? err.message : String(err)}`,
          buttons: ['Retry', 'Open Logs', 'Quit'],
          defaultId: 0,
          cancelId: 2,
        });

        if (response.response === 0) {
          // Retry — break inner, outer loop attempts bootstrap again.
          break;
        }
        if (response.response === 2) {
          // Quit
          return 'quit';
        }

        // Open Logs — best-effort; if the log directory doesn't exist
        // yet (first boot crash), fall back to userData.
        try {
          const logDir = path.join(app.getPath('userData'), 'logs');
          const openErr = await shell.openPath(logDir);
          if (openErr) {
            logMain('WARN', '[Main] shell.openPath(logs) returned error', { openErr });
            await shell.openPath(app.getPath('userData'));
          }
        } catch (openErr) {
          logMain('WARN', '[Main] Could not open log directory', { err: String(openErr) });
        }
        // Loop to show the modal again.
      }
    }
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

  // Milestone 5 of the daemon-only-SQLite migration removed
  // `initializeStorage()` from main — the daemon is the only process that
  // opens the DB now. FutureSchemaError used to fire here (`createStorage`
  // → migrations → schema-version check); post-M5 the equivalent surface
  // is a daemon-side failure at bootstrap. If daemon bootstrap below
  // throws, we fall through to degraded-mode GUI with a logged warning,
  // matching the existing no-daemon code path. A dedicated
  // update-required modal stays a product decision for a separate PR.
  //
  // `workspaceManager.initialize()` also moved to the post-bootstrap
  // block (M3 3d), so there's nothing left to do between the legacy
  // file-copy migration above and `bootstrapDaemon()` below.

  // HuggingFace auto-start + accomplish-ai cleanup used to run here in the
  // pre-M3 flow, but both read state the legacy electron-store import
  // writes on first upgrade. The import now runs post-bootstrap (it needs
  // the daemon), so moving these two consumers to after the import closes
  // a first-upgrade correctness gap: on an OSS build that previously stored
  // `accomplish-ai` under the free tier, the old pre-import cleanup would
  // no-op (nothing yet) and the subsequent import would restore the stale
  // provider; on any upgrade with HF configured, the auto-start would miss
  // the imported `selected_model_id` and not fire until the next launch.
  //
  // See the post-bootstrap block starting near line ~220.

  // Initialize analytics — no-op when build.env is absent (OSS builds).
  // `initAnalytics` / `initDeviceFingerprint` / `initMixpanel` only touch
  // local state (electron-store for the analytics device id, process-level
  // SDK globals), so they run pre-daemon. The `trackAppLaunched` call was
  // split out and MOVED to after `bootstrapDaemon()` below — its
  // `getAllApiKeys()` enrichment now routes over RPC.
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

  // Milestone 5: theme is now read from the daemon via `settings.getAll`
  // after bootstrap (see the post-bootstrap block below). The pre-bootstrap
  // `nativeTheme.themeSource = getStorage().getTheme()` call would try to
  // open the local DB, which main no longer owns. The brief window between
  // here and the daemon read uses Electron's default ('system') — the
  // deferred assignment below updates it within a few ms of socket connect.

  // Daemon bootstrap is a hard precondition for opening the window.
  //
  // Milestone 5 of the daemon-only-SQLite migration made the daemon the
  // sole owner of SQLite + secure storage. Pre-M5 the pre-bootstrap
  // storage init would have populated main's local DB handle; if
  // bootstrap then failed, the GUI could still render from that handle
  // in a "degraded mode". Post-M5 every renderer-triggered read —
  // theme, provider settings, onboarding state, task list, secrets,
  // workspaces, Google accounts, skills — goes through `getDaemonClient()`
  // and throws `Daemon not bootstrapped` until the socket is up. Opening
  // the GUI in that state shows a broken app.
  //
  // Instead, loop on bootstrap failures with a native modal:
  //   Retry     — re-attempt `bootstrapDaemon()` (same errors as the
  //                first try, so most transient failures clear on retry).
  //   Open Logs — opens the daemon log directory in the OS file browser.
  //                Doesn't retry or quit; the modal comes back on the
  //                next prompt loop so the user can choose after looking.
  //   Quit      — `app.quit()` and return early from startApp.
  //
  // The `DaemonRestartError` branch keeps its pre-M5 warning text since
  // it's a specific upgrade-path failure the user has to act on outside
  // the app (fully quit the tray, wait, reopen) — retry within the same
  // Electron instance can't resolve it.
  //
  // Milestone 5 review finding P2.1: E2E mock mode used to skip daemon
  // bootstrap entirely. That worked pre-M5 when main owned its own DB,
  // but post-M5 every storage-backed IPC (`settings:theme`,
  // `onboarding:complete`, `provider-settings:get`, workspaces, secrets)
  // goes through `getDaemonClient()` and immediately throws "Daemon not
  // bootstrapped" without a live socket. The mock flag only needs to
  // bypass *task execution* — every task-handler that should run the
  // mock flow already branches on `isMockTaskEventsEnabled()` — so the
  // daemon runs the same way it would in a normal launch. Playwright
  // fixtures already isolate via a temp `userData`, so no cross-test
  // contamination from the daemon's scheduler or token refreshers.
  const outcome = await bootstrapDaemonWithRetry();
  if (outcome === 'quit') {
    logMain('INFO', '[Main] User chose to quit from daemon-failure modal');
    app.quit();
    return;
  }

  // Legacy electron-store import — MOVED to the daemon in Milestone 3
  // sub-chunk 3b. Main used to run `importLegacyElectronStoreData(db)`
  // inside `initializeStorage()` against the local DB handle; the daemon
  // now owns the import against its own (same) DB, triggered via RPC.
  //
  // Hands the JSON paths to the daemon because `app.getPath` is Electron-
  // only — the daemon cannot derive them itself. The service guards with
  // `schema_meta.legacy_electron_store_import_complete`, so every-boot
  // invocation is a cheap no-op after the first successful import.
  let legacyImportActuallyRan = false;
  try {
    const paths = getLegacyElectronStorePaths();
    const client = getDaemonClient();
    const result = await client.call('legacy.importElectronStoreIfNeeded', paths);
    logMain('INFO', '[Main] Legacy electron-store import', result);
    legacyImportActuallyRan = result.imported;
  } catch (err) {
    // Non-fatal: a failed/missing legacy import should not block app startup.
    // The daemon logs the details on its side; we log + continue here so
    // providers and settings can still load from the main DB path.
    logMain('WARN', '[Main] Legacy electron-store import RPC failed', {
      err: String(err),
    });
  }

  // Milestone 3 sub-chunk 3d: hydrate the workspace cache from the daemon
  // and subscribe to `workspace.changed` notifications. Must run AFTER
  // `bootstrapDaemon()` (the RPCs need a live client) and after the legacy
  // import (so imported workspace rows land in the cache on first boot).
  // Intentionally kept BEFORE HF auto-start and provider validation so the
  // task IPC handlers (registered further down) see a warm cache on their
  // first invocation.
  try {
    await workspaceManager.initialize();
  } catch (err) {
    logMain('ERROR', '[Main] Workspace initialization failed', { err: String(err) });
    // Non-fatal: task handlers will see `getActiveWorkspace() === null`
    // and fall back to the no-workspace-filter code path, same as a
    // fresh pre-workspace-feature profile. Better than a blocked startup.
  }

  // Milestone 5: read theme + HF config from the daemon in a single
  // `settings.getAll` RPC. Previous M4 reads went through `getStorage()`
  // locally; the main-side DB singleton is gone as of M5 so everything
  // is routed here instead.
  {
    try {
      const snap = await getDaemonClient().call('settings.getAll');

      // Apply theme. `app.theme` is `ThemePreference` — same shape the
      // pre-M5 `storage.getTheme()` returned.
      try {
        nativeTheme.themeSource = snap.app.theme;
      } catch {
        // First launch or unknown value — leave the Electron default
      }

      // HuggingFace auto-start. Pre-M5 this read `storage.getHuggingFaceLocalConfig()`;
      // the `SettingsSnapshot.huggingFaceLocalConfig` field carries the
      // same blob post-M5.
      const hfConfig = snap.huggingFaceLocalConfig;
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

      // Clean up stale accomplish-ai provider if free mode is no longer
      // available (user switched from Free to OSS build). Pre-M5 this
      // path read/wrote provider settings via `getStorage()`; now it
      // goes through `provider.*` RPCs. The `snap.providers` blob is
      // current as of the `settings.getAll` above, so we don't need a
      // second read.
      try {
        const { isFreeMode } = await import('./config/build-config');
        if (!isFreeMode()) {
          const connected = snap.providers.connectedProviders['accomplish-ai'];
          if (connected) {
            const client = getDaemonClient();
            await client.call('provider.removeConnected', { providerId: 'accomplish-ai' });
            if (snap.providers.activeProviderId === 'accomplish-ai') {
              await client.call('provider.setActive', { providerId: null });
            }
            logMain(
              'INFO',
              '[Main] Removed stale accomplish-ai provider (free mode not available)',
            );
          }
        }
      } catch {
        // best-effort cleanup
      }
    } catch (err) {
      logMain('WARN', '[Main] Post-bootstrap settings snapshot read failed', {
        err: String(err),
      });
    }
  }

  // Re-apply theme if the legacy import actually ran. The daemon's
  // `settings.changed` notification would reach the renderer too, but
  // main's `nativeTheme.themeSource` is separate — we have to refresh
  // it explicitly here before the first frame renders.
  if (legacyImportActuallyRan) {
    try {
      const snap = await getDaemonClient().call('settings.getAll');
      nativeTheme.themeSource = snap.app.theme;
    } catch {
      // best-effort — leave whatever was applied earlier
    }
  }

  // Provider validation — MOVED here from pre-bootstrap (Milestone 3 of the
  // daemon-only-SQLite migration). `getApiKey` now routes over RPC to the
  // daemon, so this loop can only run once `bootstrapDaemon()` has resolved.
  //
  // Runs AFTER the legacy import so any connected-provider rows the import
  // just brought in are validated against secure storage in the same pass.
  try {
    const client = getDaemonClient();
    const providerSettings = await client.call('provider.getSettings');
    for (const [id, provider] of Object.entries(providerSettings.connectedProviders)) {
      const providerId = id as ProviderId;
      const credType = provider?.credentials?.type;
      if (!credType || credType === 'api_key') {
        const key = await getApiKey(providerId);
        if (!key) {
          logMain(
            'WARN',
            `[Main] Provider ${providerId} has api_key auth but key not found in secure storage`,
          );
          await client.call('provider.removeConnected', { providerId });
          logMain('INFO', `[Main] Removed provider ${providerId} due to missing API key`);
        }
      }
    }
  } catch (err) {
    logMain('ERROR', '[Main] Provider validation failed', { err: String(err) });
  }

  // `trackAppLaunched` enriches its event payload with `getAllApiKeys()`
  // (for "which providers are configured" context) — MOVED here from
  // pre-bootstrap alongside provider validation.
  if (isAnalyticsEnabled()) {
    trackAppLaunched(isFirstLaunch).catch((err) =>
      logMain('WARN', '[Main] trackAppLaunched failed', { err: String(err) }),
    );
  }

  // Milestone 4 — Google account DB + token refresh moved to the daemon.
  // Main now only holds the OAuth loopback helpers (`shell.openExternal`
  // + local HTTP listener); on successful callback the handler hands the
  // result to `gwsAccount.add` via RPC, and the daemon's
  // `GoogleAccountService.startAllTimers()` rebuilt the refresh schedule
  // on its own startup. The `setWindow` / `startAllTimers` calls on this
  // side are gone along with the classes they used to drive.
  let startGoogleOAuthFn:
    | typeof import('./google-accounts/google-auth').startGoogleOAuth
    | undefined;
  let cancelGoogleOAuthFn:
    | typeof import('./google-accounts/google-auth').cancelGoogleOAuth
    | undefined;
  try {
    const { startGoogleOAuth, cancelGoogleOAuth } = await import('./google-accounts/index');
    startGoogleOAuthFn = startGoogleOAuth;
    cancelGoogleOAuthFn = cancelGoogleOAuth;
  } catch (err) {
    logMain('WARN', '[Main] Google OAuth helpers unavailable', { err: String(err) });
  }
  // Register IPC handlers exactly once, after the import attempt settles
  registerIPCHandlers(startGoogleOAuthFn, cancelGoogleOAuthFn);
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
          // Record intent — `shutdownApp` will send `daemon.shutdown` AFTER
          // the analytics flush. Pre-M3-3a this call lived here as a
          // fire-and-forget before `app.quit()`, which raced the flush:
          // the daemon scheduled its own exit 100ms after replying while
          // `shutdownApp` spent several seconds tearing down browser/HF
          // services before reaching `trackAppClose`, producing a silent
          // flush failure on every stop-daemon quit.
          const { requestStopDaemonOnQuit } = await import('./app-shutdown');
          requestStopDaemonOnQuit();
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
      // Milestone 4: daemon owns Google token refresh now — there's no
      // main-side `setWindow` to re-bind here. `registerNotificationForwarding`
      // already uses a dynamic window getter so the recreated window
      // receives `gwsAccount.statusChanged` (and all other daemon
      // notifications) without additional wiring.
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
