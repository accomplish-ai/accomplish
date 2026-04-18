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
 * while the daemon is live corrupts the on-disk state (files unlinked
 * under open fds, pid/socket reappearing during daemon flush, etc.).
 *
 * Round-3 review finding P1.E: the pre-fix path read `daemon.pid` and
 * raw-signalled the pid with SIGTERM/SIGKILL. The OS reuses pids, so a
 * stale lock file can point at a PID now owned by an unrelated process
 * (editor, browser, etc.) — SIGKILL'ing it would be a very bad day.
 *
 * Identity-safe shutdown:
 *   1. Import the `DaemonClient` + `createSocketTransport` from
 *      agent-core/desktop-main and try to connect to the profile's
 *      socket path. A successful connection proves *an Accomplish
 *      daemon process* is listening on *this profile's* socket — the
 *      identity we need. The pid file alone is not trustworthy.
 *   2. On connect: send `daemon.shutdown` RPC. The daemon replies
 *      immediately then schedules its own graceful shutdown 100ms
 *      later (apps/daemon/src/index.ts). Wait for the socket to close,
 *      bounded by `CLEAN_START_SHUTDOWN_TIMEOUT_MS`.
 *   3. If the socket connect fails (daemon crashed, left stale pid),
 *      we CANNOT safely touch the pid — log, skip the kill, let
 *      `rmSync` unlink the stale files. This is the right outcome:
 *      CLEAN_START's contract is "wipe the profile", not "kill any
 *      process that happens to match a stale pid we found".
 *
 * The only process signal we emit in this path is via RPC over the
 * profile-scoped socket. Pid-reuse cannot produce a false positive.
 */
async function stopDetachedDaemonForCleanStart(userDataPath: string): Promise<void> {
  // Quick check: if neither the pid file nor the socket exist, no
  // previous daemon left traces. Skip the connect attempt entirely.
  const pidPath = path.join(userDataPath, 'daemon.pid');
  if (!fs.existsSync(pidPath)) {
    return;
  }

  const CLEAN_START_CONNECT_TIMEOUT_MS = 2000;
  const CLEAN_START_SHUTDOWN_TIMEOUT_MS = 10_000;

  let DaemonClientCtor: typeof import('@accomplish_ai/agent-core/desktop-main').DaemonClient;
  let createSocketTransport: typeof import('@accomplish_ai/agent-core/desktop-main').createSocketTransport;
  try {
    const mod = await import('@accomplish_ai/agent-core/desktop-main');
    DaemonClientCtor = mod.DaemonClient;
    createSocketTransport = mod.createSocketTransport;
  } catch (err) {
    logMain(
      'WARN',
      '[Clean Mode] Could not load daemon-client transport; skipping identity-safe shutdown',
      { err: String(err) },
    );
    return;
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
    return;
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
    } else {
      // The daemon is still draining (active tasks held it past the
      // shutdown timeout). Proceed anyway — CLEAN_START is destructive
      // by design. No raw pid signal: the daemon will exit on its own
      // soon, and its writes into an rmSync'd directory are the
      // daemon's problem, not ours.
      logMain(
        'WARN',
        `[Clean Mode] Daemon did not close socket within ${CLEAN_START_SHUTDOWN_TIMEOUT_MS}ms; ` +
          `proceeding with rmSync (daemon will exit on its own drain timeout).`,
      );
    }
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
