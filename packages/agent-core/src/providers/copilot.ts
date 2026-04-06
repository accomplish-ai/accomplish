/**
 * GitHub Copilot provider support.
 *
 * GitHub Copilot uses a device OAuth flow (similar to GitHub CLI's `gh auth login`).
 * Credentials are stored in OpenCode-compatible auth.json format under the key
 * "github-copilot", which is the provider id that OpenCode's @opencode/github-copilot
 * package expects.
 *
 * Auth flow:
 *   1. Request a device code from GitHub OAuth (client_id: Iv1.b507a08c87ecfe98)
 *   2. Show the user-code and ask the user to visit verification_uri in their browser
 *   3. Poll GitHub's token endpoint until the user completes authorization
 *   4. Exchange the device token for a Copilot-specific token via the Copilot API
 *   5. Write access_token + refresh_token to auth.json as type "copilot-oauth"
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createConsoleLogger } from '../utils/logging.js';

export {
  GITHUB_COPILOT_OAUTH_CLIENT_ID,
  GITHUB_COPILOT_DEVICE_CODE_URL,
  GITHUB_COPILOT_TOKEN_URL,
  GITHUB_COPILOT_AUTH_URL,
  GITHUB_COPILOT_API_URL,
  GITHUB_COPILOT_SCOPE,
  requestCopilotDeviceCode,
  pollCopilotDeviceToken,
} from './copilot-auth.js';

export type { CopilotDeviceCodeResponse, CopilotTokenResponse } from './copilot-auth.js';

const log = createConsoleLogger({ prefix: 'CopilotProvider' });

export interface CopilotOAuthStatus {
  connected: boolean;
  username?: string;
  expiresAt?: number;
}

export interface CopilotAuthEntry {
  type: 'copilot-oauth';
  access?: string;
  refresh?: string;
  expires?: number;
  username?: string;
}

function getOpenCodeAuthJsonPath(): string {
  const dataHome = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
  return path.join(dataHome, 'opencode', 'auth.json');
}

function readAuthJson(): Record<string, unknown> {
  const authPath = getOpenCodeAuthJsonPath();
  try {
    if (!fs.existsSync(authPath)) {
      return {};
    }
    const raw = fs.readFileSync(authPath, 'utf8');
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function writeAuthJson(data: Record<string, unknown>): void {
  const authPath = getOpenCodeAuthJsonPath();
  fs.mkdirSync(path.dirname(authPath), { recursive: true });
  fs.writeFileSync(authPath, JSON.stringify(data, null, 2), 'utf8');
  log.info('[CopilotProvider] auth.json updated');
}

/**
 * Get current Copilot OAuth connection status by reading auth.json.
 */
export function getCopilotOAuthStatus(): CopilotOAuthStatus {
  const auth = readAuthJson();
  const entry = auth['github-copilot'];
  if (!entry || typeof entry !== 'object') {
    return { connected: false };
  }

  const e = entry as CopilotAuthEntry;
  if (e.type !== 'copilot-oauth') {
    return { connected: false };
  }

  const connected =
    (typeof e.access === 'string' && e.access.trim().length > 0) ||
    (typeof e.refresh === 'string' && e.refresh.trim().length > 0);

  return {
    connected,
    username: e.username,
    expiresAt: e.expires,
  };
}

/**
 * Write Copilot OAuth tokens to auth.json in OpenCode-compatible format.
 */
export function setCopilotOAuthTokens(params: {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  username?: string;
}): void {
  const auth = readAuthJson();
  auth['github-copilot'] = {
    type: 'copilot-oauth',
    access: params.accessToken,
    ...(params.refreshToken ? { refresh: params.refreshToken } : {}),
    ...(params.expiresAt ? { expires: params.expiresAt } : {}),
    ...(params.username ? { username: params.username } : {}),
  } satisfies CopilotAuthEntry;
  writeAuthJson(auth);
}

/**
 * Remove Copilot credentials from auth.json.
 */
export function clearCopilotOAuth(): void {
  const auth = readAuthJson();
  delete auth['github-copilot'];
  writeAuthJson(auth);
  log.info('[CopilotProvider] Copilot credentials cleared');
}
