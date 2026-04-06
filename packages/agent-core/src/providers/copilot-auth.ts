/**
 * GitHub Copilot device OAuth flow helpers.
 *
 * Implements the device authorization flow:
 *   1. Request a device code from GitHub
 *   2. Poll GitHub's token endpoint until authorized
 */

export const GITHUB_COPILOT_OAUTH_CLIENT_ID = 'Iv1.b507a08c87ecfe98';
export const GITHUB_COPILOT_DEVICE_CODE_URL = 'https://github.com/login/device/code';
export const GITHUB_COPILOT_TOKEN_URL = 'https://github.com/login/oauth/access_token';
export const GITHUB_COPILOT_AUTH_URL = 'https://github.com/login/device';
export const GITHUB_COPILOT_API_URL = 'https://api.github.com/copilot_internal/v2/token';

/** Scope required for Copilot access */
export const GITHUB_COPILOT_SCOPE = 'read:user';

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
    if (onPoll) {
      onPoll();
    }

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
