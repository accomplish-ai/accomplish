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
    callbacks.forEach((cb) => (cb as (params: { exitCode: number; signal?: number }) => void)({ exitCode, signal }));
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

// Mock cli-path
vi.mock('@main/opencode/cli-path', () => ({
  getOpenCodeCliPath: vi.fn(() => ({ command: '/mock/opencode', args: [] })),
}));

// Mock config-generator
vi.mock('@main/opencode/config-generator', () => ({
  generateOpenCodeConfig: vi.fn(() => Promise.resolve('/mock/config/path')),
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
      expect(spawnCall[1]).toEqual(expect.arrayContaining([
        expect.stringContaining('auth'),
      ]));

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
      const enterCalls = writeCalls.filter(call => call[0] === '\r');
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
        expect.stringContaining('https://auth.openai.com')
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

      const startPromise = oauthBrowserFlow.start();

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
});
