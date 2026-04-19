/**
 * Shared logger helper for the updater modules. Matches the pattern used by
 * index.ts at the app-lifecycle level — best-effort, `'main'` source, never
 * throws. Extracted here so each updater submodule doesn't carry its own copy.
 */

import { getLogCollector } from '../logging';

type LogLevel = 'INFO' | 'WARN' | 'ERROR';

export function log(level: LogLevel, msg: string, data?: Record<string, unknown>): void {
  try {
    getLogCollector()?.log?.(level, 'main', msg, data);
  } catch {
    /* best-effort logging */
  }
}
