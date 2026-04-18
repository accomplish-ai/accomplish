/**
 * Daemon Connector
 *
 * Spawns the daemon as a detached process (survives Electron exit) and
 * connects via Unix socket / Windows named pipe. If the daemon is already
 * running (e.g. started by OS login item), reuses the existing instance.
 *
 * Also handles reconnection with exponential backoff if the daemon
 * disconnects (crash, restart, etc.).
 */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { app, BrowserWindow } from 'electron';
import {
  DaemonClient,
  createSocketTransport,
  getSocketPath,
} from '@accomplish_ai/agent-core/desktop-main';
import { getNodePath } from '../utils/bundled-node';
import { getLogCollector } from '../logging';
import { getBuildConfig, getBuildId } from '../config/build-config';
import { getPidFilePath } from '@accomplish_ai/agent-core/desktop-main';

/** How long to wait for the daemon to become ready after spawning. */
const SPAWN_READY_TIMEOUT_MS = 10_000;
/** Interval between connection attempts while waiting for daemon. */
const POLL_INTERVAL_MS = 200;
/** Short delay to allow a login-item-started daemon to finish booting. */
const LOGIN_ITEM_RETRY_DELAY_MS = 500;

/** Reconnection backoff config */
const RECONNECT_INITIAL_MS = 200;
const RECONNECT_MAX_MS = 5000;
const RECONNECT_MAX_ATTEMPTS = 10;

function log(level: 'INFO' | 'WARN' | 'ERROR', msg: string, data?: Record<string, unknown>): void {
  try {
    const l = getLogCollector();
    if (l?.log) {
      l.log(level, 'daemon', msg, data);
    }
  } catch {
    /* best-effort */
  }
}

/**
 * Resolve the data directory for the daemon.
 * Must match the data-dir contract: daemon uses same DB, socket, PID.
 */
export function getDataDir(): string {
  return app.getPath('userData');
}

/**
 * Resolve the path to the daemon entry script.
 */
export function getDaemonEntryPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'daemon', 'index.js');
  }
  return path.join(app.getAppPath(), '..', 'daemon', 'dist', 'index.js');
}

/**
 * Try to connect to an already-running daemon.
 * Returns a connected DaemonClient, or null if the daemon is not reachable.
 */
async function tryConnect(dataDir: string): Promise<DaemonClient | null> {
  let transport: Awaited<ReturnType<typeof createSocketTransport>> | null = null;
  let client: DaemonClient | null = null;
  try {
    transport = await createSocketTransport({
      dataDir,
      connectTimeout: 2000,
    });
    client = new DaemonClient({ transport });
    await client.ping();
    return client;
  } catch {
    if (client) {
      client.close();
    } else if (transport) {
      transport.close();
    }
    return null;
  }
}

/**
 * Error thrown when a stale daemon could not be stopped during version-guard restart.
 */
export class DaemonRestartError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DaemonRestartError';
  }
}

/**
 * Try to connect to a daemon with matching build identity.
 *
 * If the daemon is reachable but has a different buildId (or no buildId — older version),
 * sends a shutdown request and waits for the old daemon to exit so the caller can spawn a new one.
 *
 * Used by both ensureDaemonRunning() and reconnectWithBackoff() — centralized guard.
 */
async function tryConnectBuildChecked(dataDir: string): Promise<DaemonClient | null> {
  const client = await tryConnect(dataDir);
  if (!client) return null;

  try {
    const pingResult = await client.ping();
    const expectedBuildId = getBuildId();

    if (pingResult.buildId === expectedBuildId) {
      // Same build — reuse this daemon
      return client;
    }

    // Build mismatch (or old daemon without buildId) — restart
    log(
      'INFO',
      `[DaemonConnector] Build mismatch: daemon=${pingResult.buildId ?? 'none'}, app=${expectedBuildId}. Restarting daemon...`,
    );

    // Await the shutdown RPC ack before closing (daemon defers exit until after reply)
    await client.call('daemon.shutdown').catch(() => {});
    client.close();

    // Wait for old daemon to exit (up to 30s — matches daemon's DRAIN_TIMEOUT_MS)
    await waitForDaemonExit(dataDir, 30_000);

    return null; // Caller will spawn a new daemon
  } catch (err) {
    client.close();
    // Let DaemonRestartError propagate — it surfaces the user-facing dialog
    if (err instanceof DaemonRestartError) throw err;
    // Other errors (ping failed, shutdown failed) — treat as "no daemon"
    return null;
  }
}

