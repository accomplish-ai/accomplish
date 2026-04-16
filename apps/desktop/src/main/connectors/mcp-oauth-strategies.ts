/**
 * MCP OAuth Strategies
 *
 * Implements the mcp-dcr (Dynamic Client Registration + PKCE) and
 * mcp-fixed-client (pre-registered client + PKCE) OAuth flows.
 */

import crypto from 'crypto';
import { shell } from 'electron';
import {
  discoverOAuthMetadata,
  registerOAuthClient,
  generatePkceChallenge,
  buildAuthorizationUrl,
  exchangeCodeForTokens,
} from '@accomplish_ai/agent-core';
import type { OAuthProviderId, ConnectorDefinition } from '@accomplish_ai/agent-core/common';
import { getConnectorDefinition } from '@accomplish_ai/agent-core/common';
import { createOAuthCallbackServer } from '../oauth-callback-server';
import { getConnectorAuthStore } from './connector-auth-registry';
import type { ConnectorOAuthResult } from './connector-token-resolver';

export async function performMcpDcrFlow(
  providerId: OAuthProviderId,
  def: ConnectorDefinition,
): Promise<ConnectorOAuthResult> {
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
      host: oauth.store.callback.host,
      port: oauth.store.callback.port,
      callbackPath: oauth.store.callback.path,
    });

    let authSucceeded = false;
    try {
      store.setPendingAuth({ codeVerifier: pkce.codeVerifier, oauthState: state });
      await shell.openExternal(authUrl);

      const { code, state: returnedState } = await callbackServer.waitForCallback().catch(() => {
        throw new Error(oauth.tokenExchangeError);
      });

      if (returnedState !== state) {
        throw new Error(oauth.tokenExchangeError);
      }

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
      authSucceeded = true;
      return { ok: true, accessToken: tokens.accessToken };
    } finally {
      if (!authSucceeded) {
        store.clearTokens(); // clears codeVerifier/oauthState so pendingAuthorization resets
      }
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

export async function performMcpFixedClientFlow(
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
      host: oauth.store.callback.host,
      port: oauth.store.callback.port,
      callbackPath: oauth.store.callback.path,
    });

    let authSucceeded = false;
    try {
      store.setPendingAuth({ codeVerifier: pkce.codeVerifier, oauthState: state });
      await shell.openExternal(authUrl);

      const { code, state: returnedState } = await callbackServer.waitForCallback().catch(() => {
        throw new Error(oauth.tokenExchangeError);
      });

      if (returnedState !== state) {
        throw new Error(oauth.tokenExchangeError);
      }

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
      authSucceeded = true;
      return { ok: true, accessToken: tokens.accessToken };
    } finally {
      if (!authSucceeded) {
        store.clearTokens(); // clears codeVerifier/oauthState so pendingAuthorization resets
      }
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
