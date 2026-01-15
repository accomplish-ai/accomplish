/**
 * Centralized Logging System
 *
 * Provides structured logging with support for:
 * - Multiple log levels (DEBUG, INFO, WARN, ERROR)
 * - Console and file output
 * - Structured context data
 * - Log rotation
 * - Module-scoped loggers
 *
 * @module main/utils/logger
 */

import { app } from 'electron';
import fs from 'fs';
import path from 'path';

/**
 * Log levels for filtering messages
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

/**
 * Log level names for output formatting
 */
const LOG_LEVEL_NAMES: Record<LogLevel, string> = {
  [LogLevel.DEBUG]: 'DEBUG',
  [LogLevel.INFO]: 'INFO',
  [LogLevel.WARN]: 'WARN',
  [LogLevel.ERROR]: 'ERROR',
};

/**
 * Configuration options for Logger
 */
export interface LoggerOptions {
  /** Minimum log level to output */
  level?: LogLevel;
  /** Enable file logging */
  fileLogging?: boolean;
  /** Maximum log file size in bytes (default: 10MB) */
  maxFileSize?: number;
  /** Number of backup files to keep (default: 5) */
  maxBackups?: number;
}

/**
 * Default logger configuration
 */
const DEFAULT_OPTIONS: Required<LoggerOptions> = {
  level: LogLevel.INFO,
  fileLogging: false,
  maxFileSize: 10 * 1024 * 1024, // 10MB
  maxBackups: 5,
};

/**
 * Safely stringify objects, handling circular references
 */
function safeStringify(obj: unknown, indent = 2): string {
  const seen = new WeakSet();
  return JSON.stringify(
    obj,
    (_key, value) => {
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) {
          return '[Circular]';
        }
        seen.add(value);
      }
      // Handle Error objects
      if (value instanceof Error) {
        return {
          name: value.name,
          message: value.message,
          stack: value.stack,
        };
      }
      return value;
    },
    indent
  );
}

/**
 * Format timestamp for log output
 */
function formatTimestamp(): string {
  const now = new Date();
  return now.toISOString();
}

/**
 * Logger class for structured logging
 */
export class Logger {
  private moduleName: string;
  private options: Required<LoggerOptions>;
  private logFilePath: string | null = null;
  private logsDir: string | null = null;

  constructor(moduleName: string, options: LoggerOptions = {}) {
    this.moduleName = moduleName;
    this.options = { ...DEFAULT_OPTIONS, ...options };

    if (this.options.fileLogging) {
      this.initFileLogging();
    }
  }

  /**
   * Initialize file logging
   */
  private initFileLogging(): void {
    try {
      this.logsDir = path.join(app.getPath('userData'), 'logs');
      if (!fs.existsSync(this.logsDir)) {
        fs.mkdirSync(this.logsDir, { recursive: true });
      }
      this.logFilePath = path.join(this.logsDir, 'app.log');
    } catch (error) {
      console.error('[Logger] Failed to initialize file logging:', error);
      this.options.fileLogging = false;
    }
  }

  /**
   * Get the module name
   */
  getModuleName(): string {
    return this.moduleName;
  }

  /**
   * Get current log level
   */
  getLevel(): LogLevel {
    return this.options.level;
  }

  /**
   * Set log level at runtime
   */
  setLevel(level: LogLevel): void {
    this.options.level = level;
  }

  /**
   * Check if file logging is enabled
   */
  isFileLoggingEnabled(): boolean {
    return this.options.fileLogging;
  }

