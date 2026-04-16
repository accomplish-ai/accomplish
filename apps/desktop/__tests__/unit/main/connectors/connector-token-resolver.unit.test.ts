/**
 * Unit tests for connector-token-resolver.ts
 *
 * Validates:
 * - connectBuiltInConnector dispatches the correct OAuth strategy per oauthKind
 * - Unknown provider returns { error: 'not-configured' }
 * - desktop-github: gh not found → { error: 'gh-not-found' }
 * - desktop-github: gh auth token returns token without login
 * - desktop-github: no existing token → falls through to gh auth login
 * - desktop-google: always returns ok (delegates to google-accounts)
 * - mcp-dcr / mcp-fixed-client: no-server-url when serverUrl absent
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mock factories — vi.mock() is hoisted before imports, so we must
// declare shared mock function references here using vi.hoisted().
// ---------------------------------------------------------------------------

const { mockExecFileAsync, mockShellOpenExternal } = vi.hoisted(() => ({
  mockExecFileAsync: vi.fn<
    [string, string[], object?],
    Promise<{ stdout: string; stderr: string }>
  >(),
  mockShellOpenExternal: vi.fn<[string], Promise<void>>().mockResolvedValue(undefined),
}));

// child_process: the module exports `execFile` which is immediately promisify()'d.
// By making execFile already promise-returning and making promisify an identity fn,
// execFileAsync in the module-under-test becomes === our mockExecFileAsync.
vi.mock('child_process', () => ({ execFile: mockExecFileAsync }));
vi.mock('util', () => ({ promisify: (fn: unknown) => fn }));
vi.mock('electron', () => ({ shell: { openExternal: mockShellOpenExternal } }));
vi.mock('crypto', () => ({ default: { randomUUID: () => 'test-csrf-state' } }));

const {
  mockDiscoverOAuthMetadata,
  mockRegisterOAuthClient,
  mockGeneratePkceChallenge,
  mockBuildAuthorizationUrl,
  mockExchangeCodeForTokens,
} = vi.hoisted(() => ({
  mockDiscoverOAuthMetadata: vi.fn(),
  mockRegisterOAuthClient: vi.fn(),
  mockGeneratePkceChallenge: vi.fn(),
  mockBuildAuthorizationUrl: vi.fn(),
  mockExchangeCodeForTokens: vi.fn(),
}));

vi.mock('@accomplish_ai/agent-core', () => ({
  discoverOAuthMetadata: mockDiscoverOAuthMetadata,
  registerOAuthClient: mockRegisterOAuthClient,
  generatePkceChallenge: mockGeneratePkceChallenge,
  buildAuthorizationUrl: mockBuildAuthorizationUrl,
  exchangeCodeForTokens: mockExchangeCodeForTokens,
  refreshAccessToken: vi.fn(),
}));

const { mockGetConnectorDefinition } = vi.hoisted(() => ({
  mockGetConnectorDefinition: vi.fn(),
}));

vi.mock('@accomplish_ai/agent-core/common', () => ({
  getConnectorDefinition: mockGetConnectorDefinition,
  getConnectorDefinitions: vi.fn().mockReturnValue([]),
}));

const { mockWaitForCallback, mockCreateOAuthCallbackServer } = vi.hoisted(() => {
  const mockWaitForCallback = vi.fn();
  const mockCreateOAuthCallbackServer = vi.fn().mockResolvedValue({
    waitForCallback: mockWaitForCallback,
    shutdown: vi.fn(),
  });
  return { mockWaitForCallback, mockCreateOAuthCallbackServer };
});

vi.mock('@main/oauth-callback-server', () => ({
  createOAuthCallbackServer: mockCreateOAuthCallbackServer,
}));

const { mockStore } = vi.hoisted(() => ({
  mockStore: {
    getServerUrl: vi.fn(),
    getAccessToken: vi.fn(),
    getRefreshToken: vi.fn(),
    getClientRegistration: vi.fn(),
    setTokens: vi.fn(),
    setClientRegistration: vi.fn(),
    setPendingAuth: vi.fn(),
    clearTokens: vi.fn(),
    callbackUrl: 'http://127.0.0.1:3120/callback',
  },
}));

vi.mock('@main/connectors/connector-auth-store', () => ({
  ConnectorAuthStore: class {},
}));

vi.mock('@main/connectors/connector-auth-registry', () => ({
  getConnectorAuthStore: vi.fn().mockReturnValue(mockStore),
}));

// ---------------------------------------------------------------------------
// Import SUT after mocks are registered
// ---------------------------------------------------------------------------

import { connectBuiltInConnector } from '@main/connectors/connector-token-resolver';

// ---------------------------------------------------------------------------
// Helper definitions
// ---------------------------------------------------------------------------

const jiraDef = {
  displayName: 'Jira',
  desktopOAuth: {
    kind: 'mcp-dcr' as const,
    discoveryError: 'Jira discovery failed',
    registrationError: 'Jira registration failed',
    tokenExchangeError: 'Jira token exchange failed',
    extraAuthParams: {},
    store: { callback: { host: '127.0.0.1', port: 3120, path: '/callback' } },
  },
};

const slackDef = {
  displayName: 'Slack',
  desktopOAuth: {
    kind: 'mcp-fixed-client' as const,
    clientId: 'slack-client-id',
    discoveryError: 'Slack discovery failed',
    tokenExchangeError: 'Slack token exchange failed',
    store: { callback: { host: '127.0.0.1', port: 3118, path: '/callback' } },
  },
};

const githubDef = { displayName: 'GitHub', desktopOAuth: { kind: 'desktop-github' as const } };
const googleDef = { displayName: 'Google', desktopOAuth: { kind: 'desktop-google' as const } };

const ghVersion = {
  stdout: 'gh version 2.67.0 (2025-01-13)\nhttps://github.com/cli/cli',
  stderr: '',
};
const emptyStdout = { stdout: '', stderr: '' };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('connectBuiltInConnector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStore.getServerUrl.mockReturnValue('https://mcp.example.com/mcp');
    mockStore.getClientRegistration.mockReturnValue(null);
    mockStore.getAccessToken.mockReturnValue(null);
    mockStore.getRefreshToken.mockReturnValue(null);
  });

  // -------------------------------------------------------------------------
  // Unknown provider
  // -------------------------------------------------------------------------

  it('returns not-configured for an unknown provider', async () => {
    mockGetConnectorDefinition.mockReturnValue(undefined);
    const result = await connectBuiltInConnector('no-such-provider' as never);
    expect(result).toEqual({
      ok: false,
      error: 'not-configured',
      message: expect.stringContaining('no-such-provider'),
    });
  });

  // -------------------------------------------------------------------------
  // desktop-google
  // -------------------------------------------------------------------------

  describe('desktop-google strategy', () => {
    it('returns ok with sentinel accessToken', async () => {
      mockGetConnectorDefinition.mockReturnValue(googleDef);
      const result = await connectBuiltInConnector('google' as never);
      expect(result).toEqual({ ok: true, accessToken: 'google-managed' });
    });
  });

  // -------------------------------------------------------------------------
  // desktop-github
  // -------------------------------------------------------------------------

  describe('desktop-github strategy', () => {
    beforeEach(() => {
      mockGetConnectorDefinition.mockReturnValue(githubDef);
    });

    it('returns gh-not-found when gh binary is absent from PATH', async () => {
      // Both --version calls fail (only 'gh' in candidates list)
      mockExecFileAsync.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));

      const result = await connectBuiltInConnector('github' as never);
      expect(result).toEqual({
        ok: false,
        error: 'gh-not-found',
        message: expect.stringContaining('https://cli.github.com'),
      });
    });

    it('returns ok without login when gh auth token yields a token', async () => {
      mockExecFileAsync
        .mockResolvedValueOnce(ghVersion) // gh --version
        .mockResolvedValueOnce({ stdout: 'gho_existingToken\n', stderr: '' }); // gh auth token

      const result = await connectBuiltInConnector('github' as never);
      expect(result).toEqual({ ok: true, accessToken: 'gho_existingToken' });
      expect(mockStore.setTokens).toHaveBeenCalledWith(
        { accessToken: 'gho_existingToken', tokenType: 'bearer' },
        expect.any(Number),
      );
    });

    it('falls through to gh auth login when no existing token', async () => {
      mockExecFileAsync
        .mockResolvedValueOnce(ghVersion) // gh --version
        .mockResolvedValueOnce(emptyStdout) // gh auth token → empty
        .mockResolvedValueOnce(emptyStdout) // gh auth login
        .mockResolvedValueOnce({ stdout: 'gho_freshToken\n', stderr: '' }); // gh auth token after login

      const result = await connectBuiltInConnector('github' as never);
      expect(result).toEqual({ ok: true, accessToken: 'gho_freshToken' });
      // Verify login was attempted
      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'gh',
        ['auth', 'login', '--git-protocol', 'https', '--web'],
        expect.any(Object),
      );
    });

    it('returns oauth-failed when login succeeds but token is still empty', async () => {
      mockExecFileAsync
        .mockResolvedValueOnce(ghVersion) // gh --version
        .mockResolvedValueOnce(emptyStdout) // gh auth token → empty
        .mockResolvedValueOnce(emptyStdout) // gh auth login
        .mockResolvedValueOnce(emptyStdout); // gh auth token → still empty

      const result = await connectBuiltInConnector('github' as never);
      expect(result).toEqual({
        ok: false,
        error: 'oauth-failed',
        message: expect.stringContaining('no token was retrieved'),
      });
    });

    it('returns oauth-failed when gh auth login itself throws', async () => {
      mockExecFileAsync
        .mockResolvedValueOnce(ghVersion) // gh --version
        .mockResolvedValueOnce(emptyStdout) // gh auth token → empty
        .mockRejectedValueOnce(new Error('login cancelled')); // gh auth login fails

      const result = await connectBuiltInConnector('github' as never);
      expect(result).toEqual({
        ok: false,
        error: 'oauth-failed',
        message: expect.stringContaining('login cancelled'),
      });
    });
  });

  // -------------------------------------------------------------------------
  // mcp-dcr strategy
  // -------------------------------------------------------------------------

  describe('mcp-dcr strategy', () => {
    beforeEach(() => {
      mockGetConnectorDefinition.mockReturnValue(jiraDef);
    });

    it('returns no-server-url when serverUrl is absent', async () => {
      mockStore.getServerUrl.mockReturnValue(undefined);
      const result = await connectBuiltInConnector('jira' as never);
      expect(result).toEqual({ ok: false, error: 'no-server-url', message: expect.any(String) });
    });

    it('returns oauth-failed when OAuth metadata discovery throws', async () => {
      mockDiscoverOAuthMetadata.mockRejectedValue(new Error('connection refused'));
      const result = await connectBuiltInConnector('jira' as never);
      expect(result).toEqual({
        ok: false,
        error: 'oauth-failed',
        message: jiraDef.desktopOAuth.discoveryError,
      });
    });

    it('completes DCR flow and stores tokens with lastOAuthValidatedAt', async () => {
      const metadata = {
        authorizationEndpoint: 'https://jira.example.com/oauth/authorize',
        tokenEndpoint: 'https://jira.example.com/oauth/token',
        scopesSupported: ['read', 'write'],
      };
      mockDiscoverOAuthMetadata.mockResolvedValue(metadata);
      mockRegisterOAuthClient.mockResolvedValue({ clientId: 'c-id', clientSecret: 's-secret' });
      mockGeneratePkceChallenge.mockReturnValue({
        codeVerifier: 'verifier',
        codeChallenge: 'challenge',
      });
      mockBuildAuthorizationUrl.mockReturnValue('https://jira.example.com/oauth/authorize?foo=bar');
      mockWaitForCallback.mockResolvedValue({ code: 'authcode123', state: 'test-csrf-state' });
      mockExchangeCodeForTokens.mockResolvedValue({
        accessToken: 'jira_tok',
        tokenType: 'bearer',
        expiresAt: Date.now() + 3_600_000,
      });

      const before = Date.now();
      const result = await connectBuiltInConnector('jira' as never);
      const after = Date.now();

      expect(result).toEqual({ ok: true, accessToken: 'jira_tok' });
      expect(mockStore.setTokens).toHaveBeenCalledWith(
        expect.objectContaining({ accessToken: 'jira_tok' }),
        expect.any(Number),
      );
      const ts = (mockStore.setTokens.mock.calls[0] as [unknown, number])[1];
      expect(ts).toBeGreaterThanOrEqual(before);
      expect(ts).toBeLessThanOrEqual(after);
    });

    it('reuses existing clientRegistration instead of re-registering', async () => {
      const existingReg = { clientId: 'existing-id', clientSecret: 'existing-secret' };
      mockStore.getClientRegistration.mockReturnValue(existingReg);

      const metadata = {
        authorizationEndpoint: 'https://jira.example.com/oauth/authorize',
        tokenEndpoint: 'https://jira.example.com/oauth/token',
        scopesSupported: ['read'],
      };
      mockDiscoverOAuthMetadata.mockResolvedValue(metadata);
      mockGeneratePkceChallenge.mockReturnValue({ codeVerifier: 'v', codeChallenge: 'c' });
      mockBuildAuthorizationUrl.mockReturnValue('https://jira.example.com/oauth/authorize?x=1');
      mockWaitForCallback.mockResolvedValue({ code: 'code', state: 'test-csrf-state' });
      mockExchangeCodeForTokens.mockResolvedValue({ accessToken: 'tok', tokenType: 'bearer' });

      await connectBuiltInConnector('jira' as never);
      expect(mockRegisterOAuthClient).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // mcp-fixed-client strategy
  // -------------------------------------------------------------------------

  describe('mcp-fixed-client strategy', () => {
    beforeEach(() => {
      mockGetConnectorDefinition.mockReturnValue(slackDef);
    });

    it('returns no-server-url when serverUrl is absent', async () => {
      mockStore.getServerUrl.mockReturnValue(undefined);
      const result = await connectBuiltInConnector('slack' as never);
      expect(result).toEqual({ ok: false, error: 'no-server-url' });
    });

    it('uses pre-registered clientId (no DCR call)', async () => {
      const metadata = {
        authorizationEndpoint: 'https://slack.com/oauth/authorize',
        tokenEndpoint: 'https://slack.com/oauth/token',
        scopesSupported: ['channels:read'],
      };
      mockDiscoverOAuthMetadata.mockResolvedValue(metadata);
      mockGeneratePkceChallenge.mockReturnValue({ codeVerifier: 'v', codeChallenge: 'c' });
      mockBuildAuthorizationUrl.mockReturnValue('https://slack.com/oauth/authorize?bar=1');
      mockWaitForCallback.mockResolvedValue({ code: 'slack-code', state: 'test-csrf-state' });
      mockExchangeCodeForTokens.mockResolvedValue({
        accessToken: 'slack_token',
        tokenType: 'bearer',
      });

      const result = await connectBuiltInConnector('slack' as never);
      expect(result).toEqual({ ok: true, accessToken: 'slack_token' });
      expect(mockRegisterOAuthClient).not.toHaveBeenCalled();
      expect(mockBuildAuthorizationUrl).toHaveBeenCalledWith(
        expect.objectContaining({ clientId: 'slack-client-id' }),
      );
    });
  });
});
