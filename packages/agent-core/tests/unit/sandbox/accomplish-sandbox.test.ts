import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the sandbox-manager module before importing
vi.mock('../../../src/sandbox/sandbox-manager.js', () => ({
  SandboxManager: {
    initialize: vi.fn(),
    isSupportedPlatform: vi.fn(() => false),
    isSandboxingEnabled: vi.fn(() => false),
    wrapWithSandbox: vi.fn((cmd: string) => Promise.resolve(cmd)),
    cleanupAfterCommand: vi.fn(),
    reset: vi.fn(() => Promise.resolve()),
    getConfig: vi.fn(() => undefined),
    updateConfig: vi.fn(),
  },
}));

import {
  initializeSandbox,
  isSandboxActive,
  wrapCommand,
  cleanupAfterTask,
  shutdownSandbox,
} from '../../../src/sandbox/accomplish-sandbox.js';
import { SandboxManager } from '../../../src/sandbox/sandbox-manager.js';

const mockedManager = vi.mocked(SandboxManager);

describe('AccomplishSandbox', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedManager.isSupportedPlatform.mockReturnValue(false);
    mockedManager.isSandboxingEnabled.mockReturnValue(false);
  });

  describe('isSandboxActive', () => {
    it('should return false before initialization', () => {
      expect(isSandboxActive()).toBe(false);
    });

    it('should return true when sandbox manager reports enabled', () => {
      mockedManager.isSandboxingEnabled.mockReturnValue(true);
      expect(isSandboxActive()).toBe(true);
    });
  });

  describe('wrapCommand', () => {
    it('should return original command when sandbox is not active', async () => {
      const result = await wrapCommand('echo hello');
      expect(result).toBe('echo hello');
    });

    it('should call SandboxManager.wrapWithSandbox when active', async () => {
      mockedManager.isSandboxingEnabled.mockReturnValue(true);
      mockedManager.wrapWithSandbox.mockResolvedValue('sandbox-exec echo hello');
      mockedManager.getConfig.mockReturnValue({
        network: { allowedDomains: [], deniedDomains: [] },
        filesystem: { denyRead: [], allowWrite: ['/tmp'], denyWrite: [] },
      });

      const result = await wrapCommand('echo hello', '/my/project');

      expect(mockedManager.wrapWithSandbox).toHaveBeenCalledWith(
        'echo hello',
        undefined,
        expect.objectContaining({
          filesystem: expect.objectContaining({
            allowWrite: expect.arrayContaining(['/tmp', '/my/project']),
          }),
        }),
        undefined,
        '/my/project',
      );
      expect(result).toBe('sandbox-exec echo hello');
    });

    it('should return original command if wrapWithSandbox throws', async () => {
      mockedManager.isSandboxingEnabled.mockReturnValue(true);
      mockedManager.wrapWithSandbox.mockRejectedValue(new Error('sandbox failure'));
      mockedManager.getConfig.mockReturnValue({
        network: { allowedDomains: [], deniedDomains: [] },
        filesystem: { denyRead: [], allowWrite: [], denyWrite: [] },
      });

      const result = await wrapCommand('echo hello');
      expect(result).toBe('echo hello');
    });
  });

  describe('initializeSandbox', () => {
    it('should no-op on unsupported platform', async () => {
      mockedManager.isSupportedPlatform.mockReturnValue(false);

      await initializeSandbox();

      expect(mockedManager.initialize).not.toHaveBeenCalled();
    });

    it('should call SandboxManager.initialize on supported platform', async () => {
      mockedManager.isSupportedPlatform.mockReturnValue(true);

      await initializeSandbox({ workingDirectory: '/tmp' });

      expect(mockedManager.initialize).toHaveBeenCalledWith(
        expect.objectContaining({
          allowPty: true,
          network: expect.objectContaining({
            allowedDomains: expect.arrayContaining(['api.anthropic.com']),
          }),
          filesystem: expect.objectContaining({
            allowWrite: expect.arrayContaining(['/tmp']),
          }),
        }),
      );
    });
  });

  describe('cleanupAfterTask', () => {
    it('should no-op when not active', () => {
      cleanupAfterTask();
      expect(mockedManager.cleanupAfterCommand).not.toHaveBeenCalled();
    });

    it('should call cleanupAfterCommand when active', () => {
      mockedManager.isSandboxingEnabled.mockReturnValue(true);
      cleanupAfterTask();
      expect(mockedManager.cleanupAfterCommand).toHaveBeenCalled();
    });
  });

  describe('shutdownSandbox', () => {
    it('should call SandboxManager.reset', async () => {
      await shutdownSandbox();
      expect(mockedManager.reset).toHaveBeenCalled();
    });
  });
});
