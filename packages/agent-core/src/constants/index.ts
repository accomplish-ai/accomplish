/**
 * System constants - main process only.
 *
 * This module exports configuration constants that are only needed
 * by the main process. They should NOT be re-exported from common.ts.
 *
 * For browser-safe constants (model display names, etc.),
 * see common/constants/ instead.
 */

// Port constants for internal services
export {
  DEV_BROWSER_PORT,
  DEV_BROWSER_CDP_PORT,
  THOUGHT_STREAM_PORT,
  PERMISSION_API_PORT,
  QUESTION_API_PORT,
  PERMISSION_REQUEST_TIMEOUT_MS,
} from './ports.js';

// Logging configuration
export {
  LOG_MAX_FILE_SIZE_BYTES,
  LOG_RETENTION_DAYS,
  LOG_BUFFER_FLUSH_INTERVAL_MS,
  LOG_BUFFER_MAX_ENTRIES,
} from './logging.js';
