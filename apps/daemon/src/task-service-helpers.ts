/**
 * TaskService helpers for browser-server management and summary generation.
 * Extracted from task-config-builder.ts to maintain 200 line limit.
 */
import {
  ensureDevBrowserServer,
  generateTaskSummary,
  DEV_BROWSER_PORT,
  logger,
  type BrowserServerConfig,
  type TaskCallbacks,
  type StorageAPI,
} from '@accomplish_ai/agent-core';
import { type TaskConfigBuilderOptions, getBundledNodeBinPath } from './task-config-builder.js';

export function getBrowserServerConfig(opts: TaskConfigBuilderOptions): BrowserServerConfig {
  return {
    mcpToolsPath: opts.mcpToolsPath,
    bundledNodeBinPath: getBundledNodeBinPath(opts),
    devBrowserPort: DEV_BROWSER_PORT,
  };
}

export function createOnBeforeTaskStart(
  opts: TaskConfigBuilderOptions,
): (callbacks: TaskCallbacks, isFirst: boolean) => Promise<void> {
  return async (callbacks, isFirst) => {
    const browserConfig = getBrowserServerConfig(opts);
    if (!browserConfig.mcpToolsPath) {
      return;
    }
    if (isFirst) {
      callbacks.onProgress({
        stage: 'browser',
        message: 'Preparing browser...',
        isFirstTask: isFirst,
      });
    }
    await ensureDevBrowserServer(browserConfig, callbacks.onProgress);
  };
}

export function runTaskSummaryGeneration(
  taskId: string,
  prompt: string,
  storage: StorageAPI,
  emitSummary: (summary: string) => void,
): void {
  generateTaskSummary(prompt, (provider: string) => storage.getApiKey(provider))
    .then((summary: string) => {
      storage.updateTaskSummary(taskId, summary);
      emitSummary(summary);
    })
    .catch((err: unknown) => {
      logger.warn('[TaskService] Failed to generate task summary', { err, taskId });
    });
}