/**
 * Wait for the daemon process to exit by polling the PID file.
 * Throws DaemonRestartError if the daemon doesn't exit within timeoutMs.
 * Does NOT clean up socket/PID files — the old daemon still owns them if alive.
 */
async function waitForDaemonExit(dataDir: string, timeoutMs: number = 30_000): Promise<void> {
  const pidPath = getPidFilePath(dataDir);
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    // Check if PID file exists
    if (!fs.existsSync(pidPath)) {
      return; // Daemon exited and cleaned up
    }

    // Check if the process is still alive
    try {
      const content = fs.readFileSync(pidPath, 'utf8');
      const { pid } = JSON.parse(content);
      process.kill(pid, 0); // Signal 0 = check if alive, no actual signal sent
      // Still alive — wait and retry
      await sleep(200);
    } catch {
      // Process dead or PID file unreadable — daemon is gone
      return;
    }
  }

  // Timeout — daemon didn't exit. Don't clean up its state.
  throw new DaemonRestartError(
    'Old daemon did not exit within 30s after shutdown request. Please restart the application.',
  );
}

/**
 * Dev-mode resolver for a real Node binary to spawn the daemon with.
 *
 * Pre-M6: dev mode used `process.execPath` + `ELECTRON_RUN_AS_NODE=1`,
 * which runs Electron's embedded Node (ABI 145 for Electron 41). That
 * worked because the daemon's `better-sqlite3` was rebuilt to match
 * Electron's ABI as part of desktop's `@electron/rebuild` postinstall.
 *
 * Post-M6 (daemon-only-SQLite migration): desktop no longer owns
 * `better-sqlite3`, `@electron/rebuild` is gone, and the daemon's own
 * copy is built for normal Node's ABI (137 for Node 24). Spawning with
 * Electron-as-Node now crashes immediately:
 *   "better_sqlite3.node was compiled against NODE_MODULE_VERSION 137.
 *    This version of Node.js requires NODE_MODULE_VERSION 145."
 *
 * Preference order:
 *   1. Bundled Node under `resources/nodejs/<platform>-<arch>/…` —
 *      same binary the packaged app uses. Requires
 *      `pnpm -F @accomplish/desktop download:nodejs` to have been run;
 *      the build scripts chain it in, so most dev checkouts already
 *      have it.
 *   2. `process.env.npm_node_execpath` — the Node that launched pnpm.
 *      This is also the Node that ran `pnpm install` in
 *      `apps/daemon/`, so its ABI matches whatever prebuild
 *      prebuild-install resolved for `apps/daemon/node_modules/
 *      better-sqlite3`. Reliable when pnpm is on the shell's PATH.
 *   3. Literal `node` — last resort. May pick up a different Node
 *      major than the one that built the daemon's native deps, so
 *      this only succeeds if the user has Node 24 on PATH.
 */
function getDevNodePath(): string {
  try {
    return getNodePath();
  } catch {
    // Bundled Node not downloaded yet — fall through.
  }

  const pnpmNode = process.env.npm_node_execpath;
  if (pnpmNode && fs.existsSync(pnpmNode)) {
    return pnpmNode;
  }

  return 'node';
}

/**
 * Spawn the daemon as a fully detached process.
 * The daemon process survives Electron exit (detached + unref).
 */
