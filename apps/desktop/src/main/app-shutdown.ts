/**
 * app-shutdown.ts — graceful async teardown for `before-quit`.
 * Extracted from main/index.ts for ENG-695 file-split refactor.
 */

import { app } from 'electron';
import { cleanupVertexServiceAccountKey } from './opencode';
import { stopAllBrowserPreviewStreams } from './services/browserPreview';
import { oauthBrowserFlow } from './opencode/auth-browser';
import { slackMcpOAuthFlow } from './opencode/slack-auth';
import { closeStorage } from './store/storage';
import * as workspaceManager from './store/workspaceManager';
import { getLogCollector, shutdownLogCollector } from './logging';
import { stopHuggingFaceServer } from './providers/huggingface-local';
import { destroyTray } from './tray';
import { shutdownDaemon } from './daemon-bootstrap';

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
  shutdownDaemon();

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

  try {
    oauthBrowserFlow.dispose();
  } catch (error: unknown) {
    logger?.logEnv('ERROR', `[Main] Error during oauthBrowserFlow.dispose: ${String(error)}`);
  }

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
