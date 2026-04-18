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
 * Match the daemon's worst-case graceful-shutdown window. The daemon's
 * SIGTERM handler (apps/daemon/src/index.ts) drains active tasks for up
 * to `DRAIN_TIMEOUT_MS = 30_000ms`, then `forceShutdown` fires
 * 10_000ms after that — absolute worst case 40s from signal to exit.
 * 45s gives us a small margin to observe the socket close after the
 * process actually terminates.
 *
 * Round-4 review finding P1.G: the previous 10s bound was too short.
 * After it elapsed we continued to `rmSync` even when we had just
 * confirmed (via socket identity) that a live daemon still owned the
 * profile — the exact corruption hazard CLEAN_START is supposed to
 * avoid. Now we either wait out the real drain window OR abort the
 * whole CLEAN_START.
 */
const CLEAN_START_CONNECT_TIMEOUT_MS = 2_000;
const CLEAN_START_SHUTDOWN_TIMEOUT_MS = 45_000;

/**
 * Result of the pre-rmSync daemon check:
 *   - `no-daemon`     — socket connect failed; either no daemon was
 *                       running, or any pid file is stale. Safe to
 *                       rmSync.
 *   - `exited`        — we connected to an Accomplish daemon, sent it
 *                       `daemon.shutdown`, and observed the socket
 *                       close within the drain window. Safe to rmSync.
 *   - `still-alive`   — we connected to a live Accomplish daemon but
 *                       it did NOT close the socket within the drain
 *                       window. Rm under a live owner would corrupt
 *                       state — caller must abort.
 */
type CleanStartDaemonState = 'no-daemon' | 'exited' | 'still-alive';

/**
 * Stop a daemon that survived the previous Electron session before we
 * delete its `userData` directory.
 *
 * M5 of the daemon-only-SQLite migration made the daemon the sole owner
 * of SQLite + secure storage. If a user quit with "keep daemon running",
 * a detached daemon process is still holding DB, pid, and socket file
 * descriptors under `userData`. Running `fs.rmSync` on that directory
 * while the daemon is live corrupts the on-disk state (files unlinked
 * under open fds, pid/socket reappearing during daemon flush, etc.).
 *
 * Identity-safe shutdown:
 *   1. Connect to the profile-scoped daemon socket — a successful
 *      connect proves the peer is *our* daemon for *this* userData.
 *      We never raw-signal a pid (pid-reuse would be catastrophic).
 *   2. Send `daemon.shutdown` RPC, wait for the socket to close within
 *      `CLEAN_START_SHUTDOWN_TIMEOUT_MS` (45s, matching the daemon's
 *      full drain window).
 *   3. If the socket connect fails, return `'no-daemon'` — stale/crashed
 *      daemon traces can be safely rmSync'd.
 *   4. If the daemon exits in time, return `'exited'` — safe to rmSync.
 *   5. If the daemon is confirmed alive and doesn't exit, return
 *      `'still-alive'` — the caller MUST abort rather than rmSync
 *      under a live SQLite owner (review round 4 finding P1.G).
 */