export function spawnDaemon(dataDir: string): void {
  // M6 invariant: spawn under real Node (bundled in packaged mode, same
  // or system Node in dev) — never Electron-as-Node. The daemon's
  // `better-sqlite3` is built against Node's ABI, not Electron's.
  const nodeBin = app.isPackaged ? getNodePath() : getDevNodePath();
  const entryPath = getDaemonEntryPath();

  log('INFO', `[DaemonConnector] Spawning daemon: ${nodeBin} ${entryPath} --data-dir ${dataDir}`);

  const daemonEnv: Record<string, string | undefined> = {
    ...process.env,
    // Build identity for version-guard — daemon returns this in ping response
    ACCOMPLISH_BUILD_ID: getBuildId(),
  };
  // M6: `ELECTRON_RUN_AS_NODE` is actively harmful now — it forces
  // Electron's ABI regardless of the launcher binary. Pre-M6 we set
  // this for dev mode; post-M6 we must ensure it's NOT set even if
  // the parent Electron process inherited it from its own shell.
  delete daemonEnv.ELECTRON_RUN_AS_NODE;

  // Inject gateway URL so the daemon can start the Accomplish AI proxy.
  // Only set when build.env is present (Free builds); absent in OSS builds.
  const bc = getBuildConfig();
  if (bc.accomplishGatewayUrl) {
    daemonEnv.ACCOMPLISH_GATEWAY_URL = bc.accomplishGatewayUrl;
  }
  if (app.isPackaged) {
    daemonEnv.ACCOMPLISH_IS_PACKAGED = '1';
    daemonEnv.ACCOMPLISH_RESOURCES_PATH = process.resourcesPath;
    daemonEnv.ACCOMPLISH_APP_PATH = app.getAppPath();
  } else {
    // Dev mode: pass desktop app path so daemon can find bundled Node.js
    // and other resources relative to the desktop workspace
    daemonEnv.ACCOMPLISH_APP_PATH = app.getAppPath();
    daemonEnv.ACCOMPLISH_RESOURCES_PATH = path.join(app.getAppPath(), 'resources');
  }

  // Always redirect daemon stdout/stderr to daemon.log — essential for
  // debugging in both dev and production. Without this, packaged daemon
  // crashes are invisible (stdio: 'ignore' sends output nowhere).
  const logPath = getDaemonLogPath(dataDir);
  const logFd = fs.openSync(logPath, 'a');
  try {
    const child = spawn(nodeBin, [entryPath, '--data-dir', dataDir], {
      detached: true,
      stdio: ['ignore', logFd, logFd],
      env: daemonEnv,
    });
    child.unref();
    log('INFO', `[DaemonConnector] Daemon spawned (detached, pid=${child.pid})`);
  } finally {
    // Close the parent's copy of the log fd — child inherited it.
    // try/finally ensures cleanup even if spawn() throws.
    fs.closeSync(logFd);
  }
}

/**
 * Get the path to today's daemon log file (date-rotated, matches app log pattern).
 * Also cleans up old daemon logs (keeps last 7 days).
 */
function getDaemonLogPath(dataDir: string): string {
  const logsDir = path.join(dataDir, 'logs');
  fs.mkdirSync(logsDir, { recursive: true });

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const logPath = path.join(logsDir, `daemon-${today}.log`);

  // Clean up old daemon logs (keep last 7 days)
  try {
    const files = fs
      .readdirSync(logsDir)
      .filter((f) => f.startsWith('daemon-') && f.endsWith('.log'));
    if (files.length > 7) {
      files.sort();
      for (const old of files.slice(0, files.length - 7)) {
        fs.unlinkSync(path.join(logsDir, old));
      }
    }
  } catch {
    // Best-effort cleanup
  }

  return logPath;
}

/** Active log tail watcher — only one at a time */
let logWatcher: fs.FSWatcher | null = null;

/**
 * Start tailing the daemon log file in dev mode.
 * Prints new lines to the main process console with colored prefix.
 * Safe to call multiple times — replaces any existing tail.
 */
