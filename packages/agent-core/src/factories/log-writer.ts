/**
 * Factory function for creating LogWriter instances
 *
 * The LogWriter combines both file writing (LogFileWriter) and log collection
 * (LogCollector) functionality into a single unified API. This ensures that
 * LogCollector remains internal and is not exposed as a separate factory.
 */

import { LogFileWriter } from '../internal/classes/LogFileWriter.js';
import { LogCollector } from '../internal/classes/LogCollector.js';
import type { LogWriterAPI, LogWriterOptions, LogLevel, LogSource } from '../types/log-writer.js';

/**
 * Create a new log writer instance
 *
 * Returns a unified API that provides both low-level write operations
 * and higher-level log collection methods (log, logMcp, logBrowser, etc.)
 *
 * @param options - Configuration for the log writer
 * @returns LogWriterAPI instance with full logging capabilities
 */
export function createLogWriter(options: LogWriterOptions): LogWriterAPI {
  const fileWriter = new LogFileWriter(options.logDir);
  const collector = new LogCollector(fileWriter);

  // Return a unified API that combines both file writer and collector functionality
  return {
    // Initialize both the file writer and collector
    initialize(): void {
      collector.initialize();
    },

    // Low-level write (delegates to file writer)
    write(level: LogLevel, source: LogSource, message: string): void {
      fileWriter.write(level, source, message);
    },

    // Higher-level log methods from collector
    log(level: LogLevel, source: LogSource, message: string, data?: unknown): void {
      collector.log(level, source, message, data);
    },

    logMcp(level: LogLevel, message: string, data?: unknown): void {
      collector.logMcp(level, message, data);
    },

    logBrowser(level: LogLevel, message: string, data?: unknown): void {
      collector.logBrowser(level, message, data);
    },

    logOpenCode(level: LogLevel, message: string, data?: unknown): void {
      collector.logOpenCode(level, message, data);
    },

    logEnv(level: LogLevel, message: string, data?: unknown): void {
      collector.logEnv(level, message, data);
    },

    logIpc(level: LogLevel, message: string, data?: unknown): void {
      collector.logIpc(level, message, data);
    },

    flush(): void {
      collector.flush();
    },

    getCurrentLogPath(): string {
      return collector.getCurrentLogPath();
    },

    getLogDir(): string {
      return collector.getLogDir();
    },

    shutdown(): void {
      collector.shutdown();
    },
  };
}
