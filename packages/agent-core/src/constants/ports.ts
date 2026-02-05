/**
 * Port constants for internal services.
 *
 * These are main-process-only constants used for:
 * - HTTP servers for MCP tool communication
 * - Browser automation (CDP)
 *
 * IMPORTANT: These constants should NOT be exported via common.ts.
 * They are only needed by main process code that starts servers
 * or configures MCP tools with environment variables.
 */

/** HTTP port for the dev browser server */
export const DEV_BROWSER_PORT = 9224;

/** Chrome DevTools Protocol port for browser automation */
export const DEV_BROWSER_CDP_PORT = 9225;

/** HTTP port for thought stream API (receives thoughts from MCP tools) */
export const THOUGHT_STREAM_PORT = 9228;

/** HTTP port for permission request API (file permissions from MCP tools) */
export const PERMISSION_API_PORT = 9226;

/** HTTP port for question API (user questions from MCP tools) */
export const QUESTION_API_PORT = 9227;

/** Timeout for permission requests in milliseconds (5 minutes) */
export const PERMISSION_REQUEST_TIMEOUT_MS = 5 * 60 * 1000;
