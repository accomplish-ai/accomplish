import type { LogSource } from '../types/logging.js';

/** Patterns used to detect log source from message prefixes */
export const LOG_SOURCE_PATTERNS: Record<LogSource, RegExp[]> = {
  opencode: [/^\[TaskManager\]/, /^\[OpenCode/],
  browser: [/^\[DevBrowser/, /^\[Playwright/],
  mcp: [/^\[MCP\]/, /MCP server/],
  ipc: [/^\[IPC\]/],
  main: [],
  env: [],
};

/**
 * Detects the log source from a message based on common prefixes.
 * Falls back to 'main' if no pattern matches.
 */
export function detectLogSource(message: string): LogSource {
  for (const [source, patterns] of Object.entries(LOG_SOURCE_PATTERNS)) {
    if (patterns.some((p) => p.test(message))) {
      return source as LogSource;
    }
  }
  return 'main';
}
