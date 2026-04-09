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
import { DaemonClient, createSocketTransport, getSocketPath } from '@accomplish_ai/agent-core';
import { getNodePath } from '../utils/bundled-node';
import { getLogCollector } from '../logging';
import { getBuildConfig } from '../config/build-config';

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
 * Spawn the daemon as a fully detached process.
 * The daemon process survives Electron exit (detached + unref).
 */
export function spawnDaemon(dataDir: string): void {
  // In dev mode, use Electron's own Node runtime (process.execPath with
  // ELECTRON_RUN_AS_NODE=1) so native modules (better-sqlite3) are ABI-compatible.
  // In packaged mode, use the bundled Node.js binary.
  const nodeBin = app.isPackaged ? getNodePath() : process.execPath;
  const entryPath = getDaemonEntryPath();

  log('INFO', `[DaemonConnector] Spawning daemon: ${nodeBin} ${entryPath} --data-dir ${dataDir}`);

  const daemonEnv: Record<string, string | undefined> = {
    ...process.env,
    // In dev mode, tell Electron to act as plain Node.js
    ELECTRON_RUN_AS_NODE: app.isPackaged ? undefined : '1',
  };

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

  // In dev mode, redirect daemon output to a log file so it can be tailed
  // by any Electron process (including restarts). In production, use 'ignore'.
  const spawnOptions: Parameters<typeof spawn>[2] = {
    detached: true,
    stdio: 'ignore',
    env: daemonEnv,
  };

  if (!app.isPackaged) {
    const logPath = getDaemonLogPath(dataDir);
    const logFd = fs.openSync(logPath, 'a');
    spawnOptions.stdio = ['ignore', logFd, logFd];
  }

  const child = spawn(nodeBin, [entryPath, '--data-dir', dataDir], spawnOptions);

  child.unref();
  log('INFO', `[DaemonConnector] Daemon spawned (detached, pid=${child.pid})`);
}

/**
 * Get the path to the daemon log file.
 */
function getDaemonLogPath(dataDir: string): string {
  return path.join(dataDir, 'daemon.log');
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
  const existing = await tryConnect(dataDir);
  if (existing) {
    log('INFO', '[DaemonConnector] Connected to existing daemon');
    return existing;
  }

  log('INFO', '[DaemonConnector] No daemon found, retrying after short delay...');
  await sleep(LOGIN_ITEM_RETRY_DELAY_MS);
  const retried = await tryConnect(dataDir);
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
    const client = await tryConnect(dataDir);

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
