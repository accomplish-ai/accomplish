export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: Date;
  context?: Record<string, unknown>;
}

export interface Logger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
  child(childPrefix: string): Logger;
}

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export interface ConsoleLoggerOptions {
  prefix?: string;
  minLevel?: LogLevel;
  includeTimestamp?: boolean;
}

export function createConsoleLogger(options: ConsoleLoggerOptions = {}): Logger {
  const { prefix = '', minLevel = 'debug', includeTimestamp = true } = options;

  const formatMessage = (level: LogLevel, message: string): string => {
    const parts: string[] = [];

    if (includeTimestamp) {
      parts.push(new Date().toISOString());
    }

    parts.push(`[${level.toUpperCase()}]`);

    if (prefix) {
      parts.push(`[${prefix}]`);
    }

    parts.push(message);

    return parts.join(' ');
  };

  const shouldLog = (level: LogLevel): boolean => {
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[minLevel];
  };

  const log = (level: LogLevel, message: string, context?: Record<string, unknown>): void => {
    if (!shouldLog(level)) {
      return;
    }

    const formattedMessage = formatMessage(level, message);
    const consoleFn =
      level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;

    if (context && Object.keys(context).length > 0) {
      consoleFn(formattedMessage, context);
    } else {
      consoleFn(formattedMessage);
    }
  };

  return {
    debug: (message, context) => log('debug', message, context),
    info: (message, context) => log('info', message, context),
    warn: (message, context) => log('warn', message, context),
    error: (message, context) => log('error', message, context),
    child: (childPrefix) =>
      createConsoleLogger({
        ...options,
        prefix: prefix ? `${prefix}:${childPrefix}` : childPrefix,
      }),
  };
}

export function createNoOpLogger(): Logger {
  const noop = (): void => {};

  return {
    debug: noop,
    info: noop,
    warn: noop,
    error: noop,
    child: () => createNoOpLogger(),
  };
}

export function createBufferedLogger(
  options: ConsoleLoggerOptions = {},
): Logger & { getEntries(): LogEntry[]; clear(): void } {
  const { prefix = '', minLevel = 'debug' } = options;
  const entries: LogEntry[] = [];

  const shouldLog = (level: LogLevel): boolean => {
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[minLevel];
  };

  const log = (level: LogLevel, message: string, context?: Record<string, unknown>): void => {
    if (!shouldLog(level)) {
      return;
    }

    const fullMessage = prefix ? `[${prefix}] ${message}` : message;

    entries.push({
      level,
      message: fullMessage,
      timestamp: new Date(),
      context,
    });
  };

  return {
    debug: (message, context) => log('debug', message, context),
    info: (message, context) => log('info', message, context),
    warn: (message, context) => log('warn', message, context),
    error: (message, context) => log('error', message, context),
    child: (childPrefix) =>
      createBufferedLogger({
        ...options,
        prefix: prefix ? `${prefix}:${childPrefix}` : childPrefix,
      }),
    getEntries: () => [...entries],
    clear: () => {
      entries.length = 0;
    },
  };
}
