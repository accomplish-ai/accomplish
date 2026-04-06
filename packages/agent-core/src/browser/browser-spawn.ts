/**
 * Browser Spawn Utilities
 *
 * Helper functions for spawning browser-related processes.
 * Extracted from server.ts to keep it under the 200-line limit.
 */

import fs from 'fs';
import path from 'path';

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
