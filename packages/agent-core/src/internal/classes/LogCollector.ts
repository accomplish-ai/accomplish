/**
 * LogCollector - Central logging service that captures all application logs.
 *
 * Intercepts console.log/warn/error and provides methods for components
 * to log structured events. This class is platform-agnostic and requires
 * a LogFileWriter instance to be injected.
 */

import { type LogLevel, type LogSource } from '../../common/types/logging.js';
import { detectLogSource } from '../../common/utils/log-source-detector.js';

/**
 * Internal interface for the basic file writer that LogCollector needs.
 * This is a subset of LogWriterAPI that only includes the low-level operations.
 */
interface InternalLogFileWriter {
  initialize(): void;
  write(level: LogLevel, source: LogSource, message: string): void;
  flush(): void;
  getCurrentLogPath(): string;
  getLogDir(): string;
  shutdown(): void;
}

// Store original console methods
const originalConsole = {
  log: console.log.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
  debug: console.debug.bind(console),
};

export class LogCollector {
  private initialized = false;

  constructor(private writer: InternalLogFileWriter) {}

  /**
   * Initialize the log collector - must be called early in app startup
   */
  initialize(): void {
    if (this.initialized) return;

    // Initialize the file writer first
    this.writer.initialize();

    // Override console methods to capture all logs
    // Wrap original console calls in try-catch to handle EIO errors when stdout is unavailable
    // (e.g., when terminal is closed or during app shutdown)
    console.log = (...args: unknown[]) => {
      try {
        originalConsole.log(...args);
      } catch {
        // Ignore EIO errors when stdout is unavailable
      }
      this.captureConsole('INFO', args);
    };

    console.warn = (...args: unknown[]) => {
      try {
        originalConsole.warn(...args);
      } catch {
        // Ignore EIO errors when stdout is unavailable
      }
      this.captureConsole('WARN', args);
    };

    console.error = (...args: unknown[]) => {
      try {
        originalConsole.error(...args);
      } catch {
        // Ignore EIO errors when stdout is unavailable
      }
      this.captureConsole('ERROR', args);
    };

    console.debug = (...args: unknown[]) => {
      try {
        originalConsole.debug(...args);
      } catch {
        // Ignore EIO errors when stdout is unavailable
      }
      this.captureConsole('DEBUG', args);
    };

    this.initialized = true;

    // Log startup
    this.log('INFO', 'main', 'LogCollector initialized');
  }

  /**
   * Log a message with structured metadata
   */
  log(level: LogLevel, source: LogSource, message: string, data?: unknown): void {
    let fullMessage = message;
    if (data !== undefined) {
      try {
        fullMessage += ' ' + JSON.stringify(data);
      } catch {
        fullMessage += ' [unserializable data]';
      }
    }

    this.writer.write(level, source, fullMessage);
  }

  /**
   * Log MCP server events
   */
  logMcp(level: LogLevel, message: string, data?: unknown): void {
    this.log(level, 'mcp', message, data);
  }

  /**
   * Log browser/Playwright events
   */
  logBrowser(level: LogLevel, message: string, data?: unknown): void {
    this.log(level, 'browser', message, data);
  }

  /**
   * Log OpenCode CLI events
   */
  logOpenCode(level: LogLevel, message: string, data?: unknown): void {
    this.log(level, 'opencode', message, data);
  }

  /**
   * Log environment/startup events
   */
  logEnv(level: LogLevel, message: string, data?: unknown): void {
    this.log(level, 'env', message, data);
  }

  /**
   * Log IPC events
   */
  logIpc(level: LogLevel, message: string, data?: unknown): void {
    this.log(level, 'ipc', message, data);
  }

  /**
   * Get the path to the current log file (for export)
   */
  getCurrentLogPath(): string {
    return this.writer.getCurrentLogPath();
  }

  /**
   * Get the log directory
   */
  getLogDir(): string {
    return this.writer.getLogDir();
  }

  /**
   * Flush all pending logs to disk
   */
  flush(): void {
    this.writer.flush();
  }

  /**
   * Shutdown the collector
   */
  shutdown(): void {
    if (!this.initialized) return;

    this.log('INFO', 'main', 'LogCollector shutting down');

    // Restore original console
    console.log = originalConsole.log;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;
    console.debug = originalConsole.debug;

    this.writer.shutdown();
    this.initialized = false;
  }

  /**
   * Capture console output and route to file writer
   */
  private captureConsole(level: LogLevel, args: unknown[]): void {
    const message = args
      .map((arg) => {
        if (typeof arg === 'string') return arg;
        try {
          return JSON.stringify(arg);
        } catch {
          return String(arg);
        }
      })
      .join(' ');

    const source = detectLogSource(message);
    this.writer.write(level, source, message);
  }
}
