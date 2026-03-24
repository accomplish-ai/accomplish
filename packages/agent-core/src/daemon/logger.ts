/**
 * Daemon Logger
 *
 * Lightweight structured logger for daemon internals.
 * Wraps console methods with a consistent prefix / level format.
 *
 * ESM module — use .js extensions on imports.
 */

export interface DaemonLogger {
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
  debug(message: string, ...args: unknown[]): void;
}

function createLogger(namespace: string): DaemonLogger {
  const prefix = `[${namespace}]`;
  return {
    info: (message: string, ...args: unknown[]) => console.log(prefix, message, ...args),
    warn: (message: string, ...args: unknown[]) => console.warn(prefix, message, ...args),
    error: (message: string, ...args: unknown[]) => console.error(prefix, message, ...args),
    debug: (message: string, ...args: unknown[]) => {
      if (process.env.DEBUG) {
        console.log(prefix, '[debug]', message, ...args);
      }
    },
  };
}

export { createLogger };

/** Shared daemon logger instance. */
export const logger = createLogger('Daemon');
