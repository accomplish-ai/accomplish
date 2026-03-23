/**
 * Browser Preview Service — Embedded Live Browser View (ENG-695)
 *
 * Streams live CDP screencast frames from the dev-browser server to the Electron
 * renderer via IPC, enabling an embedded browser view inside the chat UI.
 *
 * Architecture:
 *   dev-browser (CDP :9223) ─── WebSocket ──► this service ─── IPC ──► renderer
 *
 * Two complementary approaches are combined here:
 *
 *   • Per-task CDP sessions (Dev0907, PR #480):
 *     Connects directly to the browser CDP endpoint, attaches to the page
 *     target matching `${taskId}-${pageName}`, starts `Page.startScreencast`,
 *     and forwards base64 JPEG frames over IPC. Full per-task lifecycle:
 *     auto-stop on task complete / cancel / error / delete.
 *
 *   • Auto-reconnect & status checking (dhruvawani17, PR #489):
 *     `autoStartScreencast` polls the dev-browser server HTTP endpoint to find
 *     an active session and hooks it up automatically when the server is ready.
 *     Also provides `isScreencastActive` for simple liveness checks.
 */

import { BrowserWindow } from 'electron';
import { DEV_BROWSER_CDP_PORT, DEV_BROWSER_PORT } from '@accomplish_ai/agent-core';
import { getLogCollector } from '@main/logging';

const DEFAULT_PAGE_NAME = 'main';
const DEV_BROWSER_HOST = '127.0.0.1';
const DEFAULT_VIEWPORT = { width: 1280, height: 720 };
const SCREENCAST_QUALITY = 50;
const SCREENCAST_EVERY_NTH_FRAME = 3;
const SCREENCAST_MAX_WIDTH = 960;
const SCREENCAST_MAX_HEIGHT = 640;
const COMMAND_TIMEOUT_MS = 10_000;

type PreviewStatus = 'starting' | 'streaming' | 'loading' | 'ready' | 'stopped' | 'error';

interface CdpCommandResponse {
  id: number;
  result?: unknown;
  error?: { message?: string };
}

interface CdpEvent {
  method?: string;
  params?: Record<string, unknown>;
  sessionId?: string;
}

interface PendingCommand {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

interface BrowserPreviewSession {
  pageName: string;
  cdp: CdpClient;
  cdpSessionId: string;
  unsubscribe: () => void;
}

// ---------------------------------------------------------------------------
// CdpClient — lightweight WebSocket-based CDP client
// Contributed by Dev0907 (PR #480) for ENG-695.
// ---------------------------------------------------------------------------

class CdpClient {
  private ws: WebSocket | null = null;
  private nextId = 1;
  private pending = new Map<number, PendingCommand>();
  private listeners = new Set<(event: CdpEvent) => void>();

  async connect(endpoint: string): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return;
    }

    const ws = new WebSocket(endpoint);

    await new Promise<void>((resolve, reject) => {
      const handleOpen = () => {
        cleanup();
        resolve();
      };
      const handleError = () => {
        cleanup();
        reject(new Error(`Failed to connect to CDP endpoint: ${endpoint}`));
      };
      const cleanup = () => {
        ws.removeEventListener('open', handleOpen);
        ws.removeEventListener('error', handleError);
      };

      ws.addEventListener('open', handleOpen);
      ws.addEventListener('error', handleError);
    });

    ws.addEventListener('message', (event) => {
      void this.handleMessage(event.data);
    });
    ws.addEventListener('close', () => {
      this.rejectAllPending(new Error('CDP websocket closed'));
    });
    ws.addEventListener('error', () => {
      this.rejectAllPending(new Error('CDP websocket error'));
    });

