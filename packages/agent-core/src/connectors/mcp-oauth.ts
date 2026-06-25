import crypto from 'crypto';
import type { OAuthMetadata, OAuthClientRegistration } from '../common/types/connector.js';
import { fetchWithTimeout } from './oauth-metadata.js';

export type { OAuthProtectedResourceMetadata } from './oauth-metadata.js';
export {
  OAuthMetadataDiscoveryError,
  discoverOAuthMetadata,
  discoverOAuthProtectedResourceMetadata,
} from './oauth-metadata.js';
export { exchangeCodeForTokens, refreshAccessToken, isTokenExpired } from './oauth-tokens.js';

/**
 * Register an OAuth client dynamically with the authorization server.
 */
export async function registerOAuthClient(
  metadata: OAuthMetadata,
  redirectUri: string,
  clientName: string,
): Promise<OAuthClientRegistration> {
  if (!metadata.registrationEndpoint) {
    throw new Error('OAuth server does not support dynamic client registration');
  }

  const response = await fetchWithTimeout(metadata.registrationEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_name: clientName,
      redirect_uris: [redirectUri],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `OAuth client registration failed: ${response.status} ${response.statusText} - ${body}`,
    );
  }

  const data = (await response.json()) as Record<string, unknown>;

  const clientId = data.client_id as string | undefined;
  if (!clientId) {
    throw new Error('OAuth client registration response missing client_id');
  }

  return {
    clientId,
    clientSecret: data.client_secret as string | undefined,
  };
}

/**
 * Generate a PKCE code verifier and code challenge (S256).
 */
export function generatePkceChallenge(): { codeVerifier: string; codeChallenge: string } {
  // Generate a random 43-character code verifier (base64url-encoded 32 bytes)
  const verifierBytes = crypto.randomBytes(32);
  const codeVerifier = verifierBytes.toString('base64url');

  // S256: SHA-256 hash of the verifier, base64url-encoded
  const hash = crypto.createHash('sha256').update(codeVerifier).digest();
  const codeChallenge = hash.toString('base64url');

  return { codeVerifier, codeChallenge };
}

/**
 * Build the OAuth 2.0 authorization URL.
 */
export function buildAuthorizationUrl(params: {
  authorizationEndpoint: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  state: string;
  scope?: string;
  extraParams?: Record<string, string>;
}): string {
  const url = new URL(params.authorizationEndpoint);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', params.clientId);
  url.searchParams.set('redirect_uri', params.redirectUri);
  url.searchParams.set('code_challenge', params.codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('state', params.state);
  if (params.scope) {
    url.searchParams.set('scope', params.scope);
  }
  if (params.extraParams) {
    for (const [key, value] of Object.entries(params.extraParams)) {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}
