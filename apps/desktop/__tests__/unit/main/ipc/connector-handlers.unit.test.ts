import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  class OAuthMetadataDiscoveryError extends Error {
    constructor(
      readonly metadataUrl: string,
      readonly status: number,
      readonly statusText: string,
    ) {
      super(`Failed to discover OAuth metadata from ${metadataUrl}: ${status} ${statusText}`);
      this.name = 'OAuthMetadataDiscoveryError';
    }
  }

  return {
    handlers: new Map<string, (...args: unknown[]) => unknown>(),
    shellOpenExternal: vi.fn(),
    daemonClient: { call: vi.fn() },
    discoverOAuthMetadata: vi.fn(),
    registerOAuthClient: vi.fn(),
    generatePkceChallenge: vi.fn(() => ({
      codeVerifier: 'verifier',
      codeChallenge: 'challenge',
    })),
    buildAuthorizationUrl: vi.fn(() => 'https://auth.example.com/authorize'),
    exchangeCodeForTokens: vi.fn(),
    OAuthMetadataDiscoveryError,
  };
});

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      mocks.handlers.set(channel, handler);
    }),
  },
  shell: {
    openExternal: mocks.shellOpenExternal,
  },
  BrowserWindow: {
    getFocusedWindow: vi.fn(() => null),
    getAllWindows: vi.fn(() => []),
  },
}));

vi.mock('@main/daemon-bootstrap', () => ({
  getDaemonClient: vi.fn(() => mocks.daemonClient),
}));

vi.mock('@accomplish_ai/agent-core/desktop-main', () => ({
  sanitizeString: (value: string) => value,
  discoverOAuthMetadata: mocks.discoverOAuthMetadata,
  registerOAuthClient: mocks.registerOAuthClient,
  generatePkceChallenge: mocks.generatePkceChallenge,
  buildAuthorizationUrl: mocks.buildAuthorizationUrl,
  exchangeCodeForTokens: mocks.exchangeCodeForTokens,
  OAuthMetadataDiscoveryError: mocks.OAuthMetadataDiscoveryError,
}));

const { registerConnectorHandlers } = await import('@main/ipc/handlers/connector-handlers');

function getHandler(channel: string): (...args: unknown[]) => Promise<unknown> {
  const handler = mocks.handlers.get(channel);
  if (!handler) {
    throw new Error(`No handler registered for channel: ${channel}`);
  }
  return handler as (...args: unknown[]) => Promise<unknown>;
}

describe('connector IPC handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.handlers.clear();
  });

  it('connects a custom MCP connector without OAuth when metadata discovery returns 404', async () => {
    const connector = {
      id: 'conn-local-1',
      name: 'Local MCP',
      url: 'http://localhost:3333/mcp',
      status: 'disconnected',
      isEnabled: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    mocks.daemonClient.call.mockImplementation(async (method: string) => {
      if (method === 'connectors.getById') {
        return connector;
      }
      return undefined;
    });
    mocks.discoverOAuthMetadata.mockRejectedValue(
      new mocks.OAuthMetadataDiscoveryError(
        'http://localhost:3333/.well-known/oauth-authorization-server',
        404,
        'Not Found',
      ),
    );

    registerConnectorHandlers();
    const result = await getHandler('connectors:start-oauth')({}, connector.id);

    expect(result).toEqual({
      connector: expect.objectContaining({
        id: connector.id,
        status: 'connected',
        lastConnectedAt: expect.any(String),
      }),
    });
    expect(mocks.daemonClient.call).toHaveBeenCalledWith('connectors.deleteTokens', {
      connectorId: connector.id,
    });
    expect(mocks.daemonClient.call).toHaveBeenCalledWith('connectors.upsert', {
      connector: expect.objectContaining({
        id: connector.id,
        status: 'connected',
      }),
    });
    expect(mocks.shellOpenExternal).not.toHaveBeenCalled();
    expect(mocks.registerOAuthClient).not.toHaveBeenCalled();
  });
});
