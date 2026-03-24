import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import type { OAuthTokens } from '../common/types/connector.js';
import { createConsoleLogger } from '../utils/logging.js';

const log = createConsoleLogger({ prefix: 'OpenCodeAuth' });

interface OpenCodeOauthAuthEntry {
  type?: string;
  refresh?: string;
  access?: string;
  expires?: number;
}

interface OpenCodeMcpOauthAuthEntry {
  tokens?: {
    accessToken: string;
    refreshToken?: string;
    expiresAt?: number;
    scope?: string;
  };
  oauthState?: string;
  codeVerifier?: string;
  serverUrl?: string;
  accessToken?: string;
  refreshToken?: string;
  access?: string;
  refresh?: string;
}

export interface OpenCodeMcpOauthStatus {
  connected: boolean;
  pendingAuthorization: boolean;
}

export const OPENCODE_SLACK_MCP_SERVER_URL = 'https://mcp.slack.com/mcp';
export const OPENCODE_SLACK_MCP_CLIENT_ID = '1601185624273.8899143856786';
export const OPENCODE_SLACK_MCP_CALLBACK_HOST = 'localhost';
export const OPENCODE_SLACK_MCP_CALLBACK_PORT = 3118;
export const OPENCODE_SLACK_MCP_CALLBACK_PATH = '/callback';

export function getSlackMcpCallbackUrl(): string {
  return `http://${OPENCODE_SLACK_MCP_CALLBACK_HOST}:${OPENCODE_SLACK_MCP_CALLBACK_PORT}${OPENCODE_SLACK_MCP_CALLBACK_PATH}`;
}

export function getOpenCodeDataHome(): string {
  return process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
}

export function getOpenCodeAuthJsonPath(): string {
  return path.join(getOpenCodeDataHome(), 'opencode', 'auth.json');
}

export function getOpenCodeMcpAuthJsonPath(): string {
  return path.join(getOpenCodeDataHome(), 'opencode', 'mcp-auth.json');
}

function readJsonFile(filePath: string): Record<string, unknown> | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function readOpenCodeAuthJson(): Record<string, unknown> | null {
  return readJsonFile(getOpenCodeAuthJsonPath());
}

function readOpenCodeMcpAuthJson(): Record<string, unknown> | null {
  return readJsonFile(getOpenCodeMcpAuthJsonPath());
}

function writeOpenCodeMcpAuthJson(data: Record<string, unknown>): void {
  const filePath = getOpenCodeMcpAuthJsonPath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

export function getOpenAiOauthStatus(): { connected: boolean; expires?: number } {
  const authJson = readOpenCodeAuthJson();
  if (!authJson) return { connected: false };

  const entry = authJson.openai;
  if (!entry || typeof entry !== 'object') return { connected: false };

  const oauth = entry as OpenCodeOauthAuthEntry;
  if (oauth.type !== 'oauth') return { connected: false };

  const refresh = oauth.refresh;
  const connected = typeof refresh === 'string' && refresh.trim().length > 0;
  return { connected, expires: oauth.expires };
}

export function getOpenAiOauthAccessToken(): string | null {
  const authJson = readOpenCodeAuthJson();
  if (!authJson) return null;

  const entry = authJson.openai;
  if (!entry || typeof entry !== 'object') return null;

  const oauth = entry as OpenCodeOauthAuthEntry;
  if (oauth.type !== 'oauth') return null;

  const access = oauth.access;
  return typeof access === 'string' && access.trim().length > 0 ? access : null;
}

export function getOpenCodeAuthPath(): string {
  const homeDir = os.homedir();
  if (process.platform === 'win32') {
    return path.join(homeDir, 'AppData', 'Local', 'opencode', 'auth.json');
  }
  return path.join(homeDir, '.local', 'share', 'opencode', 'auth.json');
}

export function writeOpenCodeAuth(
  providerKeys: Record<string, { type: string; key: string }>,
): void {
  const authPath = getOpenCodeAuthPath();
  const authDir = path.dirname(authPath);

  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
  }

  let auth: Record<string, { type: string; key: string }> = {};
  if (fs.existsSync(authPath)) {
    try {
      auth = JSON.parse(fs.readFileSync(authPath, 'utf-8'));
    } catch (_e) {
      log.warn('[OpenCode Auth] Failed to parse existing auth.json, creating new one');
      auth = {};
    }
  }

  for (const [providerId, entry] of Object.entries(providerKeys)) {
    auth[providerId] = entry;
  }

  fs.writeFileSync(authPath, JSON.stringify(auth, null, 2));
  log.info(`[OpenCode Auth] Updated auth.json at: ${authPath}`);
}

export function getSlackMcpOauthStatus(): OpenCodeMcpOauthStatus {
  const authJson = readOpenCodeMcpAuthJson();
  if (!authJson) {
    return { connected: false, pendingAuthorization: false };
  }

  const entry = authJson.slack;
  if (!entry || typeof entry !== 'object') {
    return { connected: false, pendingAuthorization: false };
  }

  const oauth = entry as OpenCodeMcpOauthAuthEntry;
  const connected = [
    oauth.tokens?.accessToken,
    oauth.tokens?.refreshToken,
    oauth.refreshToken,
    oauth.accessToken,
    oauth.refresh,
    oauth.access,
  ].some((value) => typeof value === 'string' && value.trim().length > 0);

  const pendingAuthorization =
    !connected &&
    typeof oauth.oauthState === 'string' &&
    oauth.oauthState.trim().length > 0 &&
    typeof oauth.codeVerifier === 'string' &&
    oauth.codeVerifier.trim().length > 0;

  return { connected, pendingAuthorization };
}

export function setSlackMcpPendingAuth(params: { codeVerifier: string; oauthState: string }): void {
  const authJson = readOpenCodeMcpAuthJson() ?? {};
  authJson.slack = {
    codeVerifier: params.codeVerifier,
    oauthState: params.oauthState,
    serverUrl: OPENCODE_SLACK_MCP_SERVER_URL,
  } satisfies OpenCodeMcpOauthAuthEntry;
  writeOpenCodeMcpAuthJson(authJson);
}

export function setSlackMcpTokens(tokens: OAuthTokens): void {
  const authJson = readOpenCodeMcpAuthJson() ?? {};
  authJson.slack = {
    tokens: {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt ? Math.floor(tokens.expiresAt / 1000) : undefined,
      scope: tokens.scope,
    },
    serverUrl: OPENCODE_SLACK_MCP_SERVER_URL,
  } satisfies OpenCodeMcpOauthAuthEntry;
  writeOpenCodeMcpAuthJson(authJson);
}

export function clearSlackMcpAuth(): void {
  const authJson = readOpenCodeMcpAuthJson();
  if (!authJson) {
    return;
  }

  delete authJson.slack;
  writeOpenCodeMcpAuthJson(authJson);
}
