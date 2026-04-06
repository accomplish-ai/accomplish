/**
 * Daemon logger — adds ISO timestamps to all log messages.
 *
 * Replaces bare console.log/warn/error in daemon code to ensure
 * consistent, timestamped output in both the log file and Electron console.
 */

function timestamp(): string {
  return new Date().toISOString();
}

export const log = {
  info(message: string, ...args: unknown[]): void {
    console.log(`${timestamp()} [INFO] ${message}`, ...args);
  },
  warn(message: string, ...args: unknown[]): void {
    console.warn(`${timestamp()} [WARN] ${message}`, ...args);
  },
  error(message: string, ...args: unknown[]): void {
    console.error(`${timestamp()} [ERROR] ${message}`, ...args);
  },
};
