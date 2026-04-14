/**
 * Unit tests for OAuth Browser Flow
 *
 * Tests the auth-browser module which manages OAuth browser-based authentication
 * flows with process tracking and graceful cancellation support.
 *
 * NOTE: This is a UNIT test, not an integration test.
 * External dependencies (node-pty, electron) are mocked to test
 * the OAuth flow logic in isolation.
 *
 * @module __tests__/unit/main/opencode/auth-browser.unit.test
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { EventEmitter } from 'events';

// Mock electron module
const mockApp = {
  isPackaged: false,
  getPath: vi.fn((name: string) => `/mock/path/${name}`),
  getAppPath: vi.fn(() => '/mock/app/path'),
};

const mockShell = {
  openExternal: vi.fn(() => Promise.resolve()),
};

vi.mock('electron', () => ({
  app: mockApp,
  shell: mockShell,
}));

vi.mock('node:crypto', async () => {
  const actual = await vi.importActual<typeof import('node:crypto')>('node:crypto');
  return {
    ...actual,
    randomUUID: vi.fn(() => 'mock-state'),
  };
});

// Mock fs module
const mockFs = {
  existsSync: vi.fn(() => true),
};

vi.mock('fs', () => ({
  default: mockFs,
  existsSync: mockFs.existsSync,
}));

// Create a mock PTY process
class MockPty extends EventEmitter {
  pid = 12345;
  killed = false;

  write = vi.fn();
  kill = vi.fn(() => {
    this.killed = true;
  });

  // Helper to simulate data events
  simulateData(data: string) {
    const callbacks = this.listeners('data');
    callbacks.forEach((cb) => (cb as (data: string) => void)(data));
  }

  // Helper to simulate exit
  simulateExit(exitCode: number, signal?: number) {
    const callbacks = this.listeners('exit');
    callbacks.forEach((cb) =>
      (cb as (params: { exitCode: number; signal?: number }) => void)({ exitCode, signal }),
    );
  }

  // Override on to use onData/onExit interface
  onData(callback: (data: string) => void) {
    this.on('data', callback);
    return { dispose: () => this.off('data', callback) };
  }

  onExit(callback: (params: { exitCode: number; signal?: number }) => void) {
    this.on('exit', callback);
    return { dispose: () => this.off('exit', callback) };
  }
}

// Mock node-pty
let mockPtyInstance: MockPty;
const mockPtySpawn = vi.fn(() => mockPtyInstance);

vi.mock('node-pty', () => ({
  spawn: mockPtySpawn,
}));

const agentCoreMocks = {
  discoverOAuthMetadata: vi.fn(async () => ({
    authorizationEndpoint: 'https://slack.com/oauth/v2_user/authorize',
    tokenEndpoint: 'https://slack.com/api/oauth.v2.user.access',
    scopesSupported: ['chat:write'],
  })),
  discoverOAuthProtectedResourceMetadata: vi.fn(async () => ({
    resource: 'https://mcp.slack.com',
    scopesSupported: ['chat:write', 'users:read'],
  })),
  generatePkceChallenge: vi.fn(() => ({
    codeVerifier: 'mock-code-verifier',
    codeChallenge: 'mock-code-challenge',
  })),
  exchangeCodeForTokens: vi.fn(async () => ({
    accessToken: 'slack-access-token',
    refreshToken: 'slack-refresh-token',
    tokenType: 'Bearer',
    scope: 'chat:write users:read',
  })),
  clearSlackMcpAuth: vi.fn(),
  getSlackMcpCallbackUrl: vi.fn(() => 'http://localhost:3118/callback'),
  setSlackMcpPendingAuth: vi.fn(),
  setSlackMcpTokens: vi.fn(),
  OPENCODE_SLACK_MCP_CLIENT_ID: '1601185624273.8899143856786',
  OPENCODE_SLACK_MCP_SERVER_URL: 'https://mcp.slack.com/mcp',
  OPENCODE_SLACK_MCP_CALLBACK_HOST: 'localhost',
  OPENCODE_SLACK_MCP_CALLBACK_PORT: 3118,
  OPENCODE_SLACK_MCP_CALLBACK_PATH: '/callback',
};

vi.mock('@accomplish_ai/agent-core', async () => {
  const actual = await vi.importActual<typeof import('@accomplish_ai/agent-core')>(
    '@accomplish_ai/agent-core',
  );
  return {
    ...actual,
    ...agentCoreMocks,
  };
});

const mockCallbackServer = {
  redirectUri: 'http://localhost:3118/callback',
  waitForCallback: vi.fn(async () => ({
    code: 'slack-auth-code',
    state: 'mock-state',
    redirectUri: 'http://localhost:3118/callback',
  })),
  shutdown: vi.fn(),
};

vi.mock('@main/oauth-callback-server', () => ({
  createOAuthCallbackServer: vi.fn(async () => mockCallbackServer),
}));

// Mock electron-options (where getOpenCodeCliPath actually lives)
vi.mock('@main/opencode/electron-options', () => ({
  getOpenCodeCliPath: vi.fn(() => ({ command: '/mock/opencode', args: [] })),
}));

// Mock config-generator
vi.mock('@main/opencode/config-generator', () => ({
  generateOpenCodeConfig: vi.fn(() => Promise.resolve('/mock/config/path')),
}));

// Mock bundled-node — controls whether packaged-mode auth detects bundled Node
const mockGetBundledNodePaths = vi.fn();
vi.mock('@main/utils/bundled-node', () => ({
  getBundledNodePaths: mockGetBundledNodePaths,
}));

// Mock net for port checking
const mockServer = {
  once: vi.fn((event: string, callback: () => void) => {
    if (event === 'listening') {
      // Simulate port is free by default
      setTimeout(() => callback(), 0);
    }
    return mockServer;
  }),
  listen: vi.fn(),
  close: vi.fn(),
};

vi.mock('net', () => ({
  createServer: vi.fn(() => mockServer),
}));

describe('OAuthBrowserFlow', () => {
  let OAuthBrowserFlow: typeof import('@main/opencode/auth-browser').OAuthBrowserFlow;
  let oauthBrowserFlow: import('@main/opencode/auth-browser').OAuthBrowserFlow;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Create fresh mock PTY instance
    mockPtyInstance = new MockPty();
    mockPtySpawn.mockReturnValue(mockPtyInstance);
    mockCallbackServer.waitForCallback.mockResolvedValue({
      code: 'slack-auth-code',
      state: 'mock-state',
      redirectUri: 'http://localhost:3118/callback',
    });

    // Reset mock server
    mockServer.once.mockImplementation((event: string, callback: () => void) => {
      if (event === 'listening') {
        setTimeout(() => callback(), 0);
      }
      return mockServer;
    });

    // Reset module cache to get fresh instance
    vi.resetModules();

    const module = await import('@main/opencode/auth-browser');
    OAuthBrowserFlow = module.OAuthBrowserFlow;
    oauthBrowserFlow = new OAuthBrowserFlow();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('isInProgress()', () => {
    it('should return false when no flow is active', () => {
      expect(oauthBrowserFlow.isInProgress()).toBe(false);
    });

    it('should return true when flow is started', async () => {
      const startPromise = oauthBrowserFlow.start();

      // Wait for async setup (generateOpenCodeConfig)
      await Promise.resolve();
      await Promise.resolve();

      expect(oauthBrowserFlow.isInProgress()).toBe(true);

      // Cleanup: simulate exit
      mockPtyInstance.simulateExit(0);
      await startPromise;
    });

    it('should return false after flow completes', async () => {
      const startPromise = oauthBrowserFlow.start();

      // Wait for async setup
      await Promise.resolve();
      await Promise.resolve();

      mockPtyInstance.simulateExit(0);
      await startPromise;

      expect(oauthBrowserFlow.isInProgress()).toBe(false);
    });
  });

  describe('start()', () => {
    it('should spawn PTY with auth login command', async () => {
      const startPromise = oauthBrowserFlow.start();

      // Wait for async setup
      await Promise.resolve();
      await Promise.resolve();

      expect(mockPtySpawn).toHaveBeenCalled();
      const spawnCall = mockPtySpawn.mock.calls[0];
      expect(spawnCall[1]).toEqual(expect.arrayContaining([expect.stringContaining('auth')]));

      mockPtyInstance.simulateExit(0);
      await startPromise;
    });

    it('should auto-select OpenAI provider when prompt detected', async () => {
      const startPromise = oauthBrowserFlow.start();

      // Wait for async setup
      await Promise.resolve();
      await Promise.resolve();

      // Simulate provider selection prompt
      mockPtyInstance.simulateData('Select provider');

      expect(mockPtyInstance.write).toHaveBeenCalledWith('OpenAI');
      expect(mockPtyInstance.write).toHaveBeenCalledWith('\r');

      mockPtyInstance.simulateExit(0);
      await startPromise;
    });

    it('should auto-select login method when prompt detected', async () => {
      const startPromise = oauthBrowserFlow.start();

      // Wait for async setup
      await Promise.resolve();
      await Promise.resolve();

      // Simulate prompts in order
      mockPtyInstance.simulateData('Select provider');
      mockPtyInstance.simulateData('Login method');

      // Should have written Enter for login method
      const writeCalls = mockPtyInstance.write.mock.calls;
      const enterCalls = writeCalls.filter((call) => call[0] === '\r');
      expect(enterCalls.length).toBeGreaterThanOrEqual(2);

      mockPtyInstance.simulateExit(0);
      await startPromise;
    });

    it('should open OAuth URL in external browser', async () => {
      const startPromise = oauthBrowserFlow.start();

      // Wait for async setup
      await Promise.resolve();
      await Promise.resolve();

      mockPtyInstance.simulateData('Go to: https://auth.openai.com/oauth?code=123');

      expect(mockShell.openExternal).toHaveBeenCalledWith(
        expect.stringContaining('https://auth.openai.com'),
      );

      mockPtyInstance.simulateExit(0);
      const result = await startPromise;
      expect(result.openedUrl).toContain('https://auth.openai.com');
    });

    it('should not open URL twice', async () => {
      const startPromise = oauthBrowserFlow.start();

      // Wait for async setup
      await Promise.resolve();
      await Promise.resolve();

      mockPtyInstance.simulateData('Go to: https://auth.openai.com/oauth?code=123');
      mockPtyInstance.simulateData('Go to: https://auth.openai.com/oauth?code=456');

      expect(mockShell.openExternal).toHaveBeenCalledTimes(1);

      mockPtyInstance.simulateExit(0);
      await startPromise;
    });

    it('should reject on non-zero exit code', async () => {
      const startPromise = oauthBrowserFlow.start();

      // Wait for async setup
      await Promise.resolve();
      await Promise.resolve();

      mockPtyInstance.simulateExit(1);

      await expect(startPromise).rejects.toThrow('auth login failed');
    });

    it('should include exit code in error message', async () => {
      const startPromise = oauthBrowserFlow.start();

      // Wait for async setup
      await Promise.resolve();
      await Promise.resolve();

      mockPtyInstance.simulateExit(42);

      await expect(startPromise).rejects.toThrow('exit 42');
    });

    it('should cancel previous flow before starting new one', async () => {
      // Start first flow
      const firstPromise = oauthBrowserFlow.start();

      // Wait for async setup
      await Promise.resolve();
      await Promise.resolve();

      expect(oauthBrowserFlow.isInProgress()).toBe(true);

      const firstPtyInstance = mockPtyInstance;

      // Create new mock for second flow
      mockPtyInstance = new MockPty();
      mockPtySpawn.mockReturnValue(mockPtyInstance);

      // Start second flow - should cancel first
      // Don't await yet, just trigger it
      oauthBrowserFlow.start();

      // Wait a tick for cancel to be initiated
      await Promise.resolve();

      // First PTY should have received Ctrl+C (cancellation signal)
      expect(firstPtyInstance.write).toHaveBeenCalledWith('\x03');

      // Complete first flow so its promise resolves
      firstPtyInstance.simulateExit(1);
      await expect(firstPromise).rejects.toThrow();
    });
  });

  describe('cancel()', () => {
    it('should do nothing when no flow is active', async () => {
      await oauthBrowserFlow.cancel();
      expect(mockPtyInstance.write).not.toHaveBeenCalled();
    });

    it('should send Ctrl+C to PTY', async () => {
      oauthBrowserFlow.start();

      // Wait for async setup
      await Promise.resolve();
      await Promise.resolve();

      await oauthBrowserFlow.cancel();

      expect(mockPtyInstance.write).toHaveBeenCalledWith('\x03');
    });

    it('should send Y confirmation on Windows', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });

      oauthBrowserFlow.start();

      // Wait for async setup
      await Promise.resolve();
      await Promise.resolve();

      await oauthBrowserFlow.cancel();

      expect(mockPtyInstance.write).toHaveBeenCalledWith('Y\n');

      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    });

    it('should force kill if graceful exit times out', async () => {
      vi.useFakeTimers();

      const _startPromise = oauthBrowserFlow.start();

      // Wait for async setup (using fake timers)
      await vi.advanceTimersByTimeAsync(10);

      const cancelPromise = oauthBrowserFlow.cancel();

      // Advance past the graceful timeout (1000ms)
      await vi.advanceTimersByTimeAsync(1100);

      await cancelPromise;

      expect(mockPtyInstance.kill).toHaveBeenCalled();

      vi.useRealTimers();
    });

    it('should clear activePty after cancel', async () => {
      const startPromise = oauthBrowserFlow.start();

      // Wait for async setup
      await Promise.resolve();
      await Promise.resolve();

      expect(oauthBrowserFlow.isInProgress()).toBe(true);

      mockPtyInstance.simulateExit(0);
      await startPromise;

      expect(oauthBrowserFlow.isInProgress()).toBe(false);
    });
  });

  describe('dispose()', () => {
    it('should kill active PTY', async () => {
      oauthBrowserFlow.start();

      // Wait for async setup
      await Promise.resolve();
      await Promise.resolve();

      oauthBrowserFlow.dispose();

      expect(mockPtyInstance.kill).toHaveBeenCalled();
    });

    it('should be idempotent', async () => {
      oauthBrowserFlow.start();

      // Wait for async setup
      await Promise.resolve();
      await Promise.resolve();

      // First dispose kills the PTY
      oauthBrowserFlow.dispose();
      expect(mockPtyInstance.kill).toHaveBeenCalledTimes(1);

      // Subsequent disposes should not throw or kill again
      oauthBrowserFlow.dispose();
      oauthBrowserFlow.dispose();

      // Still only killed once
      expect(mockPtyInstance.kill).toHaveBeenCalledTimes(1);
    });

    it('should not throw when no active PTY', () => {
      expect(() => oauthBrowserFlow.dispose()).not.toThrow();
    });
  });

  describe('convenience exports', () => {
    it('should export loginOpenAiWithChatGpt function', async () => {
      const module = await import('@main/opencode/auth-browser');
      expect(typeof module.loginOpenAiWithChatGpt).toBe('function');
    });

    it('should export oauthBrowserFlow singleton', async () => {
      const module = await import('@main/opencode/auth-browser');
      expect(module.oauthBrowserFlow).toBeInstanceOf(module.OAuthBrowserFlow);
    });

    it('should export loginSlackMcp function', async () => {
      const module = await import('@main/opencode/auth-browser');
      expect(typeof module.loginSlackMcp).toBe('function');
    });
  });

  describe('error scenarios', () => {
    it('should handle PTY kill errors during cancel gracefully', async () => {
      oauthBrowserFlow.start();

      // Wait for async setup
      await Promise.resolve();
      await Promise.resolve();

      mockPtyInstance.kill.mockImplementationOnce(() => {
        throw new Error('Kill failed');
      });

      // Should not throw
      await expect(oauthBrowserFlow.cancel()).resolves.not.toThrow();
    });

    it('should handle PTY kill errors during dispose gracefully', async () => {
      oauthBrowserFlow.start();

      // Wait for async setup
      await Promise.resolve();
      await Promise.resolve();

      mockPtyInstance.kill.mockImplementationOnce(() => {
        throw new Error('Kill failed');
      });

      // Should not throw
      expect(() => oauthBrowserFlow.dispose()).not.toThrow();
    });

    it('should redact sensitive data in error messages', async () => {
      const startPromise = oauthBrowserFlow.start();

      // Wait for async setup
      await Promise.resolve();
      await Promise.resolve();

      // Simulate output with sensitive data
      mockPtyInstance.simulateData('Error: sk-ant-12345abcde is invalid');
      mockPtyInstance.simulateData('URL: https://secret.url.com/token');
      mockPtyInstance.simulateExit(1);

      let errorMessage = '';
      try {
        await startPromise;
      } catch (error) {
        errorMessage = (error as Error).message;
      }

      expect(errorMessage).not.toContain('sk-ant-12345abcde');
      expect(errorMessage).toContain('sk-[redacted]');
      expect(errorMessage).not.toContain('https://secret.url.com');
      expect(errorMessage).toContain('[url]');
    });
  });

  describe('Slack MCP OAuth', () => {
    it('opens Slack OAuth with the localhost:3118 callback URI', async () => {
      const module = await import('@main/opencode/auth-browser');

      await module.loginSlackMcp();

      expect(mockShell.openExternal).toHaveBeenCalledWith(
        expect.stringContaining('redirect_uri=http%3A%2F%2Flocalhost%3A3118%2Fcallback'),
      );
      expect(mockShell.openExternal).toHaveBeenCalledWith(
        expect.stringContaining('resource=https%3A%2F%2Fmcp.slack.com%2F'),
      );
      expect(agentCoreMocks.setSlackMcpPendingAuth).toHaveBeenCalledWith({
        codeVerifier: 'mock-code-verifier',
        oauthState: 'mock-state',
      });
      expect(agentCoreMocks.setSlackMcpTokens).toHaveBeenCalledWith(
        expect.objectContaining({
          accessToken: 'slack-access-token',
        }),
      );
    });

    it('clears Slack auth state when the callback server port is already in use', async () => {
      const { createOAuthCallbackServer } = await import('@main/oauth-callback-server');
      vi.mocked(createOAuthCallbackServer).mockRejectedValueOnce(
        Object.assign(new Error('Address in use'), { code: 'EADDRINUSE' }),
      );

      const module = await import('@main/opencode/auth-browser');

      await expect(module.loginSlackMcp()).rejects.toThrow(
        'http://localhost:3118/callback is already in use',
      );
      expect(agentCoreMocks.clearSlackMcpAuth).toHaveBeenCalled();
    });
  });
});

/**
 * Regression tests for the packaged-build bug where `Login with OpenAI`
 * failed with `env: node: No such file or directory` (exit 127) because the
 * OpenCode CLI shebang `#!/usr/bin/env node` could not resolve `node` —
 * the packaged Electron environment has no `node` on PATH, only the bundled
 * Node.js binary at Resources/nodejs/{platform}-{arch}/bin/node.
 *
 * See: https://github.com/accomplish-ai/accomplish (yanai/fix-openai-auth-bundled-node-path)
 */
