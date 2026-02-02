/**
 * MCP Server Builder
 *
 * Constructs MCP server configurations for OpenCode config generation.
 * Each MCP server provides specific functionality:
 * - file-permission: Request file system permissions
 * - ask-user-question: Ask questions to the user
 * - dev-browser-mcp: Browser automation
 * - complete-task: Signal task completion
 * - start-task: Capture plan before execution
 *
 * @module main/opencode/config-generator/mcp-servers/builder
 */

import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import { getNodePath } from '../../../utils/bundled-node';
import type { McpServerConfig } from '../types';
import { MCP_SERVERS, MCP_SERVER_CONFIG, type McpServerName } from '../constants';

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
 * @param distRelPath - Relative path to the compiled entry point (e.g., 'dist/index.mjs')
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

  if (
    (app.isPackaged || process.env.OPENWORK_BUNDLED_MCP === '1') &&
    fs.existsSync(distPath)
  ) {
    const nodePath = getNodePath();
    console.log('[OpenCode Config] Using bundled MCP entry:', distPath);
    return [nodePath, distPath];
  }

  const sourcePath = path.join(mcpDir, sourceRelPath);
  console.log('[OpenCode Config] Using tsx MCP entry:', sourcePath);
  return [...tsxCommand, sourcePath];
}

/**
 * Build MCP server configurations for all servers
 *
 * Creates configuration objects for each MCP server with:
 * - type: 'local'
 * - enabled: true
 * - timeout: 30000ms
 * - command: resolved command array
 * - environment: port configuration (only for file-permission and ask-user-question)
 *
 * @param mcpToolsPath - Path to the mcp-tools directory
 * @param tsxCommand - The tsx command array from resolveBundledTsxCommand
 * @param permissionPort - Port for the permission API server
 * @param questionPort - Port for the question API server
 * @returns Record of MCP server configurations keyed by server name
 */
export function buildMcpServerConfigs(
  mcpToolsPath: string,
  tsxCommand: string[],
  permissionPort: number,
  questionPort: number
): Record<McpServerName, McpServerConfig> {
  const configs = {} as Record<McpServerName, McpServerConfig>;

  for (const serverName of MCP_SERVERS) {
    const command = resolveMcpCommand(
      tsxCommand,
      mcpToolsPath,
      serverName,
      MCP_SERVER_CONFIG.SOURCE_FILE,
      MCP_SERVER_CONFIG.DIST_FILE
    );

    const config: McpServerConfig = {
      type: MCP_SERVER_CONFIG.TYPE,
      command,
      enabled: MCP_SERVER_CONFIG.ENABLED,
      timeout: MCP_SERVER_CONFIG.TIMEOUT_MS,
    };

    // Add environment variables for servers that need them
    if (serverName === 'file-permission') {
      config.environment = {
        PERMISSION_API_PORT: String(permissionPort),
      };
    } else if (serverName === 'ask-user-question') {
      config.environment = {
        QUESTION_API_PORT: String(questionPort),
      };
    }

    configs[serverName] = config;
  }

  return configs;
}
