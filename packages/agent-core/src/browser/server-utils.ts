/**
 * Browser server utility functions:
 * - Node environment setup
 * - Node executable resolution
 * - Playwright CLI path resolution
 * - Playwright Chromium installation
 * - Dev-browser server health checks
 */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { createConsoleLogger } from '../utils/logging.js';

export interface BrowserServerConfig {
  mcpToolsPath: string;
  bundledNodeBinPath?: string;
  devBrowserPort: number;
}

const log = createConsoleLogger({ prefix: 'Browser' });

export function buildNodeEnvironment(bundledNodeBinPath?: string): NodeJS.ProcessEnv {
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

export function getNodeExecutable(bundledNodeBinPath?: string): string {
  if (!bundledNodeBinPath) {
    throw new Error(
      '[Browser] Bundled Node.js path is missing. ' +
        'Run "pnpm -F @accomplish/desktop download:nodejs" and rebuild artifacts.',
    );
  }

  const nodeName = process.platform === 'win32' ? 'node.exe' : 'node';
  const nodePath = path.join(bundledNodeBinPath, nodeName);
  if (fs.existsSync(nodePath)) {
    return nodePath;
  }

  throw new Error(
    `[Browser] Missing bundled Node.js executable: ${nodePath}. ` +
      'Run "pnpm -F @accomplish/desktop download:nodejs" and rebuild artifacts.',
  );
}

export function resolvePlaywrightCliPath(mcpToolsPath: string): string {
  const candidates = [
    path.join(mcpToolsPath, 'dev-browser', 'node_modules', 'playwright', 'cli.js'),
    path.join(mcpToolsPath, 'node_modules', 'playwright', 'cli.js'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    '[Browser] Playwright CLI not found for dev-browser setup. ' +
      `Checked: ${candidates.join(', ')}. ` +
      `Run "npm --prefix \\"${mcpToolsPath}\\" install --omit=dev".`,
  );
}

export async function installPlaywrightChromium(
  config: BrowserServerConfig,
  onProgress?: (message: string) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const devBrowserDir = path.join(config.mcpToolsPath, 'dev-browser');
    if (!fs.existsSync(devBrowserDir)) {
      const message =
        `[Browser] Missing dev-browser directory: ${devBrowserDir}. ` +
        'Run "pnpm -F @accomplish/desktop build:mcp-tools:dev" and rebuild artifacts.';
      onProgress?.(message);
      reject(new Error(message));
      return;
    }

    const nodeExe = getNodeExecutable(config.bundledNodeBinPath);
    const playwrightCliPath = resolvePlaywrightCliPath(config.mcpToolsPath);
    const spawnEnv = buildNodeEnvironment(config.bundledNodeBinPath);

    onProgress?.('Downloading browser...');

    const child = spawn(nodeExe, [playwrightCliPath, 'install', 'chromium'], {
      cwd: devBrowserDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: spawnEnv,
      shell: false,
    });

    child.stdout?.on('data', (data: Buffer) => {
      const line = data.toString().trim();
      if (line) {
        log.info(`[Playwright Install] ${line}`);
        if (line.includes('%') || line.toLowerCase().startsWith('downloading')) {
          onProgress?.(line);
        }
      }
    });

    child.stderr?.on('data', (data: Buffer) => {
      const line = data.toString().trim();
      if (line) {
        log.info(`[Playwright Install] ${line}`);
      }
    });

    child.on('close', (code) => {
      if (code === 0) {
        log.info('[Browser] Playwright Chromium installed successfully');
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
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1000);
  try {
    const res = await fetch(`http://localhost:${port}`, {
      signal: controller.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

export async function waitForDevBrowserServer(
  port: number,
  maxWaitMs = 15000,
  pollIntervalMs = 500,
): Promise<boolean> {
  const startTime = Date.now();
  let attempts = 0;
  while (Date.now() - startTime < maxWaitMs) {
    attempts++;
    if (await isDevBrowserServerReady(port)) {
      log.info(
        `[Browser] Dev-browser server ready after ${attempts} attempts (${Date.now() - startTime}ms)`,
      );
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
  log.info(
    `[Browser] Dev-browser server not ready after ${attempts} attempts (${maxWaitMs}ms timeout)`,
  );
  return false;
}
