import type { OAuthTokens } from '../common/types/connector.js';
import { fetchWithTimeout } from './oauth-metadata.js';

/**
 * Exchange an authorization code for access and refresh tokens.
 */
export async function exchangeCodeForTokens(params: {
  tokenEndpoint: string;
  code: string;
  codeVerifier: string;
  clientId: string;
  clientSecret?: string;
  redirectUri: string;
  resource?: string;
}): Promise<OAuthTokens> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: params.code,
    code_verifier: params.codeVerifier,
    client_id: params.clientId,
    redirect_uri: params.redirectUri,
  });

  if (params.clientSecret) {
    body.set('client_secret', params.clientSecret);
  }

  if (params.resource) {
    body.set('resource', params.resource);
  }

  const response = await fetchWithTimeout(params.tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Token exchange failed: ${response.status} ${response.statusText} - ${errorBody}`,
    );
  }

  const data = (await response.json()) as Record<string, unknown>;

  const accessToken = data.access_token as string | undefined;
  if (!accessToken) {
    throw new Error('Token response missing access_token');
  }

  const expiresIn = data.expires_in as number | undefined;

  return {
    accessToken,
    refreshToken: data.refresh_token as string | undefined,
    tokenType: (data.token_type as string) || 'Bearer',
    expiresAt: expiresIn ? Date.now() + expiresIn * 1000 : undefined,
    scope: data.scope as string | undefined,
  };
}

/**
 * Refresh an expired access token using a refresh token.
 */
export async function refreshAccessToken(params: {
  tokenEndpoint: string;
  refreshToken: string;
  clientId: string;
  clientSecret?: string;
  resource?: string;
}): Promise<OAuthTokens> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: params.refreshToken,
    client_id: params.clientId,
  });

  if (params.clientSecret) {
    body.set('client_secret', params.clientSecret);
  }

  if (params.resource) {
    body.set('resource', params.resource);
  }

  const response = await fetchWithTimeout(params.tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Token refresh failed: ${response.status} ${response.statusText} - ${errorBody}`,
    );
  }

  const data = (await response.json()) as Record<string, unknown>;

  const accessToken = data.access_token as string | undefined;
  if (!accessToken) {
    throw new Error('Token refresh response missing access_token');
  }

  const expiresIn = data.expires_in as number | undefined;

  return {
    accessToken,
    refreshToken: (data.refresh_token as string | undefined) ?? params.refreshToken,
    tokenType: (data.token_type as string) || 'Bearer',
    expiresAt: expiresIn ? Date.now() + expiresIn * 1000 : undefined,
    scope: data.scope as string | undefined,
  };
}

/**
 * Check if an OAuth access token is expired (with 5-minute buffer).
 */
export function isTokenExpired(tokens: OAuthTokens): boolean {
  if (!tokens.expiresAt) return false;
  const bufferMs = 5 * 60 * 1000; // 5 minutes
  return Date.now() >= tokens.expiresAt - bufferMs;
}
