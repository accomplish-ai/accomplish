/**
 * Electron-specific LogFileWriter wrapper.
 *
 * This thin wrapper injects the Electron app's userData path into the
 * platform-agnostic LogFileWriter from @accomplish/core.
 */

import path from 'path';
import { app } from 'electron';
import { LogFileWriter } from '@accomplish/agent-core';

// Re-export types from shared package for backward compatibility
export type { LogLevel, LogSource, LogEntry } from '@accomplish/agent-core';

let instance: LogFileWriter | null = null;

export function getLogFileWriter(): LogFileWriter {
  if (!instance) {
    const userDataPath = app.getPath('userData');
    const logDir = path.join(userDataPath, 'logs');
    instance = new LogFileWriter(logDir);
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
