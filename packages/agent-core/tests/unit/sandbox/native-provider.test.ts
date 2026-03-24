import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SandboxConfig, SpawnArgs } from '../../../src/common/types/sandbox.js';

// Mock fs at module level so vitest can intercept accessSync
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    default: {
      ...actual,
      accessSync: vi.fn(),
    },
    accessSync: vi.fn(),
  };
});

/**
 * NativeSandboxProvider tests.
 *
 * We pass the `platform` parameter to the constructor to exercise
 * both macOS (sandbox-exec wrapping) and Windows/Linux (env-var only)
 * paths without relying on the test runner's actual OS.
 */

describe('NativeSandboxProvider', () => {
  // Dynamic import after mock setup
  let NativeSandboxProvider: typeof import('../../../src/sandbox/native-provider.js').NativeSandboxProvider;

  beforeEach(async () => {
    const mod = await import('../../../src/sandbox/native-provider.js');
    NativeSandboxProvider = mod.NativeSandboxProvider;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should have name "native"', () => {
    const provider = new NativeSandboxProvider('linux');
    expect(provider.name).toBe('native');
  });

  describe('isAvailable', () => {
    it('should return true on Windows (env-var approach)', async () => {
      const provider = new NativeSandboxProvider('win32');
      await expect(provider.isAvailable()).resolves.toBe(true);
    });

    it('should return true on Linux (env-var approach)', async () => {
      const provider = new NativeSandboxProvider('linux');
      await expect(provider.isAvailable()).resolves.toBe(true);
    });

    it('should return true on darwin when sandbox-exec is available', async () => {
      const fs = await import('fs');
      vi.mocked(fs.default.accessSync).mockImplementation(() => undefined);

      const provider = new NativeSandboxProvider('darwin');
      await expect(provider.isAvailable()).resolves.toBe(true);
    });

    it('should return false on darwin when sandbox-exec is not available', async () => {
      const fs = await import('fs');
      const enoent = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      vi.mocked(fs.default.accessSync).mockImplementation(() => {
        throw enoent;
      });

      const provider = new NativeSandboxProvider('darwin');
      await expect(provider.isAvailable()).resolves.toBe(false);
    });
  });

  describe('sandbox env var injection (via wrapSpawnArgs)', () => {
    it('should set ACCOMPLISH_SANDBOX_ENABLED and MODE', async () => {
      const provider = new NativeSandboxProvider('linux');
      const config: SandboxConfig = {
        mode: 'native',
        allowedPaths: [],
        networkRestricted: false,
        allowedHosts: [],
      };

      const result = await provider.wrapSpawnArgs(
        { file: '/bin/sh', args: [], cwd: '/tmp', env: {} },
        config,
      );

      expect(result.env['ACCOMPLISH_SANDBOX_ENABLED']).toBe('1');
      expect(result.env['ACCOMPLISH_SANDBOX_MODE']).toBe('native');
    });

    it('should set ALLOWED_PATHS with colon delimiter on Linux', async () => {
      const provider = new NativeSandboxProvider('linux');
      const config: SandboxConfig = {
        mode: 'native',
        allowedPaths: ['/home/user/project', '/tmp'],
        networkRestricted: false,
        allowedHosts: [],
      };

      const result = await provider.wrapSpawnArgs(
        { file: '/bin/sh', args: [], cwd: '/tmp', env: {} },
        config,
      );

      expect(result.env['ACCOMPLISH_SANDBOX_ALLOWED_PATHS']).toBe('/home/user/project:/tmp');
    });

    it('should set ALLOWED_PATHS with semicolon delimiter on Windows', async () => {
      const provider = new NativeSandboxProvider('win32');
      const config: SandboxConfig = {
        mode: 'native',
        allowedPaths: ['D:\\Projects', 'C:\\Temp'],
        networkRestricted: false,
        allowedHosts: [],
      };

      const result = await provider.wrapSpawnArgs(
        { file: 'cmd.exe', args: [], cwd: 'C:\\Temp', env: {} },
        config,
      );

      expect(result.env['ACCOMPLISH_SANDBOX_ALLOWED_PATHS']).toBe('D:\\Projects;C:\\Temp');
    });

    it('should set NETWORK_RESTRICTED when networkRestricted is true', async () => {
      const provider = new NativeSandboxProvider('linux');
      const config: SandboxConfig = {
        mode: 'native',
        allowedPaths: [],
        networkRestricted: true,
        allowedHosts: [],
      };

      const result = await provider.wrapSpawnArgs(
        { file: '/bin/sh', args: [], cwd: '/tmp', env: {} },
        config,
      );

      expect(result.env['ACCOMPLISH_SANDBOX_NETWORK_RESTRICTED']).toBe('1');
    });

    it('should not set NETWORK_RESTRICTED when networkRestricted is false', async () => {
      const provider = new NativeSandboxProvider('linux');
      const config: SandboxConfig = {
        mode: 'native',
        allowedPaths: [],
        networkRestricted: false,
        allowedHosts: [],
      };

      const result = await provider.wrapSpawnArgs(
        { file: '/bin/sh', args: [], cwd: '/tmp', env: {} },
        config,
      );

      expect(result.env['ACCOMPLISH_SANDBOX_NETWORK_RESTRICTED']).toBeUndefined();
    });

    it('should set ALLOWED_HOSTS as comma-separated', async () => {
      const provider = new NativeSandboxProvider('linux');
      const config: SandboxConfig = {
        mode: 'native',
        allowedPaths: [],
        networkRestricted: true,
        allowedHosts: ['api.openai.com', 'api.anthropic.com'],
      };

      const result = await provider.wrapSpawnArgs(
        { file: '/bin/sh', args: [], cwd: '/tmp', env: {} },
        config,
      );

      expect(result.env['ACCOMPLISH_SANDBOX_ALLOWED_HOSTS']).toBe(
        'api.openai.com,api.anthropic.com',
      );
    });

    it('should not set ALLOWED_PATHS when empty', async () => {
      const provider = new NativeSandboxProvider('linux');
      const config: SandboxConfig = {
        mode: 'native',
        allowedPaths: [],
        networkRestricted: false,
        allowedHosts: [],
      };

      const result = await provider.wrapSpawnArgs(
        { file: '/bin/sh', args: [], cwd: '/tmp', env: {} },
        config,
      );

      expect(result.env['ACCOMPLISH_SANDBOX_ALLOWED_PATHS']).toBeUndefined();
    });
  });

  describe('wrapSpawnArgs (non-macOS)', () => {
    it('should inject sandbox env vars on Windows without modifying the command', async () => {
      const provider = new NativeSandboxProvider('win32');
      const spawnArgs: SpawnArgs = {
        file: 'cmd.exe',
        args: ['/c', 'node', 'script.js'],
        cwd: 'C:\\Projects\\myapp',
        env: { COMSPEC: 'cmd.exe', PATH: 'C:\\Windows\\System32' },
      };

      const config: SandboxConfig = {
        mode: 'native',
        allowedPaths: ['C:\\Projects\\myapp'],
        networkRestricted: true,
        allowedHosts: ['api.openai.com'],
      };

      const result = await provider.wrapSpawnArgs(spawnArgs, config);

      // File and args should be unchanged
      expect(result.file).toBe('cmd.exe');
      expect(result.args).toEqual(['/c', 'node', 'script.js']);
      expect(result.cwd).toBe('C:\\Projects\\myapp');

      // Original env vars preserved
      expect(result.env['COMSPEC']).toBe('cmd.exe');
      expect(result.env['PATH']).toBe('C:\\Windows\\System32');

      // Sandbox env vars injected
      expect(result.env['ACCOMPLISH_SANDBOX_ENABLED']).toBe('1');
      expect(result.env['ACCOMPLISH_SANDBOX_MODE']).toBe('native');
      expect(result.env['ACCOMPLISH_SANDBOX_ALLOWED_PATHS']).toBe('C:\\Projects\\myapp');
      expect(result.env['ACCOMPLISH_SANDBOX_NETWORK_RESTRICTED']).toBe('1');
      expect(result.env['ACCOMPLISH_SANDBOX_ALLOWED_HOSTS']).toBe('api.openai.com');
    });

    it('should inject sandbox env vars on Linux without modifying the command', async () => {
      const provider = new NativeSandboxProvider('linux');
      const spawnArgs: SpawnArgs = {
        file: '/bin/bash',
        args: ['-c', 'node script.js'],
        cwd: '/home/user/project',
        env: { HOME: '/home/user' },
      };

      const config: SandboxConfig = {
        mode: 'native',
        allowedPaths: [],
        networkRestricted: false,
        allowedHosts: [],
      };

      const result = await provider.wrapSpawnArgs(spawnArgs, config);

      expect(result.file).toBe('/bin/bash');
      expect(result.args).toEqual(['-c', 'node script.js']);
      expect(result.env['ACCOMPLISH_SANDBOX_ENABLED']).toBe('1');
    });
  });

  describe('wrapSpawnArgs (macOS)', () => {
    it('should wrap with sandbox-exec on darwin', async () => {
      const fs = await import('fs');
      vi.mocked(fs.accessSync).mockImplementation(() => undefined);

      const provider = new NativeSandboxProvider('darwin');
      const spawnArgs: SpawnArgs = {
        file: '/usr/local/bin/node',
        args: ['opencode', 'chat'],
        cwd: '/Users/dev/project',
        env: { HOME: '/Users/dev' },
      };

      const config: SandboxConfig = {
        mode: 'native',
        allowedPaths: ['/Users/dev/.opencode'],
        networkRestricted: false,
        allowedHosts: [],
      };

      const result = await provider.wrapSpawnArgs(spawnArgs, config);

      // Should be wrapped with /bin/sh -c sandbox-exec
      expect(result.file).toBe('/bin/sh');
      expect(result.args[0]).toBe('-c');
      expect(result.args[1]).toContain('/usr/bin/sandbox-exec');
      expect(result.args[1]).toContain('-p');

      // Profile should deny default, allow process-exec, and contain allowed paths
      const profileArg = result.args[1];
      expect(profileArg).toContain('deny default');
      expect(profileArg).toContain('allow process-exec');
      expect(profileArg).toContain('/Users/dev/.opencode');
      expect(profileArg).toContain('/Users/dev/project'); // cwd
      expect(profileArg).toContain('allow network*'); // not restricted

      // Sandbox env vars should be present
      expect(result.env['ACCOMPLISH_SANDBOX_ENABLED']).toBe('1');
    });

    it('should deny network when networkRestricted is true', async () => {
      const fs = await import('fs');
      vi.mocked(fs.accessSync).mockImplementation(() => undefined);

      const provider = new NativeSandboxProvider('darwin');
      const spawnArgs: SpawnArgs = {
        file: '/usr/local/bin/node',
        args: ['opencode'],
        cwd: '/tmp/sandbox-test',
        env: {},
      };

      const config: SandboxConfig = {
        mode: 'native',
        allowedPaths: [],
        networkRestricted: true,
        allowedHosts: [],
      };

      const result = await provider.wrapSpawnArgs(spawnArgs, config);

      const profileArg = result.args[1];
      expect(profileArg).toContain('deny network*');
      expect(profileArg).toContain('allow network* (local ip "localhost:*")');
    });
  });

  describe('dispose', () => {
    it('should resolve without error', async () => {
      const provider = new NativeSandboxProvider('linux');
      await expect(provider.dispose()).resolves.toBeUndefined();
    });
  });
});
