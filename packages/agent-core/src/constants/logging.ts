/**
 * Logging configuration constants.
 *
 * These are main-process-only constants used by LogFileWriter
 * for file-based logging with rotation and cleanup.
 *
 * IMPORTANT: These constants should NOT be exported via common.ts.
 * They are only needed by main process code that writes log files.
 */

/** Maximum size of a single log file before rotation stops (50MB) */
export const LOG_MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;

/** Number of days to retain old log files */
export const LOG_RETENTION_DAYS = 7;

/** Interval between automatic buffer flushes to disk (5 seconds) */
export const LOG_BUFFER_FLUSH_INTERVAL_MS = 5000;

/** Maximum entries in buffer before forced flush */
export const LOG_BUFFER_MAX_ENTRIES = 100;