    this.ws = ws;
  }

  onEvent(listener: (event: CdpEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async sendCommand(
    method: string,
    params?: Record<string, unknown>,
    sessionId?: string,
  ): Promise<unknown> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('CDP websocket is not connected');
    }

    const id = this.nextId++;
    const payload: Record<string, unknown> = { id, method };
    if (params) payload.params = params;
    if (sessionId) payload.sessionId = sessionId;

    return new Promise<unknown>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP command timed out: ${method}`));
      }, COMMAND_TIMEOUT_MS);

      this.pending.set(id, { resolve, reject, timeout });
      this.ws?.send(JSON.stringify(payload));
    });
  }

  async disconnect(): Promise<void> {
    this.rejectAllPending(new Error('CDP disconnected'));
    if (this.ws && this.ws.readyState < WebSocket.CLOSING) {
      this.ws.close();
    }
    this.ws = null;
  }

  private async handleMessage(rawData: unknown): Promise<void> {
    const raw = await this.toText(rawData);
    if (!raw) return;

    let message: CdpCommandResponse & CdpEvent;
    try {
      message = JSON.parse(raw) as CdpCommandResponse & CdpEvent;
    } catch {
      return;
    }

    if (typeof message.id === 'number') {
      const pending = this.pending.get(message.id);
      if (!pending) return;

      clearTimeout(pending.timeout);
      this.pending.delete(message.id);

      if (message.error?.message) {
        pending.reject(new Error(message.error.message));
      } else {
        pending.resolve(message.result ?? {});
      }
      return;
    }

    for (const listener of this.listeners) {
      listener(message);
    }
  }

  private rejectAllPending(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pending.clear();
  }

  private async toText(rawData: unknown): Promise<string | null> {
    if (typeof rawData === 'string') return rawData;
    if (rawData instanceof ArrayBuffer) return Buffer.from(rawData).toString('utf8');
    if (ArrayBuffer.isView(rawData)) {
      return Buffer.from(rawData.buffer, rawData.byteOffset, rawData.byteLength).toString('utf8');
    }
    if (typeof Blob !== 'undefined' && rawData instanceof Blob) return rawData.text();
    return null;
  }
}

// ---------------------------------------------------------------------------
// Session management
// ---------------------------------------------------------------------------

/** Active preview sessions keyed by taskId */
const sessions = new Map<string, BrowserPreviewSession>();

/** Used by autoStartScreencast (PR #489 / dhruvawani17) to check liveness */
let anySessionActive = false;

function sendToRenderer(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, payload);
    }
  }
}

function emitStatus(
  taskId: string,
  pageName: string,
  status: PreviewStatus,
  message?: string,
): void {
  sendToRenderer('browser:status', { taskId, pageName, status, message, timestamp: Date.now() });
}

function emitFrame(
  taskId: string,
  pageName: string,
  data: string,
  width?: number,
  height?: number,
): void {
  sendToRenderer('browser:frame', { taskId, pageName, data, width, height, timestamp: Date.now() });
}

function emitNavigate(taskId: string, pageName: string, url: string): void {
  sendToRenderer('browser:navigate', { taskId, pageName, url, timestamp: Date.now() });
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), COMMAND_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

async function resolveTargetId(taskId: string, pageName: string): Promise<string> {
  const fullPageName = `${taskId}-${pageName}`;
  const result = await fetchJson<{ targetId: string }>(
    `http://${DEV_BROWSER_HOST}:${DEV_BROWSER_PORT}/pages`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: fullPageName, viewport: DEFAULT_VIEWPORT }),
    },
  );
  if (!result.targetId) {
    throw new Error(`No targetId for page ${fullPageName}`);
  }
  return result.targetId;
}

