export const DEV_BROWSER_PORT = 9224;

export const DEV_BROWSER_CDP_PORT = 9225;

export const THOUGHT_STREAM_PORT = 9228;

export const PERMISSION_API_PORT = 9226;

export const QUESTION_API_PORT = 9227;

export const PERMISSION_REQUEST_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

// Logging configuration constants
export const LOG_MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50MB
export const LOG_RETENTION_DAYS = 7;
export const LOG_BUFFER_FLUSH_INTERVAL_MS = 5000;
export const LOG_BUFFER_MAX_ENTRIES = 100;

export * from './constants/model-display.js';
