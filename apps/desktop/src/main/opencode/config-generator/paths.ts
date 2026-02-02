/**
 * Path utilities for OpenCode configuration
 *
 * Handles path resolution for MCP tools, config directories,
 * and bundled executables (tsx, node).
 *
 * @module config-generator/paths
 */

import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import { getNodePath } from '../../utils/bundled-node';

/**
 * Get the MCP tools directory path (contains MCP servers)
 * In dev: apps/desktop/mcp-tools
 * In packaged: resources/mcp-tools (unpacked from asar)
 */
export function getMcpToolsPath(): string {
  if (app.isPackaged) {
    // In packaged app, mcp-tools should be in resources folder (unpacked from asar)
    return path.join(process.resourcesPath, 'mcp-tools');
  } else {
    // In development, use app.getAppPath() which returns the desktop app directory
    // app.getAppPath() returns apps/desktop in dev mode
    return path.join(app.getAppPath(), 'mcp-tools');
  }
}

/**
 * Get the OpenCode config directory path (parent of mcp-tools/ for OPENCODE_CONFIG_DIR)
 * OpenCode looks for MCP tools at $OPENCODE_CONFIG_DIR/mcp-tools/<name>/
 */
export function getOpenCodeConfigDir(): string {
  if (app.isPackaged) {
    return process.resourcesPath;
  } else {
    return app.getAppPath();
  }
}

/**
 * Resolve the bundled tsx command
 * Searches for tsx in MCP tool node_modules/.bin directories
 * Falls back to npx tsx if not found
 */
export function resolveBundledTsxCommand(mcpToolsPath: string): string[] {
  const tsxBin = process.platform === 'win32' ? 'tsx.cmd' : 'tsx';
  const candidates = [
    path.join(mcpToolsPath, 'file-permission', 'node_modules', '.bin', tsxBin),
    path.join(mcpToolsPath, 'ask-user-question', 'node_modules', '.bin', tsxBin),
    path.join(mcpToolsPath, 'dev-browser-mcp', 'node_modules', '.bin', tsxBin),
    path.join(mcpToolsPath, 'complete-task', 'node_modules', '.bin', tsxBin),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      console.log('[OpenCode Config] Using bundled tsx:', candidate);
      return [candidate];
    }
  }

  console.log('[OpenCode Config] Bundled tsx not found; falling back to npx tsx');
  return ['npx', 'tsx'];
}

/**
 * Resolve the MCP server command
 * Uses bundled dist in packaged mode, tsx in development
 */
export function resolveMcpCommand(
  tsxCommand: string[],
  mcpToolsPath: string,
  mcpName: string,
  sourceRelPath: string,
  distRelPath: string
): string[] {
  const mcpDir = path.join(mcpToolsPath, mcpName);
  const distPath = path.join(mcpDir, distRelPath);

  if ((app.isPackaged || process.env.OPENWORK_BUNDLED_MCP === '1') && fs.existsSync(distPath)) {
    const nodePath = getNodePath();
    console.log('[OpenCode Config] Using bundled MCP entry:', distPath);
    return [nodePath, distPath];
  }

  const sourcePath = path.join(mcpDir, sourceRelPath);
  console.log('[OpenCode Config] Using tsx MCP entry:', sourcePath);
  return [...tsxCommand, sourcePath];
}
