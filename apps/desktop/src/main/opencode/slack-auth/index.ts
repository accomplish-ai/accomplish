import { randomUUID } from 'node:crypto';
import { shell } from 'electron';
import {
  discoverOAuthMetadata,
  discoverOAuthProtectedResourceMetadata,
  generatePkceChallenge,
  buildAuthorizationUrl,
  exchangeCodeForTokens,
  clearSlackMcpAuth,
  getSlackMcpCallbackUrl,
  setSlackMcpPendingAuth,
  setSlackMcpTokens,
  OPENCODE_SLACK_MCP_CLIENT_ID,
  OPENCODE_SLACK_MCP_SERVER_URL,
  OPENCODE_SLACK_MCP_CALLBACK_HOST,
  OPENCODE_SLACK_MCP_CALLBACK_PORT,
  OPENCODE_SLACK_MCP_CALLBACK_PATH,
} from '@accomplish_ai/agent-core/desktop-main';
import { createOAuthCallbackServer, type OAuthCallbackServer } from '../../oauth-callback-server';
import { AuthLoginError } from '../auth-login-error';

export class SlackMcpOAuthFlow {
  private activeCallbackServer: OAuthCallbackServer | null = null;
  private isDisposed = false;

  isInProgress(): boolean {
    return this.activeCallbackServer !== null && !this.isDisposed;
  }

  async start(): Promise<void> {
    if (this.isInProgress()) {
      throw new AuthLoginError('A Slack MCP OAuth flow is already running.');
    }

    let callbackServer: OAuthCallbackServer | null = null;

    try {
      // Phase 4b of the OpenCode SDK cutover port removed the pre-emptive
      // `generateOpenCodeConfig()` call here. Under the SDK architecture the
      // daemon owns task-runtime config generation and writes it lazily when
      // a task starts; pre-staging an `opencode.json` from the desktop main
      // process is no longer required for the Slack OAuth handshake itself.
      const metadata = await discoverOAuthMetadata(OPENCODE_SLACK_MCP_SERVER_URL);
      const resourceMetadata = await discoverOAuthProtectedResourceMetadata(
        OPENCODE_SLACK_MCP_SERVER_URL,
      );
      const scopeList = resourceMetadata.scopesSupported ?? metadata.scopesSupported;
      if (!scopeList || scopeList.length === 0) {
        throw new AuthLoginError('Slack MCP did not advertise any OAuth scopes.');
      }

      callbackServer = await this.startCallbackServer();
      const redirectUri = callbackServer.redirectUri;
      const pkce = generatePkceChallenge();
      const state = randomUUID();

      setSlackMcpPendingAuth({
        codeVerifier: pkce.codeVerifier,
        oauthState: state,
      });

      const resource = new URL('/', resourceMetadata.resource).toString();
      const authorizationUrl = buildAuthorizationUrl({
        authorizationEndpoint: metadata.authorizationEndpoint,
        clientId: OPENCODE_SLACK_MCP_CLIENT_ID,
        redirectUri,
        codeChallenge: pkce.codeChallenge,
        state,
        scope: scopeList.join(' '),
        extraParams: {
          resource,
        },
      });

      await shell.openExternal(authorizationUrl);

      const callback = await callbackServer.waitForCallback();
      if (callback.state !== state) {
        throw new AuthLoginError(
          'Slack authentication failed because the OAuth state did not match.',
        );
      }

      const tokens = await exchangeCodeForTokens({
        tokenEndpoint: metadata.tokenEndpoint,
        code: callback.code,
        codeVerifier: pkce.codeVerifier,
        clientId: OPENCODE_SLACK_MCP_CLIENT_ID,
        redirectUri,
      });

      setSlackMcpTokens(tokens);
    } catch (error) {
      clearSlackMcpAuth();
      throw toSlackAuthError(error);
    } finally {
      this.activeCallbackServer = null;
      callbackServer?.shutdown();
    }
  }

  async cancel(): Promise<void> {
    if (!this.activeCallbackServer) {
      return;
    }

    const callbackServer = this.activeCallbackServer;
    this.activeCallbackServer = null;
    callbackServer.shutdown();
    clearSlackMcpAuth();
  }

  dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;

    if (this.activeCallbackServer) {
      this.activeCallbackServer.shutdown();
      this.activeCallbackServer = null;
      clearSlackMcpAuth();
    }
  }

  private async startCallbackServer(): Promise<OAuthCallbackServer> {
    try {
      const callbackServer = await createOAuthCallbackServer({
        host: OPENCODE_SLACK_MCP_CALLBACK_HOST,
        port: OPENCODE_SLACK_MCP_CALLBACK_PORT,
        callbackPath: OPENCODE_SLACK_MCP_CALLBACK_PATH,
        timeoutMs: 5 * 60_000,
      });

      if (callbackServer.redirectUri !== getSlackMcpCallbackUrl()) {
        callbackServer.shutdown();
        throw new AuthLoginError(
          `Slack callback server started with unexpected redirect URI: ${callbackServer.redirectUri}`,
        );
      }

      this.activeCallbackServer = callbackServer;
      return callbackServer;
    } catch (error) {
      throw toSlackAuthError(error);
    }
  }
}

export const slackMcpOAuthFlow = new SlackMcpOAuthFlow();

export async function loginSlackMcp(): Promise<void> {
  await slackMcpOAuthFlow.start();
}

export async function logoutSlackMcp(): Promise<void> {
  clearSlackMcpAuth();
}

function toSlackAuthError(error: unknown): AuthLoginError {
  if (error instanceof AuthLoginError) {
    return error;
  }

  if (error instanceof Error && (error as NodeJS.ErrnoException).code === 'EADDRINUSE') {
    return new AuthLoginError(
      `Slack authentication could not start because ${getSlackMcpCallbackUrl()} is already in use.`,
      { cause: error },
    );
  }

  if (error instanceof Error) {
    return new AuthLoginError(`Slack authentication failed: ${error.message}`, { cause: error });
  }

  return new AuthLoginError(`Slack authentication failed: ${String(error)}`);
}
