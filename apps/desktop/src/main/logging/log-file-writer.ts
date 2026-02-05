import path from 'path';
import { app } from 'electron';
import { createLogWriter, type LogWriterAPI } from '@accomplish/agent-core';

export type { LogLevel, LogSource, LogEntry } from '@accomplish/agent-core';

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
