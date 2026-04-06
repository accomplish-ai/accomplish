/**
 * Daemon Lifecycle
 *
 * Module-level state for the daemon client connection.
 * The desktop connects to the standalone daemon via Unix socket / named pipe.
 * shutdownDaemon() only closes the client — it does NOT kill the daemon process.
 */

import { DaemonClient } from '@accomplish_ai/agent-core';
import { getLogCollector } from '../logging';

let client: DaemonClient | null = null;
let mode: 'socket' | null = null;

export function setClient(c: DaemonClient | null): void {
  client = c;
}

export function setMode(m: 'socket' | null): void {
  mode = m;
}

/**
 * Get the daemon client. Throws if not bootstrapped.
 */
export function getDaemonClient(): DaemonClient {
  if (!client) {
    throw new Error('Daemon not bootstrapped. Call bootstrapDaemon() first.');
  }
  return client;
}

/**
 * Get the current daemon mode.
 */
export function getDaemonMode(): 'socket' | null {
  return mode;
}

/**
 * Shut down the daemon client connection.
 * IMPORTANT: This only closes the socket — it does NOT kill the daemon process.
 * The daemon is designed to survive Electron exit.
 */
export function shutdownDaemon(): void {
  if (client) {
    client.close();
    client = null;
  }
  mode = null;
  try {
    const l = getLogCollector();
    if (l?.log) {
      l.log('INFO', 'daemon', '[DaemonLifecycle] Daemon client disconnected');
    }
  } catch {
    /* best-effort logging */
  }
}
