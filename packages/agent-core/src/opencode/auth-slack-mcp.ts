/**
 * Slack MCP OAuth helpers — extracted from auth.ts to keep file sizes under 200 lines.
 */

import * as path from 'path';
import * as fs from 'fs';
import type { OAuthTokens } from '../common/types/connector.js';
import { getOpenCodeDataHome } from './auth.js';

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

export function getOpenCodeMcpAuthJsonPath(): string {
  return path.join(getOpenCodeDataHome(), 'opencode', 'mcp-auth.json');
}

function readOpenCodeMcpAuthJson(): Record<string, unknown> | null {
  try {
    const filePath = getOpenCodeMcpAuthJsonPath();
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function writeOpenCodeMcpAuthJson(data: Record<string, unknown>): void {
  const filePath = getOpenCodeMcpAuthJsonPath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
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
