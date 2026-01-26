/**
 * LogCollector - Central logging service that captures all application logs
 *
 * Intercepts console.log/warn/error and provides methods for components
 * to log structured events.
 */

import { getLogFileWriter, initializeLogFileWriter, shutdownLogFileWriter, type LogLevel, type LogSource } from './log-file-writer';

// Store original console methods
const originalConsole = {
  log: console.log.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
  debug: console.debug.bind(console),
};

class LogCollector {
  private initialized = false;

  /**
   * Initialize the log collector - must be called early in app startup
   */
  initialize(): void {
    if (this.initialized) return;

    // Initialize the file writer first
    initializeLogFileWriter();

    // Override console methods to capture all logs
    console.log = (...args: unknown[]) => {
      originalConsole.log(...args);
      this.captureConsole('INFO', args);
    };

    console.warn = (...args: unknown[]) => {
      originalConsole.warn(...args);
      this.captureConsole('WARN', args);
    };

    console.error = (...args: unknown[]) => {
      originalConsole.error(...args);
      this.captureConsole('ERROR', args);
    };

    console.debug = (...args: unknown[]) => {
      originalConsole.debug(...args);
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
    const writer = getLogFileWriter();

    let fullMessage = message;
    if (data !== undefined) {
      try {
        fullMessage += ' ' + JSON.stringify(data);
      } catch {
        fullMessage += ' [unserializable data]';
      }
    }

    writer.write(level, source, fullMessage);
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
    return getLogFileWriter().getCurrentLogPath();
  }

  /**
   * Get the log directory
   */
  getLogDir(): string {
    return getLogFileWriter().getLogDir();
  }

  /**
   * Flush all pending logs to disk
   */
  flush(): void {
    getLogFileWriter().flush();
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

    shutdownLogFileWriter();
    this.initialized = false;
  }

  /**
   * Capture console output and route to file writer
   */
  private captureConsole(level: LogLevel, args: unknown[]): void {
    // Detect source from message prefix like [Main], [TaskManager], etc.
    const message = args.map(arg => {
      if (typeof arg === 'string') return arg;
      try {
        return JSON.stringify(arg);
      } catch {
        return String(arg);
      }
    }).join(' ');

    // Detect source from common prefixes
    let source: LogSource = 'main';
    if (message.startsWith('[TaskManager]') || message.startsWith('[OpenCode')) {
      source = 'opencode';
    } else if (message.startsWith('[DevBrowser') || message.startsWith('[Playwright')) {
      source = 'browser';
    } else if (message.startsWith('[MCP]') || message.includes('MCP server')) {
      source = 'mcp';
    } else if (message.startsWith('[IPC]')) {
      source = 'ipc';
    }

    getLogFileWriter().write(level, source, message);
  }
}

// Singleton instance
let instance: LogCollector | null = null;

export function getLogCollector(): LogCollector {
  if (!instance) {
    instance = new LogCollector();
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
}
