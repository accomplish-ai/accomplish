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

export const GITHUB_COPILOT_OAUTH_CLIENT_ID = 'Iv1.b507a08c87ecfe98';
export const GITHUB_COPILOT_DEVICE_CODE_URL = 'https://github.com/login/device/code';
export const GITHUB_COPILOT_TOKEN_URL = 'https://github.com/login/oauth/access_token';
export const GITHUB_COPILOT_AUTH_URL = 'https://github.com/login/device';
export const GITHUB_COPILOT_API_URL = 'https://api.github.com/copilot_internal/v2/token';

/** Scope required for Copilot access */
export const GITHUB_COPILOT_SCOPE = 'read:user';

const log = createConsoleLogger({ prefix: 'CopilotProvider' });

export interface CopilotDeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

export interface CopilotTokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
  error?: string;
  error_description?: string;
}

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
    if (!fs.existsSync(authPath)) return {};
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
  if (!entry || typeof entry !== 'object') return { connected: false };

  const e = entry as CopilotAuthEntry;
  if (e.type !== 'copilot-oauth') return { connected: false };

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

/**
 * Step 1 of device flow: request a device code from GitHub.
 * Returns device_code, user_code, verification_uri, interval, expires_in.
 */
export async function requestCopilotDeviceCode(): Promise<CopilotDeviceCodeResponse> {
  const params = new URLSearchParams({
    client_id: GITHUB_COPILOT_OAUTH_CLIENT_ID,
    scope: GITHUB_COPILOT_SCOPE,
  });

  const res = await fetch(GITHUB_COPILOT_DEVICE_CODE_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!res.ok) {
    throw new Error(`GitHub device code request failed: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as CopilotDeviceCodeResponse;
  if (!data.device_code || !data.user_code) {
    throw new Error('Invalid device code response from GitHub');
  }

  return data;
}

/**
 * Step 2: Poll GitHub's token endpoint until the user completes authorization.
 * Returns the access token when authorized.
 * Throws if the device code expires or an unrecoverable error occurs.
 */
export async function pollCopilotDeviceToken(params: {
  deviceCode: string;
  interval: number;
  expiresIn: number;
  onPoll?: () => void;
}): Promise<CopilotTokenResponse> {
  const { deviceCode, interval, expiresIn, onPoll } = params;
  const deadline = Date.now() + expiresIn * 1000;
  const pollIntervalMs = Math.max(interval, 5) * 1000;

  while (Date.now() < deadline) {
    if (onPoll) onPoll();

    await new Promise<void>((resolve) => setTimeout(resolve, pollIntervalMs));

    const body = new URLSearchParams({
      client_id: GITHUB_COPILOT_OAUTH_CLIENT_ID,
      device_code: deviceCode,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    });

    const res = await fetch(GITHUB_COPILOT_TOKEN_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    const data = (await res.json()) as CopilotTokenResponse;

    if (data.access_token) {
      return data;
    }

    if (data.error === 'authorization_pending' || data.error === 'slow_down') {
      // Continue polling
      continue;
    }

    if (data.error === 'expired_token') {
      throw new Error('Device code expired. Please try connecting again.');
    }

    if (data.error === 'access_denied') {
      throw new Error('Access was denied. Please authorize the GitHub Copilot connection.');
    }

    if (data.error) {
      throw new Error(`GitHub OAuth error: ${data.error} — ${data.error_description ?? ''}`);
    }
  }

  throw new Error('Timed out waiting for GitHub authorization. Please try again.');
}
