import crypto from 'crypto';
import { shell } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import {
  sanitizeString,
  discoverOAuthMetadata,
  registerOAuthClient,
  generatePkceChallenge,
  buildAuthorizationUrl,
  exchangeCodeForTokens,
} from '@accomplish_ai/agent-core/desktop-main';
import type {
  McpConnector,
  OAuthMetadata,
  OAuthClientRegistration,
} from '@accomplish_ai/agent-core/desktop-main';
import { handle } from './utils';
import { getDaemonClient } from '../../daemon-bootstrap';

// Milestone 3 sub-chunk 3e: user-added MCP connector CRUD + OAuth lifecycle
// now go through the daemon's `connectors.*` RPC surface. The OAuth loopback
// itself stays in main (the daemon has no access to `shell.openExternal`),
// but every storage-touching step — connector row, tokens, status — is an
// RPC call.

// In-memory store for pending OAuth flows (keyed by state parameter).
// Stays in main because it's transient (lives only between start-oauth
// and complete-oauth) and the flow pairs the callback state with locally
// generated PKCE values — nothing persistent.
const OAUTH_FLOW_TTL_MS = 10 * 60 * 1000; // 10 minutes

const pendingOAuthFlows = new Map<
  string,
  {
    connectorId: string;
    codeVerifier: string;
    metadata: OAuthMetadata;
    clientRegistration: OAuthClientRegistration;
    createdAt: number;
  }
>();

function cleanupExpiredOAuthFlows(): void {
  const now = Date.now();
  for (const [state, flow] of pendingOAuthFlows) {
    if (now - flow.createdAt > OAUTH_FLOW_TTL_MS) {
      pendingOAuthFlows.delete(state);
    }
  }
}

export function registerConnectorHandlers(): void {
  handle('connectors:list', async () => {
    return getDaemonClient().call('connectors.list');
  });

  handle('connectors:add', async (_event: IpcMainInvokeEvent, name: string, url: string) => {
    const sanitizedName = sanitizeString(name, 'connectorName', 128);
    const sanitizedUrl = sanitizeString(url, 'connectorUrl', 512);

    try {
      const parsed = new URL(sanitizedUrl);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error('Connector URL must use http:// or https://');
      }
    } catch (err) {
      throw new Error(
        err instanceof Error && err.message.includes('http')
          ? err.message
          : `Invalid connector URL: ${sanitizedUrl}`,
      );
    }

    const id = `mcp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const now = new Date().toISOString();

    const connector: McpConnector = {
      id,
      name: sanitizedName,
      url: sanitizedUrl,
      status: 'disconnected',
      isEnabled: true,
      createdAt: now,
      updatedAt: now,
    };

    await getDaemonClient().call('connectors.upsert', { connector });
    return connector;
  });

  handle('connectors:delete', async (_event: IpcMainInvokeEvent, id: string) => {
    const client = getDaemonClient();
    await client.call('connectors.deleteTokens', { connectorId: id });
    await client.call('connectors.delete', { id });
  });

  handle(
    'connectors:set-enabled',
    async (_event: IpcMainInvokeEvent, id: string, enabled: boolean) => {
      await getDaemonClient().call('connectors.setEnabled', { id, enabled });
    },
  );

  handle('connectors:start-oauth', async (_event: IpcMainInvokeEvent, connectorId: string) => {
    const client = getDaemonClient();
    const connector = await client.call('connectors.getById', { id: connectorId });
    if (!connector) {
      throw new Error('Connector not found');
    }

    const metadata = await discoverOAuthMetadata(connector.url);

    let clientReg = connector.clientRegistration;
    if (!clientReg) {
      clientReg = await registerOAuthClient(
        metadata,
        'accomplish://callback/mcp',
        'Accomplish Desktop',
      );
    }

    await client.call('connectors.upsert', {
      connector: {
        ...connector,
        oauthMetadata: metadata,
        clientRegistration: clientReg,
        status: 'connecting',
        updatedAt: new Date().toISOString(),
      },
    });

    const pkce = generatePkceChallenge();

    const state = crypto.randomUUID();
    cleanupExpiredOAuthFlows();
    pendingOAuthFlows.set(state, {
      connectorId,
      codeVerifier: pkce.codeVerifier,
      metadata,
      clientRegistration: clientReg,
      createdAt: Date.now(),
    });

    const authUrl = buildAuthorizationUrl({
      authorizationEndpoint: metadata.authorizationEndpoint,
      clientId: clientReg.clientId,
      redirectUri: 'accomplish://callback/mcp',
      codeChallenge: pkce.codeChallenge,
      state,
      scope: metadata.scopesSupported?.join(' '),
    });

    await shell.openExternal(authUrl);

    return { state, authUrl };
  });

  handle(
    'connectors:complete-oauth',
    async (_event: IpcMainInvokeEvent, state: string, code: string) => {
      cleanupExpiredOAuthFlows();
      const flow = pendingOAuthFlows.get(state);
      if (!flow) {
        throw new Error('No pending OAuth flow for this state');
      }
      pendingOAuthFlows.delete(state);

      const tokens = await exchangeCodeForTokens({
        tokenEndpoint: flow.metadata.tokenEndpoint,
        code,
        codeVerifier: flow.codeVerifier,
        clientId: flow.clientRegistration.clientId,
        clientSecret: flow.clientRegistration.clientSecret,
        redirectUri: 'accomplish://callback/mcp',
      });

      const client = getDaemonClient();
      await client.call('connectors.storeTokens', {
        connectorId: flow.connectorId,
        tokens,
      });

      const connector = await client.call('connectors.getById', { id: flow.connectorId });
      if (connector) {
        await client.call('connectors.upsert', {
          connector: {
            ...connector,
            status: 'connected',
            lastConnectedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        });
      }

      return client.call('connectors.getById', { id: flow.connectorId });
    },
  );

  handle('connectors:disconnect', async (_event: IpcMainInvokeEvent, connectorId: string) => {
    const client = getDaemonClient();
    await client.call('connectors.deleteTokens', { connectorId });
    await client.call('connectors.setStatus', { id: connectorId, status: 'disconnected' });
  });
}
