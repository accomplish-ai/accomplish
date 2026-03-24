/**
 * Daemon Spawn
 *
 * Child process spawning logic — forks a separate Node.js daemon process via IPC.
 */

import { fork } from 'child_process';
import path from 'path';
import { DaemonClient, createChildProcessTransport } from '@accomplish_ai/agent-core';
import { app } from 'electron';
import { getLogCollector } from '../logging';
import { setDaemonProcess, daemonProcess as _daemonProcess } from './daemon-lifecycle';

const DAEMON_READY_TIMEOUT_MS = 10_000;

/**
 * Resolve the path to the daemon entry script.
 */
function getDaemonEntryPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'daemon', 'entry.cjs');
  }
  return path.join(app.getAppPath(), 'out', 'main', 'daemon', 'entry.cjs');
}

/**
 * Fork the daemon as a child process and connect via IPC transport.
 */
export async function spawnDaemonProcess(): Promise<DaemonClient> {
  const entryPath = getDaemonEntryPath();
  const userDataPath = app.getPath('userData');

  return new Promise<DaemonClient>((resolve, reject) => {
    let localChild: ReturnType<typeof fork> | null = null;
    const timer = setTimeout(() => {
      reject(new Error('Daemon process did not become ready within timeout'));
      if (localChild) {
        localChild.kill();
        // Only clear module-level state if this is still the current daemon
        if (_daemonProcess === localChild) {
          setDaemonProcess(null);
        }
        localChild = null;
      }
    }, DAEMON_READY_TIMEOUT_MS);

    try {
      const child = fork(entryPath, [], {
        stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
        env: { ...process.env },
        serialization: 'advanced',
      });

      localChild = child;
      setDaemonProcess(child);

      // Forward daemon stdout/stderr to our console
      child.stdout?.on('data', (data: Buffer) => {
        process.stdout.write(`[Daemon] ${data.toString()}`);
      });
      child.stderr?.on('data', (data: Buffer) => {
        process.stderr.write(`[Daemon:err] ${data.toString()}`);
      });

      // Handle errors
      child.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });

      child.on('exit', (code) => {
        getLogCollector().logEnv(
          'INFO',
          `[DaemonBootstrap] Daemon process exited with code ${code}`,
        );
        // Only clear module state if this child is still the active one
        if (_daemonProcess === child) {
          setDaemonProcess(null);
        }
        localChild = null;
        clearTimeout(timer);
        reject(new Error(`Daemon process exited before becoming ready (code ${code})`));
      });

      // Wait for "ready" signal
      const onMessage = (msg: unknown): void => {
        if (
          typeof msg === 'object' &&
          msg !== null &&
          (msg as { type: string }).type === 'daemon:ready'
        ) {
          clearTimeout(timer);
          child.removeListener('message', onMessage);

          const transport = createChildProcessTransport(child);
          const daemonClient = new DaemonClient({ transport });

          getLogCollector().logEnv('INFO', '[DaemonBootstrap] Daemon process ready', {
            pid: (msg as { pid: number }).pid,
          });
          resolve(daemonClient);
        }
      };

      child.on('message', onMessage);

      // Send initialization payload
      child.send({
        type: 'daemon:init',
        userDataPath,
      });
    } catch (err) {
      clearTimeout(timer);
      reject(err);
    }
  });
}
