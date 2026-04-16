/**
 * Connector Token Resolver
 *
 * Dispatches the correct OAuth strategy for each built-in connector (ADR-F002).
 * Uses a discriminated union switch with assertNever for compile-time exhaustiveness.
 *
 * Strategies:
 *   mcp-dcr          — Dynamic Client Registration + PKCE (Jira, Notion, monday.com, Lightdash, Datadog)
 *   mcp-fixed-client — Pre-registered client + PKCE (Slack)
 *   desktop-google   — Delegate to existing Google OAuth handler
 *   desktop-github   — gh CLI: `gh auth token`, fallback to `gh auth login`
 */

import crypto from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { shell } from 'electron';
import {
  discoverOAuthMetadata,
  registerOAuthClient,
  generatePkceChallenge,
  buildAuthorizationUrl,
  exchangeCodeForTokens,
  refreshAccessToken,
} from '@accomplish_ai/agent-core';
import type { OAuthProviderId, ConnectorDesktopOAuthKind } from '@accomplish_ai/agent-core/common';
import { getConnectorDefinition } from '@accomplish_ai/agent-core/common';
import { createOAuthCallbackServer } from '../oauth-callback-server';
import { getConnectorAuthStore, ConnectorAuthStore } from './connector-auth-store';
import { setDesktopConnectorConnected } from './desktop-connector-state';

const execFileAsync = promisify(execFile);

export type ConnectorOAuthResult =
  | { ok: true; accessToken: string }
  | {
      ok: false;
      error: 'gh-not-found' | 'oauth-failed' | 'no-server-url' | 'not-configured';
      message?: string;
    };

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Connect a built-in connector: runs the appropriate OAuth strategy.
 * Returns an access token on success.
 */
export async function connectBuiltInConnector(
  providerId: OAuthProviderId,
): Promise<ConnectorOAuthResult> {
  const def = getConnectorDefinition(providerId);
  if (!def) {
    return {
      ok: false,
      error: 'not-configured',
      message: `No connector definition for ${providerId}`,
    };
  }

  const kind = def.desktopOAuth.kind as ConnectorDesktopOAuthKind;

  switch (kind) {
    case 'mcp-dcr':
      return performMcpDcrFlow(providerId);
    case 'mcp-fixed-client':
      return performMcpFixedClientFlow(providerId);
    case 'desktop-google':
      return performDesktopGoogleFlow(providerId);
    case 'desktop-github':
      return performDesktopGithubFlow(providerId);
    default:
      return assertNever(kind);
  }
}

/**
 * Resolve a valid access token for an already-connected connector.
 * Auto-refreshes if expired. Returns undefined if not connected.
 */
export async function resolveMcpConnectorAccessToken(
  providerId: OAuthProviderId,
): Promise<string | undefined> {
  const store = getConnectorAuthStore(providerId);
  if (!store) {
    return undefined;
  }

  const accessToken = store.getAccessToken();
  if (!accessToken) {
    return undefined;
  }

  // Try silent token refresh if expired
  const entry = store['readEntry']?.();
  if (entry && entry.expiresAt && Date.now() >= entry.expiresAt - 5 * 60 * 1000) {
    const refreshed = await tryRefreshToken(store);
    if (refreshed) {
      return refreshed;
    }
    // Refresh failed — return the potentially stale token; let the call fail naturally
  }

  return accessToken;
}

// ---------------------------------------------------------------------------
// Strategy implementations
// ---------------------------------------------------------------------------

