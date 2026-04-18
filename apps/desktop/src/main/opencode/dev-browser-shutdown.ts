import {
  shutdownDevBrowserServer,
  DEV_BROWSER_PORT,
  DEV_BROWSER_CDP_PORT,
} from '@accomplish_ai/agent-core/desktop-main';
import { getLogCollector } from '../logging';

function logOC(level: 'INFO' | 'WARN' | 'ERROR', msg: string, data?: Record<string, unknown>) {
  try {
    const l = getLogCollector();
    if (l?.log) {
      l.log(level, 'opencode', msg, data);
    }
  } catch (_e) {
    /* best-effort logging */
  }
}

/**
 * Sends a shutdown request to the local dev-browser MCP server.
 *
 * Phase 4b of the OpenCode SDK cutover port: extracted from the deleted
 * `electron-options.ts`. The dev-browser MCP server itself is now spawned
 * by the daemon when a task that uses it starts; this shutdown helper is
 * called from `app-shutdown.ts` so quitting the desktop also releases the
 * port the MCP server holds.
 */
export async function stopDevBrowserServer(): Promise<void> {
  logOC('INFO', '[Browser] Sending shutdown request to dev-browser server...');
  await shutdownDevBrowserServer({
    devBrowserPort: DEV_BROWSER_PORT,
    devBrowserCdpPort: DEV_BROWSER_CDP_PORT,
  });
}
