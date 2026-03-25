/**
 * Thin structured logger for the web renderer.
 *
 * Wraps console methods with a consistent prefix so log output
 * is uniform and easy to grep. Swap implementation here if a
 * remote/structured sink is added later.
 */

function createLogger(prefix: string) {
  const fmt = (msg: string) => `[${prefix}] ${msg}`;
  return {
    debug: (msg: string, ...args: unknown[]) => console.debug(fmt(msg), ...args),
    info: (msg: string, ...args: unknown[]) => console.info(fmt(msg), ...args),
    warn: (msg: string, ...args: unknown[]) => console.warn(fmt(msg), ...args),
    error: (msg: string, ...args: unknown[]) => console.error(fmt(msg), ...args),
  };
}

/** Default app-level logger. Import and use directly, or call createLogger() for a scoped one. */
export const logger = createLogger('App');
export { createLogger };