describe('getOpenCodeCommandContext (packaged-build PATH injection)', () => {
  let getOpenCodeCommandContext: typeof import('@main/opencode/auth-browser-pty').getOpenCodeCommandContext;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    // Default: packaged with bundled Node available (the happy path)
    mockApp.isPackaged = true;
    mockGetBundledNodePaths.mockReturnValue({
      nodePath: '/mock/Resources/nodejs/darwin-arm64/bin/node',
      npmPath: '/mock/Resources/nodejs/darwin-arm64/bin/npm',
      npxPath: '/mock/Resources/nodejs/darwin-arm64/bin/npx',
      binDir: '/mock/Resources/nodejs/darwin-arm64/bin',
      nodeDir: '/mock/Resources/nodejs/darwin-arm64',
    });

    const mod = await import('@main/opencode/auth-browser-pty');
    getOpenCodeCommandContext = mod.getOpenCodeCommandContext;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    mockApp.isPackaged = false;
  });

  describe('packaged mode', () => {
    it('prepends bundled Node bin dir to PATH', async () => {
      const originalPath = process.env.PATH;
      process.env.PATH = '/usr/bin:/bin';

      try {
        const ctx = await getOpenCodeCommandContext();
        const delimiter = process.platform === 'win32' ? ';' : ':';
        expect(ctx.env.PATH).toBe(
          `/mock/Resources/nodejs/darwin-arm64/bin${delimiter}/usr/bin:/bin`,
        );
      } finally {
        process.env.PATH = originalPath;
      }
    });

    it('sets ELECTRON_RUN_AS_NODE=1 so spawned Electron runs as Node', async () => {
      const ctx = await getOpenCodeCommandContext();
      expect(ctx.env.ELECTRON_RUN_AS_NODE).toBe('1');
    });

    it('handles empty PATH by setting it to bundled bin dir alone', async () => {
      const originalPath = process.env.PATH;
      delete process.env.PATH;
      const originalPathWin = process.env.Path;
      delete process.env.Path;

      try {
        const ctx = await getOpenCodeCommandContext();
        expect(ctx.env.PATH).toBe('/mock/Resources/nodejs/darwin-arm64/bin');
      } finally {
        if (originalPath !== undefined) process.env.PATH = originalPath;
        if (originalPathWin !== undefined) process.env.Path = originalPathWin;
      }
    });

    it('throws an explicit error when bundled Node is missing (fail fast)', async () => {
      mockGetBundledNodePaths.mockReturnValue(null);
      await expect(getOpenCodeCommandContext()).rejects.toThrow(
        /Bundled Node\.js not found in packaged build/,
      );
    });
  });

  describe('dev mode (not packaged)', () => {
    beforeEach(() => {
      mockApp.isPackaged = false;
    });

    it('does NOT modify PATH (relies on developer shell PATH)', async () => {
      const originalPath = process.env.PATH;
      process.env.PATH = '/usr/local/bin:/usr/bin:/bin';

      try {
        const ctx = await getOpenCodeCommandContext();
        expect(ctx.env.PATH).toBe('/usr/local/bin:/usr/bin:/bin');
      } finally {
        process.env.PATH = originalPath;
      }
    });

    it('does NOT set ELECTRON_RUN_AS_NODE', async () => {
      const originalEnv = process.env.ELECTRON_RUN_AS_NODE;
      delete process.env.ELECTRON_RUN_AS_NODE;

      try {
        const ctx = await getOpenCodeCommandContext();
        expect(ctx.env.ELECTRON_RUN_AS_NODE).toBeUndefined();
      } finally {
        if (originalEnv !== undefined) process.env.ELECTRON_RUN_AS_NODE = originalEnv;
      }
    });

    it('does NOT throw when bundled Node is missing (only enforced in packaged mode)', async () => {
      mockGetBundledNodePaths.mockReturnValue(null);
      await expect(getOpenCodeCommandContext()).resolves.toBeDefined();
    });
  });
});
