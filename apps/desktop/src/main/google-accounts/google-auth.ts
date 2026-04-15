/**
 * Google OAuth2 PKCE flow for connecting a Google account.
 *
 * Requires GOOGLE_CLIENT_ID env var — set this in your .env or CI/CD secrets.
 * Without it, the OAuth redirect will fail at the Google consent screen.
 */
import crypto from 'node:crypto';
import http from 'node:http';
import { shell } from 'electron';
import {
  GOOGLE_AUTH_ENDPOINT,
  GOOGLE_TOKEN_ENDPOINT,
  GOOGLE_USERINFO_EP,
  GOOGLE_OAUTH_SCOPES,
  OAUTH_CALLBACK_PORT_PRIMARY,
  OAUTH_CALLBACK_PORT_FALLBACK,
} from './constants.js';
import type { GoogleAccountToken } from '@accomplish_ai/agent-core/common';
import { getLogCollector } from '../logging/index.js';

export interface GoogleAuthResult {
  googleAccountId: string;
  email: string;
  displayName: string;
  pictureUrl: string | null;
  token: GoogleAccountToken;
}

interface PendingFlow {
  resolve: (code: string) => void;
  reject: (err: Error) => void;
  codeVerifier: string;
  server: http.Server;
}

const OAUTH_FLOW_TTL_MS = 10 * 60 * 1000;
const pendingFlows = new Map<string, PendingFlow & { createdAt: number }>();

function b64url(buf: Buffer): string {
  return buf.toString('base64url');
}

function startCallbackServer(port: number, _state: string): Promise<http.Server> {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.listen(port, '127.0.0.1', () => resolve(server));
    server.on('error', reject);
  });
}

export async function startGoogleOAuth(label: string): Promise<{
  state: string;
  authUrl: string;
  waitForCallback: () => Promise<GoogleAuthResult>;
}> {
  const clientId = process.env.GOOGLE_CLIENT_ID ?? '';
  if (!clientId) {
    getLogCollector().log('WARN', 'main', 'GOOGLE_CLIENT_ID is not set — OAuth will fail');
  }

  const codeVerifier = b64url(crypto.randomBytes(32));
  const codeChallenge = b64url(crypto.createHash('sha256').update(codeVerifier).digest());
  const state = crypto.randomUUID();

  let port = OAUTH_CALLBACK_PORT_PRIMARY;
  let server: http.Server;
  try {
    server = await startCallbackServer(OAUTH_CALLBACK_PORT_PRIMARY, state);
  } catch {
    server = await startCallbackServer(OAUTH_CALLBACK_PORT_FALLBACK, state);
    port = OAUTH_CALLBACK_PORT_FALLBACK;
  }

  const redirectUri = `http://127.0.0.1:${port}/callback`;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: GOOGLE_OAUTH_SCOPES.join(' '),
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    access_type: 'offline',
    prompt: 'consent',
  });

  const authUrl = `${GOOGLE_AUTH_ENDPOINT}?${params.toString()}`;

  const waitForCallback = (): Promise<GoogleAuthResult> =>
    new Promise<GoogleAuthResult>((resolve, reject) => {
      const timeout = setTimeout(() => {
        pendingFlows.delete(state);
        server.close();
        reject(new Error('Google OAuth timed out'));
      }, OAUTH_FLOW_TTL_MS);

      server.on('request', async (req, res) => {
        try {
          const url = new URL(req.url ?? '', `http://127.0.0.1:${port}`);
          if (url.pathname !== '/callback') {
            res.writeHead(404).end();
            return;
          }

          const errorParam = url.searchParams.get('error');
          if (errorParam) {
            res
              .writeHead(400, { 'Content-Type': 'text/html' })
              .end(
                '<html><body><h2>Authentication cancelled. You can close this tab.</h2></body></html>',
              );
            clearTimeout(timeout);
            server.close();
            pendingFlows.delete(state);
            reject(new Error(`OAuth error: ${errorParam}`));
            return;
          }

          const code = url.searchParams.get('code');
          const returnedState = url.searchParams.get('state');

          if (!code || returnedState !== state) {
            res.writeHead(400).end('Bad request');
            return;
          }

          res
            .writeHead(200, { 'Content-Type': 'text/html' })
            .end('<html><body><h2>Connected! You can close this tab.</h2></body></html>');
          clearTimeout(timeout);
          server.close();
          pendingFlows.delete(state);

          const result = await exchangeCodeForResult(
            code,
            codeVerifier,
            redirectUri,
            clientId,
            label,
          );
          getLogCollector().log('INFO', 'main', 'Google account connected', {
            googleAccountId: result.googleAccountId,
          });
          resolve(result);
        } catch (err) {
          clearTimeout(timeout);
          server.close();
          pendingFlows.delete(state);
          getLogCollector().log('ERROR', 'main', 'Google OAuth callback error', {
            error: String(err),
          });
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      });

      pendingFlows.set(state, {
        resolve: () => {},
        reject,
        codeVerifier,
        server,
        createdAt: Date.now(),
      });
    });

  try {
    await shell.openExternal(authUrl);
  } catch (err) {
    server.close();
    throw err;
  }

  return { state, authUrl, waitForCallback };
}

export function cancelGoogleOAuth(state: string): void {
  const flow = pendingFlows.get(state);
  if (!flow) {
    return;
  }
  pendingFlows.delete(state);
  flow.server.close();
  flow.reject(new Error('OAuth cancelled by user'));
}

async function exchangeCodeForResult(
  code: string,
  codeVerifier: string,
  redirectUri: string,
  clientId: string,
  _label: string,
): Promise<GoogleAuthResult> {
  const tokenRes = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
      grant_type: 'authorization_code',
    }).toString(),
  });

  if (!tokenRes.ok) {
    const body = await tokenRes.text();
    throw new Error(`Token exchange failed (${tokenRes.status}): ${body}`);
  }

  const tokenData = (await tokenRes.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope: string;
  };

  const token: GoogleAccountToken = {
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token ?? '',
    expiresAt: Date.now() + tokenData.expires_in * 1000,
    scopes: tokenData.scope.split(' '),
  };

  const infoRes = await fetch(GOOGLE_USERINFO_EP, {
    headers: { Authorization: `Bearer ${token.accessToken}` },
  });

  if (!infoRes.ok) {
    throw new Error(`Userinfo fetch failed (${infoRes.status})`);
  }

  const info = (await infoRes.json()) as {
    sub: string;
    email: string;
    name: string;
    picture?: string;
  };

  return {
    googleAccountId: info.sub,
    email: info.email,
    displayName: info.name,
    pictureUrl: info.picture ?? null,
    token,
  };
}
