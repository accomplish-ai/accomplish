import crypto from 'crypto';
import type {
  OAuthTokens,
  OAuthMetadata,
  OAuthClientRegistration,
} from '../common/types/connector.js';

const OAUTH_FETCH_TIMEOUT_MS = 30_000;

export interface OAuthProtectedResourceMetadata {
  resource: string;
  authorizationServers?: string[];
  bearerMethodsSupported?: string[];
  scopesSupported?: string[];
  resourceName?: string;
  resourceDocumentation?: string;
}

function fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), OAUTH_FETCH_TIMEOUT_MS);
  return fetch(url, { ...options, signal: controller.signal }).finally(() =>
    clearTimeout(timeoutId),
  );
}

/**
 * Discover OAuth 2.0 authorization server metadata from an MCP server URL.
 * Fetches from {serverUrl}/.well-known/oauth-authorization-server
 */
export async function discoverOAuthMetadata(serverUrl: string): Promise<OAuthMetadata> {
  const url = new URL('/.well-known/oauth-authorization-server', serverUrl);
  const response = await fetchWithTimeout(url.toString(), {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to discover OAuth metadata from ${url.toString()}: ${response.status} ${response.statusText}`,
    );
  }

  const data = (await response.json()) as Record<string, unknown>;

  const authorizationEndpoint = data.authorization_endpoint as string | undefined;
  const tokenEndpoint = data.token_endpoint as string | undefined;

  if (!authorizationEndpoint || !tokenEndpoint) {
    throw new Error('Invalid OAuth metadata: missing authorization_endpoint or token_endpoint');
  }

  return {
    issuer: data.issuer as string | undefined,
    authorizationEndpoint,
    tokenEndpoint,
    registrationEndpoint: data.registration_endpoint as string | undefined,
    scopesSupported: data.scopes_supported as string[] | undefined,
  };
}

/**
 * Discover OAuth protected resource metadata from an MCP server's 401 challenge.
 * Fetches the URL advertised in the WWW-Authenticate `resource_metadata` parameter.
 */
export async function discoverOAuthProtectedResourceMetadata(
  serverUrl: string,
): Promise<OAuthProtectedResourceMetadata> {
  const response = await fetchWithTimeout(serverUrl, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });

  if (response.status !== 401) {
    throw new Error(
      `Expected ${serverUrl} to return 401 with OAuth metadata, got ${response.status} ${response.statusText}`,
    );
  }

  const authenticateHeader = response.headers.get('www-authenticate');
  if (!authenticateHeader) {
    throw new Error(
      `OAuth protected resource response from ${serverUrl} did not include WWW-Authenticate`,
    );
  }

  const metadataUrlMatch = authenticateHeader.match(/resource_metadata="([^"]+)"/i);
  const metadataUrl = metadataUrlMatch?.[1];
  if (!metadataUrl) {
    throw new Error(
      `OAuth protected resource response from ${serverUrl} did not advertise resource_metadata`,
    );
  }

  const metadataResponse = await fetchWithTimeout(metadataUrl, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });

  if (!metadataResponse.ok) {
    throw new Error(
      `Failed to discover protected resource metadata from ${metadataUrl}: ${metadataResponse.status} ${metadataResponse.statusText}`,
    );
  }

  const contentType = metadataResponse.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('application/json')) {
    throw new Error(
      `Protected resource metadata endpoint returned non-JSON response (Content-Type: ${contentType || 'none'})`,
    );
  }

  const data = (await metadataResponse.json()) as Record<string, unknown>;
  const resource = data.resource as string | undefined;
  if (!resource) {
    throw new Error('Invalid protected resource metadata: missing resource');
  }

  return {
    resource,
    authorizationServers: data.authorization_servers as string[] | undefined,
    bearerMethodsSupported: data.bearer_methods_supported as string[] | undefined,
    scopesSupported: data.scopes_supported as string[] | undefined,
    resourceName: data.resource_name as string | undefined,
    resourceDocumentation: data.resource_documentation as string | undefined,
  };
}

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
}): Promise<OAuthTokens> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: params.refreshToken,
    client_id: params.clientId,
  });

  if (params.clientSecret) {
    body.set('client_secret', params.clientSecret);
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