async function performMcpDcrFlow(providerId: OAuthProviderId): Promise<ConnectorOAuthResult> {
  const def = getConnectorDefinition(providerId)!;
  const oauth = def.desktopOAuth;
  if (oauth.kind !== 'mcp-dcr') {
    return { ok: false, error: 'not-configured' };
  }

  const store = getConnectorAuthStore(providerId);
  if (!store) {
    return { ok: false, error: 'not-configured' };
  }

  const serverUrl = store.getServerUrl();
  if (!serverUrl) {
    return { ok: false, error: 'no-server-url', message: 'Server URL not configured' };
  }

  try {
    const metadata = await discoverOAuthMetadata(serverUrl).catch(() => {
      throw new Error(oauth.discoveryError);
    });

    let clientReg = store.getClientRegistration();
    if (!clientReg) {
      clientReg = await registerOAuthClient(metadata, store.callbackUrl, def.displayName).catch(
        () => {
          throw new Error(oauth.registrationError);
        },
      );
      store.setClientRegistration(clientReg);
    }

    const pkce = generatePkceChallenge();
    const state = crypto.randomUUID();

    const extraParams = oauth.extraAuthParams ?? {};
    const authUrl = buildAuthorizationUrl({
      authorizationEndpoint: metadata.authorizationEndpoint,
      clientId: clientReg.clientId,
      redirectUri: store.callbackUrl,
      codeChallenge: pkce.codeChallenge,
      state,
      scope: metadata.scopesSupported?.join(' '),
      ...extraParams,
    });

    const callbackServer = await createOAuthCallbackServer({
      host: '127.0.0.1',
      port: oauth.store.callback.port,
      callbackPath: oauth.store.callback.path,
    });

    try {
      store.setPendingAuth({ codeVerifier: pkce.codeVerifier, oauthState: state });
      await shell.openExternal(authUrl);

      const { code } = await callbackServer.waitForCallback().catch(() => {
        throw new Error(oauth.tokenExchangeError);
      });

      const tokens = await exchangeCodeForTokens({
        tokenEndpoint: metadata.tokenEndpoint,
        code,
        codeVerifier: pkce.codeVerifier,
        clientId: clientReg.clientId,
        clientSecret: clientReg.clientSecret,
        redirectUri: store.callbackUrl,
      }).catch(() => {
        throw new Error(oauth.tokenExchangeError);
      });

      store.setTokens(tokens, Date.now());
      return { ok: true, accessToken: tokens.accessToken };
    } finally {
      callbackServer.shutdown();
    }
  } catch (err) {
    return {
      ok: false,
      error: 'oauth-failed',
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

async function performMcpFixedClientFlow(
  providerId: OAuthProviderId,
): Promise<ConnectorOAuthResult> {
  const def = getConnectorDefinition(providerId)!;
  const oauth = def.desktopOAuth;
  if (oauth.kind !== 'mcp-fixed-client') {
    return { ok: false, error: 'not-configured' };
  }

  const store = getConnectorAuthStore(providerId);
  if (!store) {
    return { ok: false, error: 'not-configured' };
  }

  const serverUrl = store.getServerUrl();
  if (!serverUrl) {
    return { ok: false, error: 'no-server-url' };
  }

  try {
    const metadata = await discoverOAuthMetadata(serverUrl).catch(() => {
      throw new Error(oauth.discoveryError);
    });

    const pkce = generatePkceChallenge();
    const state = crypto.randomUUID();
    const clientId = oauth.clientId;

    const authUrl = buildAuthorizationUrl({
      authorizationEndpoint: metadata.authorizationEndpoint,
      clientId,
      redirectUri: store.callbackUrl,
      codeChallenge: pkce.codeChallenge,
      state,
      scope: metadata.scopesSupported?.join(' '),
    });

    const callbackServer = await createOAuthCallbackServer({
      host: '127.0.0.1',
      port: oauth.store.callback.port,
      callbackPath: oauth.store.callback.path,
    });

    try {
      store.setPendingAuth({ codeVerifier: pkce.codeVerifier, oauthState: state });
      await shell.openExternal(authUrl);

      const { code } = await callbackServer.waitForCallback().catch(() => {
        throw new Error(oauth.tokenExchangeError);
      });

      const tokens = await exchangeCodeForTokens({
        tokenEndpoint: metadata.tokenEndpoint,
        code,
        codeVerifier: pkce.codeVerifier,
        clientId,
        redirectUri: store.callbackUrl,
      }).catch(() => {
        throw new Error(oauth.tokenExchangeError);
      });

      store.setTokens(tokens, Date.now());
      return { ok: true, accessToken: tokens.accessToken };
    } finally {
      callbackServer.shutdown();
    }
  } catch (err) {
    return {
      ok: false,
      error: 'oauth-failed',
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

// Delegate to the existing Google OAuth handler (managed by google-accounts module)
async function performDesktopGoogleFlow(
  _providerId: OAuthProviderId,
): Promise<ConnectorOAuthResult> {
  // Google OAuth is managed by the existing google-accounts infrastructure.
  // Return a no-op success — the Google connector card uses a separate auth flow.
  return { ok: true, accessToken: 'google-managed' };
}

async function performDesktopGithubFlow(
  providerId: OAuthProviderId,
): Promise<ConnectorOAuthResult> {
  // Strategy: read existing gh CLI token first (research.md Decision 3)
  const ghPath = await findGhBinary();
  if (!ghPath) {
    return {
      ok: false,
      error: 'gh-not-found',
      message: 'GitHub CLI (gh) not found on PATH. Install it from https://cli.github.com',
    };
  }

  const store = getConnectorAuthStore(providerId);

  // Try reading an existing token first
  try {
    const { stdout } = await execFileAsync(ghPath, ['auth', 'token'], { timeout: 10_000 });
    const token = stdout.trim();
    if (token) {
      // Store a synthetic token entry so auth status reads as connected
      store?.setTokens(
        {
          accessToken: token,
          tokenType: 'bearer',
        },
        Date.now(),
      );
      setDesktopConnectorConnected(providerId, true);
      return { ok: true, accessToken: token };
    }
  } catch {
    // Token not available — fall through to login
  }

  // No token — initiate login
  try {
    // Augment PATH so gh can find its helpers (git, etc.) on macOS where
    // Electron's process.env.PATH excludes Homebrew and shell-profile paths.
    const augmentedEnv = {
      ...process.env,
      PATH: [
        process.env.PATH ?? '',
        '/opt/homebrew/bin',
        '/usr/local/bin',
        '/usr/bin',
        '/bin',
      ].join(':'),
    };
    await execFileAsync(ghPath, ['auth', 'login', '--git-protocol', 'https', '--web'], {
      timeout: 120_000,
      env: augmentedEnv,
    });

    const { stdout } = await execFileAsync(ghPath, ['auth', 'token'], { timeout: 10_000 });
    const token = stdout.trim();
    if (token) {
      store?.setTokens(
        {
          accessToken: token,
          tokenType: 'bearer',
        },
        Date.now(),
      );
      setDesktopConnectorConnected(providerId, true);
      return { ok: true, accessToken: token };
    }

    setDesktopConnectorConnected(providerId, false);
    return {
      ok: false,
      error: 'oauth-failed',
      message: 'GitHub login succeeded but no token was retrieved',
    };
  } catch (err) {
    setDesktopConnectorConnected(providerId, false);
    return {
      ok: false,
      error: 'oauth-failed',
      message: err instanceof Error ? err.message : 'GitHub authentication failed',
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function findGhBinary(): Promise<string | null> {
  // Electron's main process PATH is minimal (no shell profile), so we must
  // probe common installation locations in addition to the raw PATH lookup.
  const candidates = [
    'gh',
    '/opt/homebrew/bin/gh', // Apple Silicon Homebrew (macOS)
    '/usr/local/bin/gh', // Intel Homebrew / manual install (macOS/Linux)
    '/usr/bin/gh', // system package manager (Linux)
    '/home/linuxbrew/.linuxbrew/bin/gh', // Linuxbrew
  ];
  for (const bin of candidates) {
    try {
      await execFileAsync(bin, ['--version'], { timeout: 5_000 });
      return bin;
    } catch {
      // not found at this path
    }
  }
  return null;
}

async function tryRefreshToken(store: ConnectorAuthStore): Promise<string | undefined> {
  const serverUrl = store.getServerUrl();
  const clientReg = store.getClientRegistration();
  const refreshToken = store.getRefreshToken();

  if (!serverUrl || !clientReg?.clientId || !refreshToken) {
    return undefined;
  }

  try {
    const metadata = await discoverOAuthMetadata(serverUrl);
    const refreshed = await refreshAccessToken({
      tokenEndpoint: metadata.tokenEndpoint,
      refreshToken,
      clientId: clientReg.clientId,
      clientSecret: clientReg.clientSecret,
    });
    store.setTokens(refreshed, Date.now());
    return refreshed.accessToken;
  } catch {
    return undefined;
  }
}

// TypeScript exhaustiveness guard
function assertNever(value: never): never {
  throw new Error(`Unhandled OAuth kind: ${String(value)}`);
}
