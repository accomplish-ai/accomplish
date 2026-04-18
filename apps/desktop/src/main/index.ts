import { config } from 'dotenv';
import { app, BrowserWindow } from 'electron';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const APP_DATA_NAME = 'Accomplish';
app.setPath('userData', path.join(app.getPath('appData'), APP_DATA_NAME));

if (process.platform === 'win32') {
  app.setAppUserModelId('ai.accomplish.desktop');
}

import { getLogCollector, initializeLogCollector } from './logging';
import { clearSecureStorage } from './store/secureStorage';
import { startApp } from './app-startup';
import { shutdownApp } from './app-shutdown';
import { trackAppCrash } from './analytics/events';
import {
  handleProtocolUrlFromArgs,
  registerProtocolEventHandlers,
  registerAppIpcHandlers,
  handleSecondInstanceProtocolUrl,
} from './protocol-handlers';
import { createMainWindow } from './app-window';

function logMain(level: 'INFO' | 'WARN' | 'ERROR', msg: string, data?: Record<string, unknown>) {
  try {
    const l = getLogCollector();
    if (l?.log) {
      l.log(level, 'main', msg, data);
    }
  } catch (_e) {
    /* best-effort logging */
  }
}

if (process.argv.includes('--e2e-skip-auth')) {
  (global as Record<string, unknown>).E2E_SKIP_AUTH = true;
}
if (process.argv.includes('--e2e-mock-tasks') || process.env.E2E_MOCK_TASK_EVENTS === '1') {
  (global as Record<string, unknown>).E2E_MOCK_TASK_EVENTS = true;
}

/**
 * Stop a daemon that survived the previous Electron session before we
 * delete its `userData` directory.
 *
 * M5 of the daemon-only-SQLite migration made the daemon the sole owner
 * of SQLite + secure storage. If a user quit with "keep daemon running",
 * a detached daemon process is still holding DB, pid, and socket file
 * descriptors under `userData`. Running `fs.rmSync` on that directory
 * while the daemon is live creates two failure modes:
 *
 *   1. `rmSync` unlinks the files the daemon has open; the daemon
 *      continues writing into dangling inodes. On the next boot we spawn
 *      a second daemon that creates fresh files, and the old daemon's
 *      in-flight writes vanish on its exit.
 *   2. Pid/socket files re-appear before the rmSync completes (the old
 *      daemon's flush cycle), and the next bootstrap observes ghost
 *      state that belongs to a process we've effectively stranded.
 *
 * Signal escalation (review round 2, finding P1):
 *   1. SIGTERM gives the daemon a chance to close SQLite cleanly. But
 *      the daemon's SIGTERM handler drains active tasks for up to
 *      `DRAIN_TIMEOUT_MS` (30s) + a 10s force-shutdown buffer. Waiting
 *      that full window would make CLEAN_START feel broken — and the
 *      user has already explicitly opted to wipe everything, so
 *      in-flight tasks are throwaway regardless.
 *   2. After `CLEAN_START_SIGTERM_GRACE_MS`, if the daemon is still
 *      alive, SIGKILL it. SIGKILL is guaranteed on POSIX; on Windows
 *      `process.kill(pid, 'SIGKILL')` collapses to TerminateProcess.
 *      The daemon loses its release-pid-lock path, but that's fine —
 *      `rmSync` below nukes the pid file anyway.
 *   3. If even SIGKILL doesn't take (kernel zombie or permissions),
 *      log and proceed — we've done what we can.
 *
 * Best-effort throughout: if the daemon is not running, is from another
 * profile, or the pid file is corrupt, we log and continue.
 */
