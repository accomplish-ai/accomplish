/**
 * Electron-specific LogCollector wrapper.
 *
 * This thin wrapper provides access to the LogWriter which now includes
 * all LogCollector functionality internally.
 */

import { type LogWriterAPI } from '@accomplish_ai/agent-core';
import { getLogFileWriter, shutdownLogFileWriter } from './log-file-writer';

// Re-export types from shared package for backward compatibility
export type { LogLevel, LogSource } from '@accomplish_ai/agent-core';

// LogWriterAPI now includes all LogCollector methods (log, logMcp, logBrowser, etc.)
let instance: LogWriterAPI | null = null;

export function getLogCollector(): LogWriterAPI {
  if (!instance) {
    instance = getLogFileWriter();
  }
  return instance;
}

export function initializeLogCollector(): void {
  getLogCollector().initialize();
}

export function shutdownLogCollector(): void {
  if (instance) {
    instance.shutdown();
    instance = null;
  }
  // Also shutdown the file writer
  shutdownLogFileWriter();
}
