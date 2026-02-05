import { type LogWriterAPI } from '@accomplish/agent-core';
import { getLogFileWriter, shutdownLogFileWriter } from './log-file-writer';

export type { LogLevel, LogSource } from '@accomplish/agent-core';

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
  shutdownLogFileWriter();
}