async function stopDetachedDaemonForCleanStart(userDataPath: string): Promise<void> {
  const pidPath = path.join(userDataPath, 'daemon.pid');
  if (!fs.existsSync(pidPath)) {
    return;
  }

  let pid: number | null = null;
  try {
    const raw = fs.readFileSync(pidPath, 'utf-8');
    const parsed = JSON.parse(raw) as { pid?: unknown };
    if (typeof parsed.pid === 'number' && Number.isFinite(parsed.pid) && parsed.pid > 0) {
      pid = parsed.pid;
    }
  } catch (err) {
    logMain('WARN', '[Clean Mode] Could not parse daemon pid file; proceeding to rmSync', {
      err: String(err),
    });
    return;
  }
  if (pid === null) {
    return;
  }

  // Liveness probe — `process.kill(pid, 0)` throws if the pid is stale.
  try {
    process.kill(pid, 0);
  } catch {
    logMain('INFO', `[Clean Mode] Stale daemon pid (${pid}); no live process to stop`);
    return;
  }

  const CLEAN_START_SIGTERM_GRACE_MS = 5000;
  const CLEAN_START_SIGKILL_GRACE_MS = 3000;
  const POLL_INTERVAL_MS = 50;

  // Helper: poll `process.kill(pid, 0)` until it throws (pid gone) or
  // we hit `timeoutMs`. Returns true if the pid exited in time.
  async function waitForPidExit(pidToWatch: number, timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        process.kill(pidToWatch, 0);
      } catch {
        return true;
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
    return false;
  }

  logMain(
    'INFO',
    `[Clean Mode] SIGTERM to detached daemon (pid ${pid}); waiting up to ${CLEAN_START_SIGTERM_GRACE_MS}ms`,
  );
  try {
    process.kill(pid, 'SIGTERM');
  } catch (err) {
    logMain('WARN', `[Clean Mode] SIGTERM to daemon pid ${pid} failed`, { err: String(err) });
    return;
  }
  if (await waitForPidExit(pid, CLEAN_START_SIGTERM_GRACE_MS)) {
    logMain('INFO', `[Clean Mode] Daemon (pid ${pid}) exited cleanly; safe to rmSync`);
    return;
  }

  // Grace period elapsed — the daemon is likely inside its drain loop,
  // which can run for up to DRAIN_TIMEOUT_MS (30s) + buffer. Escalate
  // to SIGKILL since the user asked to nuke the profile.
  logMain(
    'WARN',
    `[Clean Mode] Daemon (pid ${pid}) did not exit within SIGTERM grace; escalating to SIGKILL`,
  );
  try {
    process.kill(pid, 'SIGKILL');
  } catch (err) {
    logMain('WARN', `[Clean Mode] SIGKILL to daemon pid ${pid} failed`, { err: String(err) });
    return;
  }
  if (await waitForPidExit(pid, CLEAN_START_SIGKILL_GRACE_MS)) {
    logMain('INFO', `[Clean Mode] Daemon (pid ${pid}) killed; safe to rmSync`);
    return;
  }

  // Extremely unlikely — SIGKILL bypasses the handler. A failure here
  // usually means the pid has been reparented or the user lacks
  // permission (different uid). Proceed with rmSync as a last resort.
  logMain(
    'ERROR',
    `[Clean Mode] Daemon (pid ${pid}) still alive after SIGKILL; proceeding with rmSync anyway`,
  );
}

if (process.env.CLEAN_START === '1') {
  const userDataPath = app.getPath('userData');
  logMain('INFO', `[Clean Mode] Clearing userData directory: ${userDataPath}`);
  // Top-level await (ESM module) — blocks the rest of main-process
  // startup until the detached daemon has had a chance to exit. This
  // runs before `app.whenReady()` fires, so there's no window yet and
  // no user-facing hang.
  await stopDetachedDaemonForCleanStart(userDataPath);
  try {
    if (fs.existsSync(userDataPath)) {
      fs.rmSync(userDataPath, { recursive: true, force: true });
      logMain('INFO', '[Clean Mode] Successfully cleared userData');
    }
  } catch (err) {
    logMain('ERROR', '[Clean Mode] Failed to clear userData', { err: String(err) });
  }
  // Milestone 5: `resetStorageSingleton()` is gone along with the
  // desktop-side DB handle. `clearSecureStorage()` is now a no-op
  // (kept for signature compat — see store/secureStorage.ts). The
  // `fs.rmSync` above wipes the on-disk DB / secure-storage files; the
  // daemon starts fresh on its next boot.
  clearSecureStorage();
  logMain('INFO', '[Clean Mode] userData wiped; daemon will reinitialize on spawn');
}

