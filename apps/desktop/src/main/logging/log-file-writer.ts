/**
 * Electron-specific LogFileWriter wrapper.
 *
 * This thin wrapper injects the Electron app's userData path into the
 * platform-agnostic LogFileWriter from @accomplish/core.
 */

import path from 'path';
import { app } from 'electron';
import { createLogWriter, type LogWriterAPI } from '@accomplish_ai/agent-core';

// Re-export types from shared package for backward compatibility
export type { LogLevel, LogSource, LogEntry } from '@accomplish_ai/agent-core';

let instance: LogWriterAPI | null = null;

export function getLogFileWriter(): LogWriterAPI {
  if (!instance) {
    const userDataPath = app.getPath('userData');
    const logDir = path.join(userDataPath, 'logs');
    instance = createLogWriter({ logDir });
  }
  return instance;
}

export function initializeLogFileWriter(): void {
  getLogFileWriter().initialize();
}

export function shutdownLogFileWriter(): void {
  if (instance) {
    instance.shutdown();
    instance = null;
  }
}
