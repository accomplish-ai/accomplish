/**
 * Protocol URL handler helpers for `accomplish://` deep-link callbacks.
 *
 * Handles both the macOS `open-url` event and the Windows argv-based
 * protocol activation on startup and second-instance events.
 *
 * URLs received before the renderer is ready are queued and replayed once a
 * window with a loaded renderer is available.
 */

import { app, ipcMain } from 'electron';
import type { BrowserWindow } from 'electron';

/**
 * Reference getter for the main window — injected so this module doesn't
 * hold a direct reference to the mutable `mainWindow` variable in index.ts.
 */
type WindowGetter = () => BrowserWindow | null;

/** Short-lived queue for URLs that arrive before the renderer is ready. */
const protocolUrlQueue: string[] = [];

function dispatchProtocolUrl(win: BrowserWindow, url: string): void {
  if (url.startsWith('accomplish://callback/mcp')) {
    win.webContents.send('auth:mcp-callback', url);
  } else if (url.startsWith('accomplish://callback')) {
    win.webContents.send('auth:callback', url);
  }
}

function isRendererReady(win: BrowserWindow): boolean {
  return !win.webContents.isLoadingMainFrame() && !win.isDestroyed();
}

/** Drain any queued protocol URLs into the given window if its renderer is ready. */
export function drainProtocolUrlQueue(win: BrowserWindow): void {
  if (!isRendererReady(win)) {
    win.webContents.once('did-finish-load', () => drainProtocolUrlQueue(win));
    return;
  }

  while (protocolUrlQueue.length > 0) {
    const url = protocolUrlQueue.shift();
    if (url) {
      dispatchProtocolUrl(win, url);
    }
  }
}

function enqueueProtocolUrl(url: string, getMainWindow: WindowGetter): void {
  protocolUrlQueue.push(url);
  const win = getMainWindow();

  if (win && !win.isDestroyed()) {
    if (isRendererReady(win)) {
      drainProtocolUrlQueue(win);
    } else {
      win.webContents.once('did-finish-load', () => drainProtocolUrlQueue(win));
    }
  }
}

/**
 * On Windows, the protocol URL is passed as a command-line argument.
 * Wait for the app to be ready, then forward it to the renderer.
 */
export function handleProtocolUrlFromArgs(getMainWindow: WindowGetter): void {
  if (process.platform !== 'win32') {
    return;
  }

  const protocolUrl = process.argv.find((arg) => arg.startsWith('accomplish://'));
  if (!protocolUrl) {
    return;
  }

  app.whenReady().then(() => {
    enqueueProtocolUrl(protocolUrl, getMainWindow);
  });
}

/**
 * Register the `open-url` (macOS) and `second-instance` (Windows) event
 * handlers for protocol URL routing.
 */
export function registerProtocolEventHandlers(getMainWindow: WindowGetter): void {
  app.on('open-url', (event, url) => {
    event.preventDefault();
    enqueueProtocolUrl(url, getMainWindow);
  });
}

/**
 * Handle second-instance protocol URL on Windows. Called inside the
 * `second-instance` event handler in index.ts where mainWindow is in scope.
 */
export function handleSecondInstanceProtocolUrl(
  win: BrowserWindow,
  commandLine: string[],
  getMainWindow: WindowGetter,
): void {
  if (process.platform !== 'win32') {
    return;
  }

  const protocolUrl = commandLine.find((arg) => arg.startsWith('accomplish://'));
  if (protocolUrl) {
    enqueueProtocolUrl(protocolUrl, getMainWindow);
  }
}

/**
 * Register basic app-level IPC handlers that don't belong to any feature area.
 */
export function registerAppIpcHandlers(): void {
  ipcMain.handle('app:version', () => app.getVersion());
  ipcMain.handle('app:platform', () => process.platform);
  ipcMain.handle('app:is-e2e-mode', () => {
    return (
      (global as Record<string, unknown>).E2E_MOCK_TASK_EVENTS === true ||
      process.env.E2E_MOCK_TASK_EVENTS === '1'
    );
  });
}
