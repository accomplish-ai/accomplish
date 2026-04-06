/**
 * Daemon Bootstrap
 *
 * Connects to the standalone daemon process via Unix socket / Windows named pipe.
 * If no daemon is running, spawns one (detached, survives Electron exit).
 * Registers notification forwarding and reconnection handling.
 */

import type { BrowserWindow } from 'electron';
import type { DaemonClient } from '@accomplish_ai/agent-core';
import { createSocketTransport } from '@accomplish_ai/agent-core';
import {
  ensureDaemonRunning,
  onReconnect,
  setupDisconnectHandler,
  getDataDir,
  tailDaemonLog,
} from './daemon/daemon-connector';
import { setClient, setMode, getDaemonClient } from './daemon/daemon-lifecycle';
import { getLogCollector } from './logging';

export { getDaemonClient, getDaemonMode, shutdownDaemon } from './daemon/daemon-lifecycle';

function log(level: 'INFO' | 'WARN' | 'ERROR', msg: string): void {
  try {
    const l = getLogCollector();
    if (l?.log) {
      l.log(level, 'daemon', msg);
    }
  } catch {
    /* best-effort */
  }
}

/** Window getter for notification forwarding. Set during bootstrap. */
let windowGetter: (() => BrowserWindow | null) | null = null;

/**
 * Boot the daemon — connect to existing or spawn a new one.
 * Returns the connected DaemonClient.
 */
export async function bootstrapDaemon(): Promise<DaemonClient> {
  log('INFO', '[DaemonBootstrap] Connecting to daemon...');

  const client = await ensureDaemonRunning();
  setClient(client);
  setMode('socket');

  // Start tailing daemon logs in dev mode — works for both fresh spawns
  // and reconnections to already-running daemons
  tailDaemonLog();

  // Re-register notification forwarding if a window getter was previously set
  // (handles explicit daemon:start / daemon:restart from settings UI)
  if (windowGetter) {
    registerNotificationHandlers(client, windowGetter);
    log('INFO', '[DaemonBootstrap] Re-registered notification forwarding on new client');
  }

  // Set up disconnect detection + reconnection
  await setupTransportReconnection(client);

  // Register handler for when a new client replaces the old one after reconnect
  onReconnect(
    (state) => {
      log('INFO', `[DaemonBootstrap] Connection state: ${state}`);
    },
    (newClient) => {
      setClient(newClient);
      // Re-register notification forwarding on the new client
      if (windowGetter) {
        registerNotificationHandlers(newClient, windowGetter);
      }
      // Set up disconnect detection on the new client
      void setupTransportReconnection(newClient);
    },
  );

  log('INFO', '[DaemonBootstrap] Connected to daemon via socket');
  return client;
}

/**
 * Set up transport-level disconnect detection for reconnection.
 */
async function setupTransportReconnection(client: DaemonClient): Promise<void> {
  try {
    const transport = await createSocketTransport({
      dataDir: getDataDir(),
      connectTimeout: 2000,
    });
    setupDisconnectHandler(client, transport);
  } catch {
    // If we can't create a monitoring transport, reconnection won't auto-trigger.
    // The client itself will still detect errors on the next RPC call.
    log('WARN', '[DaemonBootstrap] Could not set up disconnect monitor');
  }
}

/**
 * Register forwarding of daemon notifications to the renderer process.
 *
 * Uses a dynamic window getter so that if the window is recreated (e.g.
 * macOS `activate` event), notifications route to the current window.
 *
 * Must be called after bootstrapDaemon().
 */
export function registerNotificationForwarding(getWindow: () => BrowserWindow | null): void {
  windowGetter = getWindow;

  let client: DaemonClient;
  try {
    client = getDaemonClient();
  } catch {
    log('WARN', '[DaemonBootstrap] Cannot register notification forwarding — no daemon client');
    return;
  }

  registerNotificationHandlers(client, getWindow);
  log('INFO', '[DaemonBootstrap] Notification forwarding registered');
}

/**
 * Wire notification handlers on a specific DaemonClient instance.
 * Called both on initial bootstrap and after reconnection.
 */
function registerNotificationHandlers(
  client: DaemonClient,
  getWindow: () => BrowserWindow | null,
): void {
  const forward = (channel: string, data: unknown): void => {
    const win = getWindow();
    if (!win || win.isDestroyed()) {
      return;
    }
    try {
      win.webContents.send(channel, data);
    } catch {
      // Window torn down between check and send — safe to ignore
    }
  };

  // Task execution events
  client.onNotification('task.progress', (data) => {
    forward('task:progress', data);
  });

  client.onNotification('task.message', (data) => {
    forward('task:update:batch', data);
  });

  client.onNotification('task.complete', (data) => {
    forward('task:update', { taskId: data.taskId, type: 'complete', result: data.result });
  });

  client.onNotification('task.error', (data) => {
    forward('task:update', { taskId: data.taskId, type: 'error', error: data.error });
  });

  client.onNotification('task.statusChange', (data) => {
    forward('task:status-change', data);
  });

  client.onNotification('task.summary', (data) => {
    forward('task:summary', data);
  });

  // Permission / question requests
  client.onNotification('permission.request', (data) => {
    forward('permission:request', data);
  });

  // Todo updates
  client.onNotification('todo.update', (data) => {
    forward('todo:update', data);
  });

  // Thought stream events
  client.onNotification('task.thought', (data) => {
    forward('task:thought', data);
  });

  client.onNotification('task.checkpoint', (data) => {
    forward('task:checkpoint', data);
  });

  // WhatsApp events
  client.onNotification('whatsapp.qr', (data) => {
    forward('integrations:whatsapp:qr', (data as { qr: string }).qr);
  });

  client.onNotification('whatsapp.status', (data) => {
    forward('integrations:whatsapp:status', (data as { status: string }).status);
  });
}
