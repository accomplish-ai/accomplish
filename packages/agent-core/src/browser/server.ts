import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { isSystemChromeInstalled, isPlaywrightInstalled } from './detection.js';

export interface BrowserServerConfig {
  mcpToolsPath: string;
  bundledNodeBinPath?: string;
  devBrowserPort: number;
}

function buildNodeEnvironment(bundledNodeBinPath?: string): NodeJS.ProcessEnv {
  const spawnEnv: NodeJS.ProcessEnv = { ...process.env };

  if (bundledNodeBinPath) {
    const delimiter = process.platform === 'win32' ? ';' : ':';
    const existingPath = process.env.PATH ?? process.env.Path ?? '';
    const combinedPath = existingPath
      ? `${bundledNodeBinPath}${delimiter}${existingPath}`
      : bundledNodeBinPath;
    spawnEnv.PATH = combinedPath;
    if (process.platform === 'win32') {
      spawnEnv.Path = combinedPath;
    }
    spawnEnv.NODE_BIN_PATH = bundledNodeBinPath;
  }

  return spawnEnv;
}

function getNpxExecutable(bundledNodeBinPath?: string): string {
  if (bundledNodeBinPath) {
    const npxName = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    const npxPath = path.join(bundledNodeBinPath, npxName);
    if (fs.existsSync(npxPath)) {
      return npxPath;
    }
  }
  return 'npx';
}

function getNodeExecutable(bundledNodeBinPath?: string): string {
  if (bundledNodeBinPath) {
    const nodeName = process.platform === 'win32' ? 'node.exe' : 'node';
    const nodePath = path.join(bundledNodeBinPath, nodeName);
    if (fs.existsSync(nodePath)) {
      return nodePath;
    }
  }
  return 'node';
}

export async function installPlaywrightChromium(
  config: BrowserServerConfig,
  onProgress?: (message: string) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const devBrowserDir = path.join(config.mcpToolsPath, 'dev-browser');
    const npxPath = getNpxExecutable(config.bundledNodeBinPath);
    const spawnEnv = buildNodeEnvironment(config.bundledNodeBinPath);

    console.log(`[Browser] Installing Playwright Chromium using npx: ${npxPath}`);
    onProgress?.('Downloading browser...');

    const child = spawn(npxPath, ['playwright', 'install', 'chromium'], {
      cwd: devBrowserDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: spawnEnv,
      shell: process.platform === 'win32',
    });

    child.stdout?.on('data', (data: Buffer) => {
      const line = data.toString().trim();
      if (line) {
        console.log(`[Playwright Install] ${line}`);
        if (line.includes('%') || line.toLowerCase().startsWith('downloading')) {
          onProgress?.(line);
        }
      }
    });

    child.stderr?.on('data', (data: Buffer) => {
      const line = data.toString().trim();
      if (line) {
        console.log(`[Playwright Install] ${line}`);
      }
    });

    child.on('close', (code) => {
      if (code === 0) {
        console.log('[Browser] Playwright Chromium installed successfully');
        onProgress?.('Browser installed successfully!');
        resolve();
      } else {
        reject(new Error(`Playwright install failed with code ${code}`));
      }
    });

    child.on('error', (err) => {
      reject(err);
    });
  });
}

export async function isDevBrowserServerReady(port: number): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1000);
    const res = await fetch(`http://localhost:${port}`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return res.ok;
  } catch {
    return false;
  }
}

