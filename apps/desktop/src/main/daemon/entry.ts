/**
 * Daemon Child Process Entry Point
 *
 * This script is forked by the Electron main process. It:
 *   1. Receives PlatformConfig from the parent via IPC
 *   2. Initializes Storage using agent-core's createStorage
 *   3. Creates a DaemonServer on the parent-process transport
 *   4. Registers storage-backed RPC method handlers
 *   5. Sends a "ready" signal back to the parent
 *
 * Task execution (task.start, task.cancel, etc.) remains in the Electron main
 * process for now because the OpenCode CLI adapter depends on Electron APIs
 * (API keys from secure storage, app paths, etc.). This will be migrated in
 * a future step once the adapter is decoupled.
 *
 * This file MUST NOT import from 'electron' — it runs as a plain Node.js process.
 */

import {
  DaemonServer,
  createParentProcessTransport,
  createStorage,
} from '@accomplish_ai/agent-core';
import type { StorageAPI } from '@accomplish_ai/agent-core';

/** Initialization payload sent from the parent Electron process. */
interface DaemonInitPayload {
  type: 'daemon:init';
  userDataPath: string;
}

function isDaemonInit(msg: unknown): msg is DaemonInitPayload {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    (msg as DaemonInitPayload).type === 'daemon:init' &&
    'userDataPath' in msg
  );
}

/**
 * Register storage-backed RPC handlers on the server.
 * TaskManager-backed handlers remain in the parent process (daemon-bootstrap.ts).
 */
function registerHandlers(server: DaemonServer, storage: StorageAPI): void {
  // ── Task data queries (storage-backed) ───────────────────────────

  server.registerMethod('task.get', (params) => {
    if (!params) {
      return null;
    }
    return storage.getTask(params.taskId) ?? null;
  });

  server.registerMethod('task.list', () => {
    return storage.getTasks();
  });

  server.registerMethod('task.delete', (params) => {
    if (params) {
      storage.deleteTask(params.taskId);
    }
  });

  server.registerMethod('task.clearHistory', () => {
    storage.clearHistory();
  });

  server.registerMethod('task.getTodos', (params) => {
    if (!params) {
      return [];
    }
    return storage.getTodosForTask(params.taskId);
  });

  // ── Storage persistence ────────────────────────────────────────────

  server.registerMethod('storage.saveTask', (params) => {
    if (params) {
      storage.saveTask(params.task);
    }
  });

  server.registerMethod('storage.updateTaskStatus', (params) => {
    if (params) {
      storage.updateTaskStatus(params.taskId, params.status, params.completedAt);
    }
  });

  server.registerMethod('storage.updateTaskSummary', (params) => {
    if (params) {
      storage.updateTaskSummary(params.taskId, params.summary);
    }
  });

  server.registerMethod('storage.addTaskMessage', (params) => {
    if (params) {
      storage.addTaskMessage(params.taskId, params.message);
    }
  });
}

/**
 * Main daemon startup flow.
 */
function main(): void {
  console.log('[Daemon] Process started, pid:', process.pid);

  // Wait for initialization payload from the parent
  process.on('message', (msg) => {
    if (isDaemonInit(msg)) {
      try {
        boot(msg.userDataPath);
      } catch (err) {
        console.error('[Daemon] Boot failed:', err);
        process.exit(1);
      }
    }
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('[Daemon] Received SIGTERM, shutting down');
    process.exit(0);
  });

  process.on('disconnect', () => {
    console.log('[Daemon] Parent disconnected, shutting down');
    process.exit(0);
  });
}

function boot(userDataPath: string): void {
  console.log('[Daemon] Booting with userDataPath:', userDataPath);

  // Initialize storage
  const storage = createStorage({ userDataPath });
  console.log('[Daemon] Storage initialized');

  // Create transport and server
  const transport = createParentProcessTransport();
  const server = new DaemonServer({ transport });

  // Register storage-backed handlers
  registerHandlers(server, storage);
  console.log('[Daemon] All handlers registered');

  // Signal ready to parent
  if (process.send) {
    process.send({ type: 'daemon:ready', pid: process.pid });
  }

  console.log('[Daemon] Ready and serving requests');
}

// Start
main();
