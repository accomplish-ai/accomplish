/**
 * app-shutdown.ts — graceful async teardown for `before-quit`.
 * Extracted from main/index.ts for ENG-695 file-split refactor.
 */

import { app } from 'electron';
import { cleanupVertexServiceAccountKey, stopDevBrowserServer } from './opencode';
import { stopAllBrowserPreviewStreams } from './services/browserPreview';
// Phase 4a of the SDK cutover port deleted the desktop-side PTY OAuth flow —
// the OpenAI OAuth orchestration lives in the daemon now and its lifecycle is
// tied to the daemon process itself. Slack MCP OAuth remains desktop-side.
import { slackMcpOAuthFlow } from './opencode/slack-auth';
import { closeStorage } from './store/storage';
import * as workspaceManager from './store/workspaceManager';
import { getLogCollector, shutdownLogCollector } from './logging';
import { stopHuggingFaceServer } from './providers/huggingface-local';
import { destroyTray } from './tray';
import { shutdownDaemon } from './daemon-bootstrap';
import { flushAnalytics } from './analytics/analytics-service';
import { flushMixpanel } from './analytics/mixpanel-service';
import { trackAppClose } from './analytics/events';

type AppLogger = ReturnType<typeof getLogCollector> | null;

async function raceTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms),
    ),
  ]);
}

export async function shutdownApp(logger: AppLogger): Promise<void> {
  destroyTray();
  // NOTE: `shutdownDaemon()` moved below the analytics-flush block in
  // Milestone 3 sub-chunk 3a (daemon-only-SQLite migration). `trackAppClose`
  // enriches its payload with `getAllApiKeys()`, which post-M3 routes over
  // daemon RPC — closing the daemon client before that runs turns every
  // normal quit into an analytics-flush failure. The daemon process itself
  // is designed to outlive Electron, so closing the client socket later is
  // harmless; the daemon keeps handling scheduled tasks / background token
  // refresh regardless of when we disconnect.

  try {
    await raceTimeout(stopDevBrowserServer(), 5000, 'Dev-browser shutdown');
  } catch (error: unknown) {
    logger?.logEnv('ERROR', `[Main] Failed to stop dev-browser server: ${String(error)}`);
  }

  try {
    await raceTimeout(stopAllBrowserPreviewStreams(), 5000, 'Stopping browser preview streams');
  } catch (error: unknown) {
    logger?.logEnv('ERROR', `[Main] Failed to stop browser preview streams: ${String(error)}`);
  }

  try {
    await raceTimeout(stopHuggingFaceServer(), 5000, 'HuggingFace server stop');
  } catch (error: unknown) {
    logger?.logEnv('ERROR', `[Main] Failed to stop HuggingFace server: ${String(error)}`);
  }

  try {
    cleanupVertexServiceAccountKey();
  } catch (error: unknown) {
    logger?.logEnv('ERROR', `[Main] Error during cleanupVertexServiceAccountKey: ${String(error)}`);
  }

  // oauthBrowserFlow disposal removed in Phase 4a — daemon-side OAuth manager
  // tears itself down when the daemon stops.
  try {
    slackMcpOAuthFlow.dispose();
  } catch (error: unknown) {
    logger?.logEnv('ERROR', `[Main] Error during slackMcpOAuthFlow.dispose: ${String(error)}`);
  }

  try {
    workspaceManager.close();
  } catch (error: unknown) {
    logger?.logEnv('ERROR', `[Main] Error during workspaceManager.close: ${String(error)}`);
  }

  // Track app close + flush analytics before closing storage — best effort.
  // MUST run before `shutdownDaemon()` below: `trackAppClose` reads
  // `getAllApiKeys()` via daemon RPC to enrich the event payload, and
  // closing the client first would turn this into a throw on every quit.
  try {
    await trackAppClose();
    flushAnalytics();
    flushMixpanel();
  } catch (error: unknown) {
    logger?.logEnv('ERROR', `[Main] Error during analytics flush: ${String(error)}`);
  }

  // Close the daemon client socket. Safe to run after analytics (daemon
  // process itself survives Electron exit and keeps servicing scheduled
  // tasks + background token refresh). Moved here from the top of the
  // function as part of Milestone 3 sub-chunk 3a.
  shutdownDaemon();

  try {
    closeStorage();
  } catch (error: unknown) {
    logger?.logEnv('ERROR', `[Main] Error during closeStorage: ${String(error)}`);
  }

  try {
    shutdownLogCollector();
  } finally {
    app.quit();
  }
}
