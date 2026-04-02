/**
 * Daemon Logger
 *
 * Structured JSON logger for daemon internals with child logger support
 * for per-task trace correlation.
 *
 * ESM module — use .js extensions on imports.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/** Structured context attached to every log line from a logger or child logger. */
export interface LogContext {
  taskId?: string;
  traceId?: string;
  [key: string]: unknown;
}

export interface DaemonLogger {
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
  debug(message: string, context?: LogContext): void;
  /** Create a child logger with pre-bound context (e.g., taskId). */
  child(boundContext: LogContext): DaemonLogger;
}

const minLevel: LogLevel = process.env.DEBUG ? 'debug' : 'info';

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[minLevel];
}

function emitLog(
  level: LogLevel,
  source: string,
  message: string,
  baseContext: LogContext,
  callContext?: LogContext,
): void {
  if (!shouldLog(level)) {
    return;
  }

  const entry: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    level: level.toUpperCase(),
    source,
    message,
  };

  // Merge base context (from child) and call-site context
  const merged = { ...baseContext, ...callContext };
  if (merged.taskId) {
    entry.taskId = merged.taskId;
  }
  if (merged.traceId) {
    entry.traceId = merged.traceId;
  }

  // Add remaining context fields
  for (const [key, value] of Object.entries(merged)) {
    if (key !== 'taskId' && key !== 'traceId' && value !== undefined) {
      if (!entry.context) {
        entry.context = {};
      }
      (entry.context as Record<string, unknown>)[key] = value;
    }
  }

  // Write structured JSON to stderr (parseable by log aggregators)
  const line = JSON.stringify(entry);
  if (level === 'error') {
    process.stderr.write(line + '\n');
  } else if (level === 'warn') {
    process.stderr.write(line + '\n');
  } else {
    process.stderr.write(line + '\n');
  }
}

function createLogger(namespace: string, baseContext: LogContext = {}): DaemonLogger {
  return {
    info: (message: string, context?: LogContext) =>
      emitLog('info', namespace, message, baseContext, context),
    warn: (message: string, context?: LogContext) =>
      emitLog('warn', namespace, message, baseContext, context),
    error: (message: string, context?: LogContext) =>
      emitLog('error', namespace, message, baseContext, context),
    debug: (message: string, context?: LogContext) =>
      emitLog('debug', namespace, message, baseContext, context),
    child: (childContext: LogContext) =>
      createLogger(namespace, { ...baseContext, ...childContext }),
  };
}

export { createLogger };

/** Shared daemon logger instance. */
export const logger = createLogger('daemon');
