import { spawn, execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { isSystemChromeInstalled, isPlaywrightInstalled } from './detection.js';
import { createConsoleLogger } from '../utils/logging.js';
import {
  buildNodeEnvironment,
  getNodeExecutable,
  installPlaywrightChromium,
  isDevBrowserServerReady,
  waitForDevBrowserServer,
} from './server-utils.js';

export type { BrowserServerConfig } from './server-utils.js';
export {
  installPlaywrightChromium,
  isDevBrowserServerReady,
  waitForDevBrowserServer,
} from './server-utils.js';

import type { BrowserServerConfig } from './server-utils.js';

const log = createConsoleLogger({ prefix: 'Browser' });

export interface ServerStartResult {
  ready: boolean;
  pid?: number;
  logs: string[];
}

export async function startDevBrowserServer(
  config: BrowserServerConfig,
): Promise<ServerStartResult> {
  const serverScript = path.join(config.mcpToolsPath, 'dev-browser', 'server.mjs');
  const serverCwd = path.join(config.mcpToolsPath, 'dev-browser');
  if (!fs.existsSync(serverScript)) {
    throw new Error(
      `[Browser] Missing dev-browser launcher script: ${serverScript}. ` +
        'Run "pnpm -F @accomplish/desktop build:mcp-tools:dev" before starting the app.',
    );
  }
  const spawnEnv = buildNodeEnvironment(config.bundledNodeBinPath);
  const nodeExe = getNodeExecutable(config.bundledNodeBinPath);

  const serverLogs: string[] = [];

  log.info('[Browser] ========== DEV-BROWSER SERVER STARTUP ==========');
  log.info(`[Browser] Node executable: ${nodeExe}`);
  log.info(`[Browser] Server script: ${serverScript}`);
  log.info(`[Browser] Working directory: ${serverCwd}`);
  log.info(`[Browser] Script exists: ${fs.existsSync(serverScript)}`);
  log.info(`[Browser] CWD exists: ${fs.existsSync(serverCwd)}`);

  // detached + unref allows server to outlive parent process
  const child = spawn(nodeExe, [serverScript], {
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    cwd: serverCwd,
    env: spawnEnv,
    windowsHide: true,
  });

  child.stdout?.on('data', (data: Buffer) => {
    const lines = data
      .toString()
      .split('\n')
      .filter((l) => l.trim());
    for (const line of lines) {
      serverLogs.push(`[stdout] ${line}`);
      log.info(`[DevBrowser stdout] ${line}`);
    }
  });

  child.stderr?.on('data', (data: Buffer) => {
    const lines = data
      .toString()
      .split('\n')
      .filter((l) => l.trim());
    for (const line of lines) {
      serverLogs.push(`[stderr] ${line}`);
      log.info(`[DevBrowser stderr] ${line}`);
    }
  });

  child.on('error', (err) => {
    const errorMsg = `Spawn error: ${err.message} (code: ${(err as NodeJS.ErrnoException).code})`;
    serverLogs.push(`[error] ${errorMsg}`);
    log.error('[Browser] Dev-browser spawn error:', { error: String(err) });
  });

  child.on('exit', (code, signal) => {
    const exitMsg = `Process exited with code ${code}, signal ${signal}`;
    serverLogs.push(`[exit] ${exitMsg}`);
    log.info(`[Browser] Dev-browser ${exitMsg}`);
    if (code !== 0 && code !== null) {
      log.error('[Browser] Dev-browser server failed. Logs:', { logs: serverLogs.join('\n') });
    }
  });

  child.unref();

  log.info(`[Browser] Dev-browser server spawn initiated (PID: ${child.pid})`);

  // Windows needs longer timeout due to slower process startup
  const maxWaitMs = process.platform === 'win32' ? 30000 : 15000;
  log.info(`[Browser] Waiting for dev-browser server to be ready (max ${maxWaitMs}ms)...`);

  const serverReady = await waitForDevBrowserServer(config.devBrowserPort, maxWaitMs);

  log.info('[Browser] ========== END DEV-BROWSER SERVER STARTUP ==========');

  return { ready: serverReady, pid: child.pid, logs: serverLogs };
}

/**
 * Finds and terminates the process(es) listening on a TCP port.
 * Used as a fallback when the HTTP /shutdown endpoint is unavailable.
 */
function killProcessOnPort(port: number): void {
  try {
    if (process.platform === 'win32') {
      const out = execFileSync('netstat', ['-ano'], { encoding: 'utf8' });
      for (const line of out.split('\n')) {
        if (line.includes(`:${port} `) && line.includes('LISTENING')) {
          const pid = line.trim().split(/\s+/).pop();
          if (pid && /^\d+$/.test(pid)) {
            execFileSync('taskkill', ['/PID', pid, '/F'], { stdio: 'ignore' });
          }
        }
      }
    } else {
      const pids = execFileSync('lsof', ['-t', '-i', `tcp:${port}`, '-sTCP:LISTEN'], {
        encoding: 'utf8',
      })
        .trim()
        .split('\n')
        .filter(Boolean);
      for (const pid of pids) {
        process.kill(parseInt(pid, 10), 'SIGTERM');
      }
    }
  } catch {
    // Port not in use or command not available — nothing to kill
  }
}

/**
 * Asks the running dev-browser server to shut down gracefully via its HTTP API,
 * then falls back to killing the process by port if the endpoint is unavailable
 * (e.g. server.mjs built before /shutdown was added).
 */
export async function shutdownDevBrowserServer(
  config: Pick<BrowserServerConfig, 'devBrowserPort' | 'devBrowserCdpPort'>,
): Promise<void> {
  const { devBrowserPort, devBrowserCdpPort } = config;

  let responded = false;
  try {
    const res = await fetch(`http://127.0.0.1:${devBrowserPort}/shutdown`, {
      method: 'POST',
      signal: AbortSignal.timeout(3000),
    });
    responded = res.ok;
  } catch {
    // Server not reachable — will fall back to port kill below
  }

  if (responded) {
    // Allow time for graceful cleanup + process.exit() inside the server
    await new Promise<void>((resolve) => setTimeout(resolve, 2000));
  }

  // Force-kill any process still listening on the Express port (the Node.js server.mjs process).
  killProcessOnPort(devBrowserPort);

  // Also kill the Chrome/Playwright browser process, which listens on the CDP port.
  // Chrome is a separate OS process that survives when the Node.js server is killed.
  if (devBrowserCdpPort) {
    killProcessOnPort(devBrowserCdpPort);
  }
}

export async function ensureDevBrowserServer(
  config: BrowserServerConfig,
  onProgress?: (progress: { stage: string; message?: string }) => void,
): Promise<ServerStartResult> {
  const hasChrome = isSystemChromeInstalled();
  const hasPlaywright = isPlaywrightInstalled();

  log.info(`[Browser] Browser check: Chrome=${hasChrome}, Playwright=${hasPlaywright}`);

  if (!hasChrome && !hasPlaywright) {
    log.info('[Browser] No browser available, installing Playwright Chromium...');
    onProgress?.({
      stage: 'setup',
      message: 'Chrome not found. Downloading browser (one-time setup, ~2 min)...',
    });

    try {
      await installPlaywrightChromium(config, (msg) => {
        onProgress?.({ stage: 'setup', message: msg });
      });
    } catch (error) {
      log.error('[Browser] Failed to install Playwright:', { error: String(error) });
      // Don't throw - let agent handle the failure
    }
  }

  // Use 127.0.0.1 (not localhost) in isDevBrowserServerReady so this check is
  // safe on macOS — it avoids the Local Network permission dialog that could be
  // triggered by localhost mDNS resolution on some macOS versions.
  if (await isDevBrowserServerReady(config.devBrowserPort)) {
    log.info('[Browser] Dev-browser server already running');
    return { ready: true, logs: [] };
  }

  return startDevBrowserServer(config);
}
