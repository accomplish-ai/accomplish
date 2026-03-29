/**
 * MCP server configuration builder for OpenCode config generation.
 * Extracted from config-generator.ts to keep that file focused on high-level orchestration.
 */
import path from 'path';
import fs from 'fs';
import { OPENCODE_SLACK_MCP_SERVER_URL, OPENCODE_SLACK_MCP_CLIENT_ID } from './auth.js';
import { MCP_TOOL_TIMEOUT_MS } from '../common/constants.js';

/** Browser automation mode for task execution. */
export interface BrowserConfig {
  /** 'builtin' = dev-browser HTTP server (default), 'remote' = connect to CDP endpoint, 'none' = no browser */
  mode: 'builtin' | 'remote' | 'none';
  /** For 'remote': the CDP endpoint URL */
  cdpEndpoint?: string;
  /** For 'remote': auth headers (e.g. { 'X-CDP-Secret': '...' }) */
  cdpHeaders?: Record<string, string>;
  /** For 'builtin': run headless */
  headless?: boolean;
}

export interface McpServerConfig {
  type?: 'local' | 'remote';
  command?: string[];
  url?: string;
  headers?: Record<string, string>;
  enabled?: boolean;
  environment?: Record<string, string>;
  timeout?: number;
  oauth?:
    | false
    | {
        clientId?: string;
        clientSecret?: string;
        scope?: string;
      };
}

function resolveMcpCommand(
  mcpToolsPath: string,
  mcpName: string,
  distRelPath: string,
  nodePath: string,
): string[] {
  const mcpDir = path.join(mcpToolsPath, mcpName);
  const distPath = path.join(mcpDir, distRelPath);
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `[OpenCode Config] Missing MCP dist entry: ${distPath}. ` +
        'Run "pnpm -F @accomplish/desktop build:mcp-tools:dev" before launching.',
    );
  }
  return [nodePath, distPath];
}

export interface BuildMcpServersOptions {
  mcpToolsPath: string;
  nodeExe: string;
  permissionApiPort: number;
  questionApiPort: number;
  browserConfig: BrowserConfig;
  connectors?: Array<{
    id: string;
    name: string;
    url: string;
    accessToken: string;
  }>;
}

/**
 * Builds the MCP server configuration map for OpenCode.
 * Includes built-in tools, browser config, and connected remote MCP connectors.
 */
export function buildMcpServers(options: BuildMcpServersOptions): Record<string, McpServerConfig> {
  const { mcpToolsPath, nodeExe, permissionApiPort, questionApiPort, browserConfig, connectors } =
    options;

  const mcpServers: Record<string, McpServerConfig> = {
    slack: {
      type: 'remote',
      url: OPENCODE_SLACK_MCP_SERVER_URL,
      oauth: { clientId: OPENCODE_SLACK_MCP_CLIENT_ID },
    },
    'file-permission': {
      type: 'local',
      command: resolveMcpCommand(mcpToolsPath, 'file-permission', 'dist/index.mjs', nodeExe),
      enabled: true,
      environment: { PERMISSION_API_PORT: String(permissionApiPort) },
      timeout: 30000,
    },
    'ask-user-question': {
      type: 'local',
      command: resolveMcpCommand(mcpToolsPath, 'ask-user-question', 'dist/index.mjs', nodeExe),
      enabled: true,
      environment: { QUESTION_API_PORT: String(questionApiPort) },
      timeout: 600000, // 10 minutes — user needs time to read and respond
    },
    'request-connector-auth': {
      type: 'local',
      command: resolveMcpCommand(mcpToolsPath, 'request-connector-auth', 'dist/index.mjs', nodeExe),
      enabled: true,
      timeout: MCP_TOOL_TIMEOUT_MS,
    },
    'complete-task': {
      type: 'local',
      command: resolveMcpCommand(mcpToolsPath, 'complete-task', 'dist/index.mjs', nodeExe),
      enabled: true,
      timeout: 30000,
    },
    'start-task': {
      type: 'local',
      command: resolveMcpCommand(mcpToolsPath, 'start-task', 'dist/index.mjs', nodeExe),
      enabled: true,
      timeout: 30000,
    },
    'desktop-control': {
      type: 'local',
      command: resolveMcpCommand(mcpToolsPath, 'desktop-control', 'dist/index.mjs', nodeExe),
      enabled: true,
      environment: { PERMISSION_API_PORT: String(permissionApiPort) },
      timeout: 60000,
    },
  };

  if (browserConfig.mode !== 'none') {
    const browserEnv: Record<string, string> = {};
    if (browserConfig.mode === 'remote') {
      if (browserConfig.cdpEndpoint) {
        browserEnv.CDP_ENDPOINT = browserConfig.cdpEndpoint;
      }
      if (browserConfig.cdpHeaders) {
        for (const [key, value] of Object.entries(browserConfig.cdpHeaders)) {
          if (key.toLowerCase() === 'x-cdp-secret') {
            browserEnv.CDP_SECRET = value;
          }
        }
      }
    }
    mcpServers['dev-browser-mcp'] = {
      type: 'local',
      command: resolveMcpCommand(mcpToolsPath, 'dev-browser-mcp', 'dist/index.mjs', nodeExe),
      enabled: true,
      ...(Object.keys(browserEnv).length > 0 && { environment: browserEnv }),
      timeout: 30000,
    };
  }

  if (connectors) {
    for (const connector of connectors) {
      const sanitized = connector.name
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 20);
      const baseName = sanitized || 'mcp-remote';
      const idSuffix = connector.id.slice(0, 6);
      let key = `connector-${baseName}-${idSuffix}`;
      if (mcpServers[key]) {
        let i = 1;
        while (mcpServers[`${key}-${i}`]) {
          i += 1;
        }
        key = `${key}-${i}`;
      }
      mcpServers[key] = {
        type: 'remote',
        url: connector.url,
        headers: { Authorization: `Bearer ${connector.accessToken}` },
        enabled: true,
      };
    }
  }

  return mcpServers;
}
