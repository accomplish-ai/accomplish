import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { createConsoleLogger } from '../utils/logging.js';

const log = createConsoleLogger({ prefix: 'OpenCodeAuth' });

interface OpenCodeOauthAuthEntry {
  type?: string;
  refresh?: string;
  access?: string;
  expires?: number;
}

export function getOpenCodeDataHome(): string {
  return process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
}

export function getOpenCodeAuthJsonPath(): string {
  return path.join(getOpenCodeDataHome(), 'opencode', 'auth.json');
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

// Slack MCP OAuth helpers — re-exported from auth-slack-mcp.ts
export type { OpenCodeMcpOauthStatus } from './auth-slack-mcp.js';
export {
  OPENCODE_SLACK_MCP_SERVER_URL,
  OPENCODE_SLACK_MCP_CLIENT_ID,
  OPENCODE_SLACK_MCP_CALLBACK_HOST,
  OPENCODE_SLACK_MCP_CALLBACK_PORT,
  OPENCODE_SLACK_MCP_CALLBACK_PATH,
  getSlackMcpCallbackUrl,
  getOpenCodeMcpAuthJsonPath,
  getSlackMcpOauthStatus,
  setSlackMcpPendingAuth,
  setSlackMcpTokens,
  clearSlackMcpAuth,
} from './auth-slack-mcp.js';
