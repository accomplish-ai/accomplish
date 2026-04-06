/**
 * Browser Preview Service — Embedded Live Browser View (ENG-695)
 *
 * Streams live CDP screencast frames from the dev-browser server to the Electron
 * renderer via IPC.  Uses per-task CDP sessions (Dev0907, PR #480) and
 * auto-reconnect via HTTP polling (dhruvawani17, PR #489).
 *
 * Architecture: dev-browser (CDP :9223) ── WebSocket ──► this service ── IPC ──► renderer
 */

import { CdpClient } from './cdp-client';
import {
  emitStatusUpdate,
  emitFrameCapture,
  emitNavigationEvent,
  resolveTargetId,
  resolveBrowserWsEndpoint,
  autoStartScreencast as autoStartScreencastUtil,
} from './browser-preview-utils';
import { getLogCollector } from '@main/logging';

const DEFAULT_PAGE_NAME = 'main';
const SCREENCAST_QUALITY = 50;
const SCREENCAST_EVERY_NTH_FRAME = 3;
const SCREENCAST_MAX_WIDTH = 960;
const SCREENCAST_MAX_HEIGHT = 640;

interface BrowserPreviewSession {
  pageName: string;
  cdp: CdpClient;
  cdpSessionId: string;
  unsubscribe: () => void;
}

/** Active preview sessions keyed by taskId */
const sessions = new Map<string, BrowserPreviewSession>();
/** Used by autoStartScreencast (PR #489 / dhruvawani17) to check liveness */
let anySessionActive = false;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Start a live browser preview stream for the given task / page.
 * Contributed by Dev0907 (PR #480) for ENG-695.
 */
export async function startBrowserPreviewStream(
  taskId: string,
  pageName = DEFAULT_PAGE_NAME,
): Promise<void> {
  const normalizedPageName =
    typeof pageName === 'string' && pageName.trim() ? pageName.trim() : DEFAULT_PAGE_NAME;

  await stopBrowserPreviewStream(taskId);
  emitStatusUpdate(taskId, normalizedPageName, 'starting');

  const cdp = new CdpClient();

  try {
    const [wsEndpoint, targetId] = await Promise.all([
      resolveBrowserWsEndpoint(),
      resolveTargetId(taskId, normalizedPageName),
    ]);

    await cdp.connect(wsEndpoint);

    const attachResult = (await cdp.sendCommand('Target.attachToTarget', {
      targetId,
      flatten: true,
    })) as { sessionId: string };

    const cdpSessionId = attachResult.sessionId;

    const unsubscribe = cdp.onEvent((event) => {
      if (event.sessionId !== cdpSessionId || !event.method) return;

      if (event.method === 'Page.screencastFrame') {
        const params = event.params as {
          data: string;
          sessionId: number;
          metadata?: { deviceWidth?: number; deviceHeight?: number };
        };
        emitFrameCapture(
          taskId,
          normalizedPageName,
          params.data,
          params.metadata?.deviceWidth,
          params.metadata?.deviceHeight,
        );
        // Acknowledge so CDP continues sending frames
        cdp
          .sendCommand('Page.screencastFrameAck', { sessionId: params.sessionId }, cdpSessionId)
          .catch(() => {});
      } else if (event.method === 'Page.frameNavigated') {
        const params = event.params as { frame?: { url?: string } };
        if (params.frame?.url) {
          emitNavigationEvent(taskId, normalizedPageName, params.frame.url);
        }
      } else if (event.method === 'Page.loadEventFired') {
        emitStatusUpdate(taskId, normalizedPageName, 'streaming');
      }
    });

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

    sessions.set(taskId, { pageName: normalizedPageName, cdp, cdpSessionId, unsubscribe });
    anySessionActive = true;
    emitStatusUpdate(taskId, normalizedPageName, 'streaming');
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
    emitStatusUpdate(taskId, normalizedPageName, 'error', msg);
    await cdp.disconnect().catch(() => {});
  }
}

/**
 * Stop the preview stream for a specific task.
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
    emitStatusUpdate(taskId, session.pageName, 'stopped');
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
 * Auto-start a preview when the dev-browser server is already running with an active session.
 * Called opportunistically from the task lifecycle.
 * Contributed by dhruvawani17 (PR #489) for ENG-695.
 */
export async function autoStartScreencast(taskId: string): Promise<void> {
  return autoStartScreencastUtil(taskId, startBrowserPreviewStream);
}