export function tailDaemonLog(): void {
  if (app.isPackaged) {
    return;
  }

  // Stop any existing tail
  stopTailingDaemonLog();

  const dataDir = getDataDir();
  const logPath = getDaemonLogPath(dataDir);

  if (!fs.existsSync(logPath)) {
    return;
  }

  const CYAN = '\x1b[36m';
  const RESET = '\x1b[0m';

  // Start reading from current end of file
  let fileSize = fs.statSync(logPath).size;

  logWatcher = fs.watch(logPath, () => {
    try {
      const newSize = fs.statSync(logPath).size;
      if (newSize <= fileSize) {
        fileSize = newSize; // File was truncated
        return;
      }

      const buf = Buffer.alloc(newSize - fileSize);
      const fd = fs.openSync(logPath, 'r');
      fs.readSync(fd, buf, 0, buf.length, fileSize);
      fs.closeSync(fd);
      fileSize = newSize;

      const lines = buf.toString().trimEnd().split('\n');
      for (const line of lines) {
        if (line.trim()) {
          process.stdout.write(`${CYAN}[Daemon]${RESET} ${line}\n`);
        }
      }
    } catch {
      // File may have been deleted or rotated — ignore
    }
  });
}

/**
 * Stop tailing the daemon log file.
 */
export function stopTailingDaemonLog(): void {
  if (logWatcher) {
    logWatcher.close();
    logWatcher = null;
  }
}

/**
 * Wait for the daemon to become connectable, polling at POLL_INTERVAL_MS.
 */
async function waitForDaemon(dataDir: string, timeoutMs: number): Promise<DaemonClient> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const client = await tryConnect(dataDir);
    if (client) {
      return client;
    }
    await sleep(POLL_INTERVAL_MS);
  }

  throw new Error(
    `Daemon did not become ready within ${timeoutMs}ms. ` +
      `Socket path: ${getSocketPath(dataDir)}`,
  );
}

/**
 * Ensure a daemon is running and return a connected DaemonClient.
 */
export async function ensureDaemonRunning(): Promise<DaemonClient> {
  const dataDir = getDataDir();

  log('INFO', '[DaemonConnector] Attempting connection to existing daemon...');
  const existing = await tryConnectBuildChecked(dataDir);
  if (existing) {
    log('INFO', '[DaemonConnector] Connected to existing daemon');
    return existing;
  }

  log('INFO', '[DaemonConnector] No daemon found, retrying after short delay...');
  await sleep(LOGIN_ITEM_RETRY_DELAY_MS);
  const retried = await tryConnectBuildChecked(dataDir);
  if (retried) {
    log('INFO', '[DaemonConnector] Connected to daemon (login item)');
    return retried;
  }

  log('INFO', '[DaemonConnector] Spawning new daemon...');
  spawnDaemon(dataDir);

  const client = await waitForDaemon(dataDir, SPAWN_READY_TIMEOUT_MS);
  log('INFO', '[DaemonConnector] Connected to newly spawned daemon');
  return client;
}

// =============================================================================
// Reconnection
// =============================================================================

/** Callback for connection state changes. */
export type ConnectionStateHandler = (state: 'connected' | 'disconnected' | 'reconnecting') => void;

let reconnecting = false;
let reconnectSuppressed = false;
let onStateChange: ConnectionStateHandler | null = null;
let onClientReplaced: ((client: DaemonClient) => void) | null = null;

/**
 * Whether the daemon was explicitly stopped by the user.
 * Used by workspace guards to distinguish intentional stop from transient disconnect.
 */
export function isDaemonStopped(): boolean {
  return reconnectSuppressed;
}

/**
 * Suppress automatic reconnection. Call before explicit daemon stop/restart
 * to prevent the reconnect monitor from fighting the intentional disconnect.
 */
export function suppressReconnect(): void {
  reconnectSuppressed = true;
  log('INFO', '[DaemonConnector] Reconnection suppressed');
}

