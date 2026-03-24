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
} from '@accomplish_ai/agent-core';
import type {
  McpConnector,
  OAuthMetadata,
  OAuthClientRegistration,
} from '@accomplish_ai/agent-core';
import { getStorage } from '../../store/storage';
import { handle } from './utils';

// In-memory store for pending OAuth flows (keyed by state parameter)
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
  const storage = getStorage();

  handle('connectors:list', async () => {
    return storage.getAllConnectors();
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

    storage.upsertConnector(connector);
    return connector;
  });

  handle('connectors:delete', async (_event: IpcMainInvokeEvent, id: string) => {
    storage.deleteConnectorTokens(id);
    storage.deleteConnector(id);
  });

  handle(
    'connectors:set-enabled',
    async (_event: IpcMainInvokeEvent, id: string, enabled: boolean) => {
      storage.setConnectorEnabled(id, enabled);
    },
  );

  handle('connectors:start-oauth', async (_event: IpcMainInvokeEvent, connectorId: string) => {
    const connector = storage.getConnectorById(connectorId);
    if (!connector) throw new Error('Connector not found');

    const metadata = await discoverOAuthMetadata(connector.url);

    let clientReg = connector.clientRegistration;
    if (!clientReg) {
      clientReg = await registerOAuthClient(
        metadata,
        'accomplish://callback/mcp',
        'Accomplish Desktop',
      );
    }

    storage.upsertConnector({
      ...connector,
      oauthMetadata: metadata,
      clientRegistration: clientReg,
      status: 'connecting',
      updatedAt: new Date().toISOString(),
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
      if (!flow) throw new Error('No pending OAuth flow for this state');
      pendingOAuthFlows.delete(state);

      const tokens = await exchangeCodeForTokens({
        tokenEndpoint: flow.metadata.tokenEndpoint,
        code,
        codeVerifier: flow.codeVerifier,
        clientId: flow.clientRegistration.clientId,
        clientSecret: flow.clientRegistration.clientSecret,
        redirectUri: 'accomplish://callback/mcp',
      });

      storage.storeConnectorTokens(flow.connectorId, tokens);

      const connector = storage.getConnectorById(flow.connectorId);
      if (connector) {
        storage.upsertConnector({
          ...connector,
          status: 'connected',
          lastConnectedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }

      return storage.getConnectorById(flow.connectorId);
    },
  );

  handle('connectors:disconnect', async (_event: IpcMainInvokeEvent, connectorId: string) => {
    storage.deleteConnectorTokens(connectorId);
    storage.setConnectorStatus(connectorId, 'disconnected');
  });
}
