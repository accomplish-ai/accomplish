/**
 * Logging types shared across all packages
 */

/** Log severity levels */
export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

/** Log source categories for categorizing log entries by subsystem */
export type LogSource = 'main' | 'mcp' | 'browser' | 'opencode' | 'env' | 'ipc';

/** A single log entry with timestamp, severity, source, and message */
export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  source: LogSource;
  message: string;
}