/**
 * Re-enable automatic reconnection after explicit stop/restart completes.
 */
export function enableReconnect(): void {
  reconnectSuppressed = false;
  log('INFO', '[DaemonConnector] Reconnection re-enabled');
}

/**
 * Register handlers for reconnection lifecycle events.
 *
 * @param stateHandler — called when connection state changes
 * @param clientHandler — called with the new DaemonClient after successful reconnection
 */
export function onReconnect(
  stateHandler: ConnectionStateHandler,
  clientHandler: (client: DaemonClient) => void,
): void {
  onStateChange = stateHandler;
  onClientReplaced = clientHandler;
}

/**
 * Set up disconnect detection on a DaemonClient's transport.
 * When the socket closes, begins reconnection with exponential backoff.
 */
export function setupDisconnectHandler(
  client: DaemonClient,
  transport: Awaited<ReturnType<typeof createSocketTransport>>,
): void {
  transport.onDisconnect(() => {
    if (reconnecting || reconnectSuppressed) {
      return;
    }
    reconnecting = true;
    log('WARN', '[DaemonConnector] Daemon disconnected — starting reconnection...');

    // Notify renderer
    onStateChange?.('disconnected');
    broadcastToRenderer('daemon:disconnected');

    void reconnectWithBackoff().finally(() => {
      reconnecting = false;
    });
  });
}

async function reconnectWithBackoff(): Promise<void> {
  let delay = RECONNECT_INITIAL_MS;

  for (let attempt = 1; attempt <= RECONNECT_MAX_ATTEMPTS; attempt++) {
    // Check suppression on EVERY iteration — not just at entry
    if (reconnectSuppressed) {
      log('INFO', '[DaemonConnector] Reconnect loop cancelled (suppressed)');
      return;
    }

    onStateChange?.('reconnecting');
    log('INFO', `[DaemonConnector] Reconnect attempt ${attempt}/${RECONNECT_MAX_ATTEMPTS}...`);

    await sleep(delay);

    if (reconnectSuppressed) {
      log('INFO', '[DaemonConnector] Reconnect loop cancelled after delay (suppressed)');
      return;
    }

    const dataDir = getDataDir();
    let client: DaemonClient | null = null;
    try {
      client = await tryConnectBuildChecked(dataDir);
    } catch (err) {
      if (err instanceof DaemonRestartError) {
        // Stale daemon couldn't be stopped — broadcast failure and stop retrying
        log('ERROR', `[DaemonConnector] ${String(err)}`);
        broadcastToRenderer('daemon:reconnect-failed');
        return;
      }
      // Other errors — continue retry loop
    }

    if (client) {
      log('INFO', '[DaemonConnector] Reconnected to daemon');
      onStateChange?.('connected');
      onClientReplaced?.(client);
      broadcastToRenderer('daemon:reconnected');
      return;
    }

    delay = Math.min(delay * 2, RECONNECT_MAX_MS);
  }

  // Check one final time before spawning
  if (reconnectSuppressed) {
    log('INFO', '[DaemonConnector] Reconnect spawn cancelled (suppressed)');
    return;
  }

  // All retries failed — try spawning a new daemon
  log('WARN', '[DaemonConnector] All reconnect attempts failed — spawning new daemon...');
  const dataDir = getDataDir();
  spawnDaemon(dataDir);

  try {
    const client = await waitForDaemon(dataDir, SPAWN_READY_TIMEOUT_MS);
    log('INFO', '[DaemonConnector] Connected to newly spawned daemon after reconnect');
    onStateChange?.('connected');
    onClientReplaced?.(client);
    broadcastToRenderer('daemon:reconnected');
  } catch (err) {
    log('ERROR', `[DaemonConnector] Failed to reconnect: ${String(err)}`);
    broadcastToRenderer('daemon:reconnect-failed');
  }
}

function broadcastToRenderer(channel: string): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      try {
        win.webContents.send(channel);
      } catch {
        // Window torn down — safe to ignore
      }
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
