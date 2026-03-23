/**
 * Daemon Bootstrap
 *
 * Manages the daemon lifecycle with two modes:
 *   1. **Child process** (Step 3): forks a separate Node.js process via IPC channel
 *   2. **In-process** (Step 2 fallback): runs everything in the Electron main process
 *
 * The bootstrap automatically falls back to in-process mode if the child
 * process fails to start.
 */

import { DaemonClient } from '@accomplish_ai/agent-core';
import type { TaskManagerAPI, StorageAPI } from '@accomplish_ai/agent-core';
import { getLogCollector } from './logging';
import { spawnDaemonProcess } from './daemon/daemon-spawn';
import { bootstrapInProcess } from './daemon/daemon-inprocess';
import { setClient, setMode } from './daemon/daemon-lifecycle';

export interface DaemonBootstrapOptions {
  taskManager: TaskManagerAPI;
  storage: StorageAPI;
}

// Re-export everything that was previously exported from this file
export { bootstrapInProcess } from './daemon/daemon-inprocess';
export {
  getDaemonClient,
  getDaemonServer,
  getDaemonMode,
  shutdownDaemon,
} from './daemon/daemon-lifecycle';

/**
 * Boot the daemon — tries child process first, falls back to in-process.
 */
export async function bootstrapDaemon(options: DaemonBootstrapOptions): Promise<DaemonClient> {
  const { taskManager, storage } = options;

  // Try child process mode
  try {
    const childClient = await spawnDaemonProcess();
    getLogCollector().logEnv('INFO', '[DaemonBootstrap] Running in child-process mode');
    setClient(childClient);
    setMode('child-process');
    return childClient;
  } catch (err) {
    getLogCollector().logEnv(
      'WARN',
      '[DaemonBootstrap] Child process failed, falling back to in-process',
      { error: String(err) },
    );
  }

  // Fallback: in-process mode (Step 2 behavior)
  return bootstrapInProcess(taskManager, storage);
}