  /**
   * Log a debug message
   */
  debug(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.DEBUG, message, context);
  }

  /**
   * Log an info message
   */
  info(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.INFO, message, context);
  }

  /**
   * Log a warning message
   */
  warn(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.WARN, message, context);
  }

  /**
   * Log an error message
   */
  error(message: string, error?: Error | Record<string, unknown>): void {
    const context = error instanceof Error
      ? { error: { name: error.name, message: error.message, stack: error.stack } }
      : error;
    this.log(LogLevel.ERROR, message, context);
  }

  /**
   * Core logging method
   */
  private log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    if (level < this.options.level) {
      return;
    }

    const timestamp = formatTimestamp();
    const levelName = LOG_LEVEL_NAMES[level];
    const prefix = `[${timestamp}] [${levelName}] [${this.moduleName}]`;

    // Console output
    this.consoleLog(level, prefix, message, context);

    // File output
    if (this.options.fileLogging && this.logFilePath) {
      this.fileLog(prefix, message, context);
    }
  }

  /**
   * Output to console with appropriate method
   */
  private consoleLog(
    level: LogLevel,
    prefix: string,
    message: string,
    context?: Record<string, unknown>
  ): void {
    const args: unknown[] = [`${prefix} ${message}`];
    if (context) {
      args.push(context);
    }

    switch (level) {
      case LogLevel.DEBUG:
        console.debug(...args);
        break;
      case LogLevel.INFO:
        console.log(...args);
        break;
      case LogLevel.WARN:
        console.warn(...args);
        break;
      case LogLevel.ERROR:
        console.error(...args);
        break;
    }
  }

  /**
   * Output to log file
   */
  private fileLog(prefix: string, message: string, context?: Record<string, unknown>): void {
    if (!this.logFilePath || !this.logsDir) return;

    try {
      // Check for log rotation
      this.rotateIfNeeded();

      // Format log entry
      const contextStr = context ? ` ${safeStringify(context)}` : '';
      const logEntry = `${prefix} ${message}${contextStr}\n`;

      // Append to log file
      fs.appendFileSync(this.logFilePath, logEntry, 'utf8');
    } catch (error) {
      // Fallback to console only
      console.error('[Logger] Failed to write to log file:', error);
    }
  }

  /**
   * Rotate log file if it exceeds max size
   */
  private rotateIfNeeded(): void {
    if (!this.logFilePath || !this.logsDir) return;

    try {
      if (!fs.existsSync(this.logFilePath)) return;

      const stats = fs.statSync(this.logFilePath);
      if (stats.size < this.options.maxFileSize) return;

      // Rotate existing backups
      for (let i = this.options.maxBackups - 1; i >= 1; i--) {
        const oldPath = path.join(this.logsDir, `app.log.${i}`);
        const newPath = path.join(this.logsDir, `app.log.${i + 1}`);
        if (fs.existsSync(oldPath)) {
          if (i === this.options.maxBackups - 1) {
            fs.unlinkSync(oldPath);
          } else {
            fs.renameSync(oldPath, newPath);
          }
        }
      }

      // Move current log to backup
      fs.renameSync(this.logFilePath, path.join(this.logsDir, 'app.log.1'));
    } catch (error) {
      console.error('[Logger] Log rotation failed:', error);
    }
  }
}

/**
 * Factory function to create a logger for a module
 */
export function createLogger(moduleName: string, options?: LoggerOptions): Logger {
  return new Logger(moduleName, options);
}

/**
 * Default application logger
 */
let defaultLogger: Logger | null = null;

/**
 * Get or create the default application logger
 */
export function getDefaultLogger(): Logger {
  if (!defaultLogger) {
    defaultLogger = new Logger('app', {
      level: app.isPackaged ? LogLevel.INFO : LogLevel.DEBUG,
      fileLogging: app.isPackaged,
    });
  }
  return defaultLogger;
}

/**
 * Log entry type for IPC event logging
 */
export interface LogEntry {
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  context?: Record<string, unknown>;
  timestamp?: string;
  module?: string;
}

/**
 * Cache of loggers by module name for performance
 * Avoids creating new Logger instances on every logEvent call
 */
const moduleLoggerCache: Map<string, Logger> = new Map();

/**
 * Get or create a cached logger for a module
 */
function getCachedLogger(moduleName: string): Logger {
  let logger = moduleLoggerCache.get(moduleName);
  if (!logger) {
    logger = new Logger(moduleName, { fileLogging: true });
    moduleLoggerCache.set(moduleName, logger);
  }
  return logger;
}

/**
 * Log an entry from IPC (used by handlers.ts)
 * Uses cached loggers per module for better performance
 */
export function logEvent(entry: LogEntry): void {
  const logger = getCachedLogger(entry.module || 'renderer');

  switch (entry.level) {
    case 'debug':
      logger.debug(entry.message, entry.context);
      break;
    case 'info':
      logger.info(entry.message, entry.context);
      break;
    case 'warn':
      logger.warn(entry.message, entry.context);
      break;
    case 'error':
      logger.error(entry.message, entry.context);
      break;
    default:
      logger.info(entry.message, entry.context);
  }
}