export async function waitForDevBrowserServer(
  port: number,
  maxWaitMs = 15000,
  pollIntervalMs = 500
): Promise<boolean> {
  const startTime = Date.now();
  let attempts = 0;
  while (Date.now() - startTime < maxWaitMs) {
    attempts++;
    if (await isDevBrowserServerReady(port)) {
      console.log(`[Browser] Dev-browser server ready after ${attempts} attempts (${Date.now() - startTime}ms)`);
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
  console.log(`[Browser] Dev-browser server not ready after ${attempts} attempts (${maxWaitMs}ms timeout)`);
  return false;
}

export interface ServerStartResult {
  ready: boolean;
  pid?: number;
  logs: string[];
}

export async function startDevBrowserServer(
  config: BrowserServerConfig
): Promise<ServerStartResult> {
  const serverScript = path.join(config.mcpToolsPath, 'dev-browser', 'server.cjs');
  const serverCwd = path.join(config.mcpToolsPath, 'dev-browser');
  const spawnEnv = buildNodeEnvironment(config.bundledNodeBinPath);
  const nodeExe = getNodeExecutable(config.bundledNodeBinPath);

  const serverLogs: string[] = [];

  console.log('[Browser] ========== DEV-BROWSER SERVER STARTUP ==========');
  console.log('[Browser] Node executable:', nodeExe);
  console.log('[Browser] Server script:', serverScript);
  console.log('[Browser] Working directory:', serverCwd);
  console.log('[Browser] Script exists:', fs.existsSync(serverScript));
  console.log('[Browser] CWD exists:', fs.existsSync(serverCwd));

  // detached + unref allows server to outlive parent process
  const child = spawn(nodeExe, [serverScript], {
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    cwd: serverCwd,
    env: spawnEnv,
    windowsHide: true,
  });

  child.stdout?.on('data', (data: Buffer) => {
    const lines = data.toString().split('\n').filter((l) => l.trim());
    for (const line of lines) {
      serverLogs.push(`[stdout] ${line}`);
      console.log('[DevBrowser stdout]', line);
    }
  });

  child.stderr?.on('data', (data: Buffer) => {
    const lines = data.toString().split('\n').filter((l) => l.trim());
    for (const line of lines) {
      serverLogs.push(`[stderr] ${line}`);
      console.log('[DevBrowser stderr]', line);
    }
  });

  child.on('error', (err) => {
    const errorMsg = `Spawn error: ${err.message} (code: ${(err as NodeJS.ErrnoException).code})`;
    serverLogs.push(`[error] ${errorMsg}`);
    console.error('[Browser] Dev-browser spawn error:', err);
  });

  child.on('exit', (code, signal) => {
    const exitMsg = `Process exited with code ${code}, signal ${signal}`;
    serverLogs.push(`[exit] ${exitMsg}`);
    console.log('[Browser] Dev-browser', exitMsg);
    if (code !== 0 && code !== null) {
      console.error('[Browser] Dev-browser server failed. Logs:');
      for (const log of serverLogs) {
        console.error('[Browser]  ', log);
      }
    }
  });

  child.unref();

  console.log('[Browser] Dev-browser server spawn initiated (PID:', child.pid, ')');

  // Windows needs longer timeout due to slower process startup
  const maxWaitMs = process.platform === 'win32' ? 30000 : 15000;
  console.log(`[Browser] Waiting for dev-browser server to be ready (max ${maxWaitMs}ms)...`);

  const serverReady = await waitForDevBrowserServer(config.devBrowserPort, maxWaitMs);

  console.log('[Browser] ========== END DEV-BROWSER SERVER STARTUP ==========');

  return {
    ready: serverReady,
    pid: child.pid,
    logs: serverLogs,
  };
}

export async function ensureDevBrowserServer(
  config: BrowserServerConfig,
  onProgress?: (progress: { stage: string; message?: string }) => void
): Promise<ServerStartResult> {
  const hasChrome = isSystemChromeInstalled();
  const hasPlaywright = isPlaywrightInstalled();

  console.log(`[Browser] Browser check: Chrome=${hasChrome}, Playwright=${hasPlaywright}`);

  if (!hasChrome && !hasPlaywright) {
    console.log('[Browser] No browser available, installing Playwright Chromium...');
    onProgress?.({
      stage: 'setup',
      message: 'Chrome not found. Downloading browser (one-time setup, ~2 min)...',
    });

    try {
      await installPlaywrightChromium(config, (msg) => {
        onProgress?.({ stage: 'setup', message: msg });
      });
    } catch (error) {
      console.error('[Browser] Failed to install Playwright:', error);
      // Don't throw - let agent handle the failure
    }
  }

  // Skip check on macOS to avoid triggering Local Network permission dialog
  if (process.platform !== 'darwin') {
    if (await isDevBrowserServerReady(config.devBrowserPort)) {
      console.log('[Browser] Dev-browser server already running');
      return { ready: true, logs: [] };
    }
  }

  return startDevBrowserServer(config);
}