app.setName('Accomplish');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = app.isPackaged
  ? path.join(process.resourcesPath, '.env')
  : path.join(__dirname, '../../.env');
config({ path: envPath });

process.env.APP_ROOT = path.join(__dirname, '../..');
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron');

// Load build.env (CI-injected for Free builds; absent in OSS builds — graceful no-op)
// Must come after APP_ROOT is set — build-config.ts resolves dev path from it.
import { loadBuildConfig } from './config/build-config';
loadBuildConfig();

// Initialize Sentry early (before app ready) — no-op if SENTRY_DSN absent
import { initSentry } from './sentry';
initSentry();

const ROUTER_URL = process.env.ACCOMPLISH_ROUTER_URL;
const WEB_DIST = app.isPackaged // In production, web's build output is an extraResource.
  ? path.join(process.resourcesPath, 'web-ui')
  : path.join(process.env.APP_ROOT, '../web/dist/client');

let mainWindow: BrowserWindow | null = null;
let isQuitting = false;
// isShuttingDown is set when shutdownApp() actually starts running.
// This is the re-entrancy guard for before-quit (shutdownApp calls app.quit() at the
// end, which re-fires before-quit). It is intentionally separate from isQuitting, which
// only prevents the close dialog from appearing during shutdown.
let isShuttingDown = false;
const isQuittingRef = {
  get value() {
    return isQuitting;
  },
  set value(v: boolean) {
    isQuitting = v;
  },
};
function createWindow() {
  mainWindow = createMainWindow({ ROUTER_URL, WEB_DIST });
}

process.on('uncaughtException', (error) => {
  try {
    getLogCollector()?.log?.('ERROR', 'main', `Uncaught exception: ${error.message}`, {
      name: error.name,
      stack: error.stack,
    });
    trackAppCrash(error.name || 'uncaughtException', error.message || 'Unknown error');
  } catch {
    /* ignore */
  }
});
process.on('unhandledRejection', (reason) => {
  try {
    getLogCollector()?.log?.('ERROR', 'main', 'Unhandled promise rejection', { reason });
    trackAppCrash('unhandledRejection', String(reason).substring(0, 500));
  } catch {
    /* ignore */
  }
});

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  logMain('INFO', '[Main] Second instance attempted; quitting');
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
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
      logMain('INFO', '[Main] Focused existing instance after second-instance event');
      handleSecondInstanceProtocolUrl(mainWindow, commandLine, () => mainWindow);
    }
  });

  app.whenReady().then(async () => {
    await startApp(createWindow, () => mainWindow, isQuittingRef);
  });
}

// With system tray, the app stays alive when all windows are closed.
app.on('window-all-closed', () => {
  logMain('INFO', '[Main] All windows closed — app continues in system tray');
});

app.on('before-quit', (event) => {
  if (isShuttingDown) {
    // Re-entrancy guard: shutdownApp calls app.quit() at the end, which re-fires
    // before-quit. Allow the second call through without re-running shutdownApp.
    return;
  }
  isShuttingDown = true;
  isQuitting = true;
  event.preventDefault();
  let logger: ReturnType<typeof getLogCollector> | null = null;
  try {
    logger = getLogCollector();
  } catch {
    /* logger may not be initialized on early quit paths */
  }
  void shutdownApp(logger);
});

if (process.platform === 'win32' && !app.isPackaged) {
  app.setAsDefaultProtocolClient('accomplish', process.execPath, [path.resolve(process.argv[1])]);
} else {
  app.setAsDefaultProtocolClient('accomplish');
}

handleProtocolUrlFromArgs(() => mainWindow);
registerProtocolEventHandlers(() => mainWindow);
registerAppIpcHandlers();