async function resolveBrowserWsEndpoint(): Promise<string> {
  const info = await fetchJson<{ webSocketDebuggerUrl: string }>(
    `http://${DEV_BROWSER_HOST}:${DEV_BROWSER_CDP_PORT}/json/version`,
  );
  if (!info.webSocketDebuggerUrl) {
    throw new Error('CDP endpoint missing webSocketDebuggerUrl');
  }
  return info.webSocketDebuggerUrl;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Start a live browser preview stream for the given task / page.
 *
 * Connects to the dev-browser CDP endpoint, attaches to the correct page target,
 * starts `Page.startScreencast`, and pipes base64 JPEG frames to all renderer
 * windows via IPC (`browser:frame`, `browser:navigate`, `browser:status`).
 *
 * Contributed by Dev0907 (PR #480) for ENG-695.
 */
export async function startBrowserPreviewStream(
  taskId: string,
  pageName = DEFAULT_PAGE_NAME,
): Promise<void> {
  const normalizedPageName =
    typeof pageName === 'string' && pageName.trim() ? pageName.trim() : DEFAULT_PAGE_NAME;

  // Stop any existing session for this task first
  await stopBrowserPreviewStream(taskId);

  emitStatus(taskId, normalizedPageName, 'starting');

  const cdp = new CdpClient();

  try {
    const [wsEndpoint, targetId] = await Promise.all([
      resolveBrowserWsEndpoint(),
      resolveTargetId(taskId, normalizedPageName),
    ]);

    await cdp.connect(wsEndpoint);

    // Attach to the specific target
    const attachResult = (await cdp.sendCommand('Target.attachToTarget', {
      targetId,
      flatten: true,
    })) as { sessionId: string };

    const cdpSessionId = attachResult.sessionId;

    // Listen for CDP events from this session
    const unsubscribe = cdp.onEvent((event) => {
      if (event.sessionId !== cdpSessionId || !event.method) return;

      if (event.method === 'Page.screencastFrame') {
        const params = event.params as {
          data: string;
          sessionId: number;
          metadata?: { deviceWidth?: number; deviceHeight?: number };
        };

        const width = params.metadata?.deviceWidth;
        const height = params.metadata?.deviceHeight;

        emitFrame(taskId, normalizedPageName, params.data, width, height);

        // Acknowledge so CDP continues sending frames
        cdp
          .sendCommand('Page.screencastFrameAck', { sessionId: params.sessionId }, cdpSessionId)
          .catch(() => {});
      } else if (event.method === 'Page.frameNavigated') {
        const params = event.params as { frame?: { url?: string } };
        if (params.frame?.url) {
          emitNavigate(taskId, normalizedPageName, params.frame.url);
        }
      } else if (event.method === 'Page.loadEventFired') {
        emitStatus(taskId, normalizedPageName, 'streaming');
      }
    });

    // Start the screencast
    await cdp.sendCommand(
      'Page.startScreencast',
      {
        format: 'jpeg',
        quality: SCREENCAST_QUALITY,
        everyNthFrame: SCREENCAST_EVERY_NTH_FRAME,
        maxWidth: SCREENCAST_MAX_WIDTH,
        maxHeight: SCREENCAST_MAX_HEIGHT,
      },
      cdpSessionId,
    );

    const session: BrowserPreviewSession = {
      pageName: normalizedPageName,
      cdp,
      cdpSessionId,
      unsubscribe,
    };

    sessions.set(taskId, session);
    anySessionActive = true;
    emitStatus(taskId, normalizedPageName, 'streaming');

    getLogCollector().logBrowser(
      'INFO',
      `[BrowserPreview] Stream started for task ${taskId}, page ${normalizedPageName}`,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    getLogCollector().logBrowser(
      'ERROR',
      `[BrowserPreview] Failed to start stream for task ${taskId}: ${msg}`,
    );
    emitStatus(taskId, normalizedPageName, 'error', msg);
    await cdp.disconnect().catch(() => {});
  }
}

/**
 * Stop the preview stream for a specific task.
 *
 * Safe to call even if no stream is active for this task.
 * Contributed by Dev0907 (PR #480) for ENG-695.
 */
export async function stopBrowserPreviewStream(taskId: string): Promise<void> {
  const session = sessions.get(taskId);
  if (!session) return;

  sessions.delete(taskId);
  anySessionActive = sessions.size > 0;

  try {
    session.unsubscribe();
    await session.cdp.sendCommand('Page.stopScreencast', {}, session.cdpSessionId).catch(() => {});
    await session.cdp.disconnect();
    emitStatus(taskId, session.pageName, 'stopped');
    getLogCollector().logBrowser('INFO', `[BrowserPreview] Stream stopped for task ${taskId}`);
  } catch (err) {
    getLogCollector().logBrowser(
      'WARN',
      `[BrowserPreview] Error stopping stream for task ${taskId}: ${String(err)}`,
    );
  }
}

/**
 * Stop all active preview streams (e.g. on app shutdown or clear history).
 * Contributed by Dev0907 (PR #480) for ENG-695.
 */
export async function stopAllBrowserPreviewStreams(): Promise<void> {
  const taskIds = Array.from(sessions.keys());
  await Promise.all(taskIds.map((id) => stopBrowserPreviewStream(id)));
}

/**
 * Check whether any screencast relay is currently active.
 * Contributed by dhruvawani17 (PR #489) for ENG-695.
 */
export function isScreencastActive(): boolean {
  return anySessionActive;
}

/**
 * Auto-start a preview when the dev-browser server is already running with
 * an active session. Called opportunistically from the task lifecycle.
 *
 * Contributed by dhruvawani17 (PR #489) for ENG-695.
 */
export async function autoStartScreencast(taskId: string): Promise<void> {
  try {
    const res = await fetch(`http://${DEV_BROWSER_HOST}:${DEV_BROWSER_PORT}/pages`).catch(
      () => null,
    );
    if (!res || !res.ok) return;

    const data = (await res.json()) as { pages: string[] };
    const taskPrefix = `${taskId}-`;
    const taskPages = data.pages.filter((p: string) => p.startsWith(taskPrefix));

    if (taskPages.length > 0) {
      const pageName = taskPages[0].substring(taskPrefix.length);
      await startBrowserPreviewStream(taskId, pageName);
    }
  } catch {
    // Server not ready yet — will be triggered later via IPC
  }
}
