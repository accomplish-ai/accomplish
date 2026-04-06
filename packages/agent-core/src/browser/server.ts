import { spawn } from 'child_process';
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
  const serverScript = path.join(config.mcpToolsPath, 'dev-browser', 'server.cjs');
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

  // Skip check on macOS to avoid triggering Local Network permission dialog
  if (process.platform !== 'darwin') {
    if (await isDevBrowserServerReady(config.devBrowserPort)) {
      log.info('[Browser] Dev-browser server already running');
      return { ready: true, logs: [] };
    }
  }

  return startDevBrowserServer(config);
}
