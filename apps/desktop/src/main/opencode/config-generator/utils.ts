/**
 * Utility functions for config-generator module
 *
 * Provides path resolution, directory management, and MCP command resolution
 * utilities used by the OpenCode config generator.
 *
 * @module main/opencode/config-generator/utils
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
 * Get the path where OpenCode config is stored
 */
export function getOpenCodeConfigPath(): string {
  return path.join(app.getPath('userData'), 'opencode', 'opencode.json');
}

/**
 * Get the path to OpenCode CLI's auth.json
 * OpenCode stores credentials in ~/.local/share/opencode/auth.json
 */
export function getOpenCodeAuthPath(): string {
  const homeDir = app.getPath('home');
  if (process.platform === 'win32') {
    return path.join(homeDir, 'AppData', 'Local', 'opencode', 'auth.json');
  }
  return path.join(homeDir, '.local', 'share', 'opencode', 'auth.json');
}

/**
 * Ensure the OpenCode config directory exists
 * Creates the directory if it doesn't exist using recursive mkdir
 *
 * @returns The path to the config directory
 */
export function ensureConfigDirectory(): string {
  const configPath = getOpenCodeConfigPath();
  const configDir = path.dirname(configPath);

  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  return configDir;
}

/**
 * Resolve the bundled tsx command for running TypeScript MCP servers
 *
 * Checks multiple candidate paths for tsx binary in the following order:
 * 1. file-permission node_modules
 * 2. ask-user-question node_modules
 * 3. dev-browser-mcp node_modules
 * 4. complete-task node_modules
 *
 * Falls back to ['npx', 'tsx'] if no bundled tsx is found
 *
 * @param mcpToolsPath - Path to the mcp-tools directory
 * @returns Array of command parts (e.g., ['/path/to/tsx'] or ['npx', 'tsx'])
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
 * Resolve the command to run an MCP server
 *
 * In packaged mode (or when OPENWORK_BUNDLED_MCP=1):
 * - Uses bundled node + compiled dist if available
 *
 * In development mode:
 * - Uses tsx + source TypeScript files
 *
 * @param tsxCommand - The tsx command array from resolveBundledTsxCommand
 * @param mcpToolsPath - Path to the mcp-tools directory
 * @param mcpName - Name of the MCP server (directory name)
 * @param sourceRelPath - Relative path to the source entry point (e.g., 'src/index.ts')
 * @param distRelPath - Relative path to the compiled entry point (e.g., 'dist/index.js')
 * @returns Array of command parts to spawn the MCP server
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
