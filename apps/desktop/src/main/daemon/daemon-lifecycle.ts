/**
 * Daemon Lifecycle
 *
 * Module-level state and lifecycle management: getters and shutdown.
 */

import type { ChildProcess } from 'child_process';
import { DaemonServer, DaemonClient, disposeScheduler } from '@accomplish_ai/agent-core';
import { getLogCollector } from '../logging';

export let server: DaemonServer | null = null;
export let client: DaemonClient | null = null;
export let daemonProcess: ChildProcess | null = null;
export let mode: 'child-process' | 'in-process' | null = null;

export function setServer(s: DaemonServer | null): void {
  server = s;
}

export function setClient(c: DaemonClient | null): void {
  client = c;
}

export function setDaemonProcess(p: ChildProcess | null): void {
  daemonProcess = p;
}

export function setMode(m: 'child-process' | 'in-process' | null): void {
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
 * Get the daemon server (for pushing notifications). Only available in in-process mode.
 */
export function getDaemonServer(): DaemonServer | null {
  return server;
}

/**
 * Get the current daemon mode.
 */
export function getDaemonMode(): 'child-process' | 'in-process' | null {
  return mode;
}

/**
 * Shut down the daemon.
 */
export function shutdownDaemon(): void {
  if (client) {
    client.close();
    client = null;
  }
  if (server) {
    server.close();
    server = null;
  }
  if (daemonProcess) {
    daemonProcess.kill();
    daemonProcess = null;
  }
  disposeScheduler();
  mode = null;
  getLogCollector().logEnv('INFO', '[DaemonBootstrap] Daemon shut down');
}