async function stopDetachedDaemonForCleanStart(
  userDataPath: string,
): Promise<CleanStartDaemonState> {
  // Quick check: if neither the pid file nor the socket exist, no
  // previous daemon left traces. Skip the connect attempt entirely.
  const pidPath = path.join(userDataPath, 'daemon.pid');
  if (!fs.existsSync(pidPath)) {
    return 'no-daemon';
  }

  let DaemonClientCtor: typeof import('@accomplish_ai/agent-core/desktop-main').DaemonClient;
  let createSocketTransport: typeof import('@accomplish_ai/agent-core/desktop-main').createSocketTransport;
  try {
    const mod = await import('@accomplish_ai/agent-core/desktop-main');
    DaemonClientCtor = mod.DaemonClient;
    createSocketTransport = mod.createSocketTransport;
  } catch (err) {
    logMain('WARN', '[Clean Mode] Could not load daemon-client transport; treating as no-daemon', {
      err: String(err),
    });
    return 'no-daemon';
  }

  // Attempt to connect to the profile-scoped socket. A successful
  // connect proves the peer is an Accomplish daemon for THIS userData.
  let transport: Awaited<ReturnType<typeof createSocketTransport>>;
  try {
    transport = await createSocketTransport({
      dataDir: userDataPath,
      connectTimeout: CLEAN_START_CONNECT_TIMEOUT_MS,
    });
  } catch (err) {
    // Common cases: socket file doesn't exist, or it exists but nothing
    // is listening. Either way the pid (if any) belongs to a crashed
    // daemon or a reused-pid ghost. Do not signal.
    logMain(
      'INFO',
      `[Clean Mode] Could not connect to daemon socket; leaving any stale pid alone. ${String(err)}`,
    );
    return 'no-daemon';
  }

  const client = new DaemonClientCtor({ transport });
  let daemonExited = false;

  try {
    // Subscribe to transport disconnect BEFORE firing shutdown so we
    // don't miss a fast close between RPC reply and the wait below.
    const closePromise = new Promise<void>((resolve) => {
      transport.onDisconnect(() => {
        daemonExited = true;
        resolve();
      });
    });

    logMain('INFO', '[Clean Mode] Connected to detached daemon; sending shutdown RPC');
    try {
      await client.call('daemon.shutdown');
    } catch (err) {
      // Daemon may close the socket before sending a reply — some RPC
      // transports surface that as a call-side rejection. The close
      // promise below is the real signal.
      logMain('INFO', `[Clean Mode] daemon.shutdown RPC returned: ${String(err)}`);
    }

    const timeout = new Promise<void>((resolve) =>
      setTimeout(resolve, CLEAN_START_SHUTDOWN_TIMEOUT_MS),
    );
    await Promise.race([closePromise, timeout]);

    if (daemonExited) {
      logMain('INFO', '[Clean Mode] Detached daemon closed its socket; safe to rmSync');
      return 'exited';
    }

    // Confirmed-live daemon did not exit within the drain window.
    // Return `still-alive` so the caller aborts; do NOT rmSync (that
    // would corrupt SQLite/secure-storage under a live writer).
    logMain(
      'ERROR',
      `[Clean Mode] Confirmed-live daemon did not close within ${CLEAN_START_SHUTDOWN_TIMEOUT_MS}ms; ` +
        `refusing to rmSync under a live owner.`,
    );
    return 'still-alive';
  } finally {
    try {
      client.close();
    } catch {
      /* best-effort */
    }
    try {
      transport.close();
    } catch {
      /* best-effort */
    }
  }
}

if (process.env.CLEAN_START === '1') {
  const userDataPath = app.getPath('userData');
  logMain('INFO', `[Clean Mode] Clearing userData directory: ${userDataPath}`);
  // Top-level await (ESM module) — blocks the rest of main-process
  // startup until the detached daemon has had a chance to exit. This
  // runs before `app.whenReady()` fires, so there's no window yet and
  // no user-facing hang.
  const shutdownState = await stopDetachedDaemonForCleanStart(userDataPath);

  if (shutdownState === 'still-alive') {
    // Round-4 review finding P1.G: we confirmed via socket identity
    // that an Accomplish daemon owns this profile and it didn't exit
    // inside the daemon's own 40s drain window. Deleting under it
    // would corrupt SQLite/secure-storage state. Abort with a clear
    // error directed at the user — the daemon will finish its active
    // tasks and exit on its own, after which CLEAN_START can retry.
    const abortMsg =
      '[CLEAN_START] Aborted: an Accomplish daemon is still active on this profile and did ' +
      `not exit within ${CLEAN_START_SHUTDOWN_TIMEOUT_MS / 1000}s. Deleting userData under a ` +
      'live owner would corrupt SQLite and secure-storage state.\n\n' +
      'Fully quit the app (check the system tray for a running daemon) and retry ' +
      'CLEAN_START, or wait for active tasks to finish and let the daemon exit naturally.';
    logMain('ERROR', abortMsg);
    // Before app.whenReady(), Electron's dialog/app.quit paths are
    // unreliable. A process.exit(1) is the cleanest signal to the
    // launcher (pnpm run script / CI) that CLEAN_START refused to
    // proceed. Use code 1 so shell pipelines flag the failure.
    console.error(`\n${abortMsg}\n`);
    process.exit(1);
  }

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
