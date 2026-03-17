/**
 * Tests for DockerSandboxProvider.
 *
 * Contributed by SaaiAravindhRaja (PR #612):
 *   - Docker args construction tests (working dir, allowed paths, network,
 *     custom image, default image, env-var forwarding, env-var redaction,
 *     shell arg escaping)
 *   - SandboxConfig type validation tests
 *   - Migration version test
 *
 * Adapted by Avishay Maor for the pluggable-provider architecture used in
 * this repository (DockerSandboxProvider instead of inline adapter methods).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DockerSandboxProvider } from '../../../src/sandbox/docker-provider.js';
import type { SandboxConfig, SpawnArgs } from '../../../src/common/types/sandbox.js';

const BASE_SPAWN_ARGS: SpawnArgs = {
  file: '/usr/bin/opencode',
  args: [],
  cwd: '/home/user/project',
  env: {},
};

const DOCKER_CONFIG: SandboxConfig = {
  mode: 'docker',
  allowedPaths: [],
  networkRestricted: false,
  allowedHosts: [],
  networkPolicy: { allowOutbound: true },
};

describe('DockerSandboxProvider', () => {
  let provider: DockerSandboxProvider;

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    provider = new DockerSandboxProvider('linux');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should have name "docker"', () => {
    expect(provider.name).toBe('docker');
  });

  it('isAvailable should return false on win32', async () => {
    const winProvider = new DockerSandboxProvider('win32');
    expect(await winProvider.isAvailable()).toBe(false);
  });

  describe('buildDockerArgs — working directory', () => {
    it('should mount working directory as /workspace', () => {
      const args = provider.buildDockerArgs(BASE_SPAWN_ARGS, DOCKER_CONFIG);
      expect(args).toContain('-v');
      expect(args.some((a) => a.endsWith(':/workspace'))).toBe(true);
      expect(args).toContain('-w');
      expect(args).toContain('/workspace');
    });
  });

  describe('buildDockerArgs — allowed paths (SaaiAravindhRaja, PR #612)', () => {
    it('should mount additional allowed paths as extra volumes', () => {
      const config: SandboxConfig = {
        ...DOCKER_CONFIG,
        allowedPaths: ['/tmp/workspace', '/var/data'],
      };
      const args = provider.buildDockerArgs(BASE_SPAWN_ARGS, config);
      expect(args).toContain('/tmp/workspace:/tmp/workspace');
      expect(args).toContain('/var/data:/var/data');
    });
  });

  describe('buildDockerArgs — network policy (SaaiAravindhRaja, PR #612)', () => {
    it('should add --network none when allowOutbound is false', () => {
      const config: SandboxConfig = {
        ...DOCKER_CONFIG,
        networkPolicy: { allowOutbound: false },
      };
      const args = provider.buildDockerArgs(BASE_SPAWN_ARGS, config);
      expect(args).toContain('--network');
      expect(args).toContain('none');
    });

    it('should NOT add --network none when allowOutbound is true', () => {
      const args = provider.buildDockerArgs(BASE_SPAWN_ARGS, DOCKER_CONFIG);
      expect(args).not.toContain('--network');
    });

    it('should honour legacy networkRestricted field', () => {
      const config: SandboxConfig = {
        ...DOCKER_CONFIG,
        networkRestricted: true,
        networkPolicy: undefined,
      };
      const args = provider.buildDockerArgs(BASE_SPAWN_ARGS, config);
      expect(args).toContain('--network');
      expect(args).toContain('none');
    });
  });

  describe('buildDockerArgs — Docker image (SaaiAravindhRaja, PR #612)', () => {
    it('should use custom Docker image when specified', () => {
      const config: SandboxConfig = { ...DOCKER_CONFIG, dockerImage: 'ubuntu:22.04' };
      const args = provider.buildDockerArgs(BASE_SPAWN_ARGS, config);
      expect(args).toContain('ubuntu:22.04');
      expect(args).not.toContain('node:20-slim');
    });

    it('should default to node:20-slim when no image specified', () => {
      const args = provider.buildDockerArgs(BASE_SPAWN_ARGS, DOCKER_CONFIG);
      expect(args).toContain('node:20-slim');
    });
  });

  describe('buildDockerArgs — command construction', () => {
    it('should use basename of spawnFile inside the container', () => {
      const spawnArgs: SpawnArgs = { ...BASE_SPAWN_ARGS, file: '/usr/local/bin/opencode' };
      const args = provider.buildDockerArgs(spawnArgs, DOCKER_CONFIG);
      const shIndex = args.indexOf('sh');
      expect(shIndex).toBeGreaterThan(-1);
      expect(args[shIndex + 1]).toBe('-c');
      const shellCmd = args[shIndex + 2];
      expect(shellCmd).toContain('opencode');
      expect(shellCmd).not.toContain('/usr/local/bin/opencode');
    });
  });

  describe('buildDockerArgs — env var forwarding (preeeetham, PR #430)', () => {
    it('should forward API key env vars', () => {
      const spawnArgs: SpawnArgs = {
        ...BASE_SPAWN_ARGS,
        env: {
          ANTHROPIC_API_KEY: 'sk-ant-test',
          OPENAI_API_KEY: 'sk-openai-test',
          PATH: '/usr/bin',
          HOME: '/home/user',
          USER: 'testuser',
        },
      };
      const args = provider.buildDockerArgs(spawnArgs, DOCKER_CONFIG);
      // API keys should be forwarded
      expect(args.some((a) => a === 'ANTHROPIC_API_KEY=sk-ant-test')).toBe(true);
      expect(args.some((a) => a === 'OPENAI_API_KEY=sk-openai-test')).toBe(true);
      // PATH, HOME, USER should NOT be forwarded
      const envArgValues = args.filter((_, i) => i > 0 && args[i - 1] === '-e');
      expect(envArgValues.every((v) => !v.startsWith('PATH='))).toBe(true);
      expect(envArgValues.every((v) => !v.startsWith('HOME='))).toBe(true);
      expect(envArgValues.every((v) => !v.startsWith('USER='))).toBe(true);
    });
  });

  describe('redactDockerArgs (SaaiAravindhRaja, PR #612)', () => {
    it('should redact values of -e flags', () => {
      const args = [
        'run',
        '--rm',
        '-e',
        'API_KEY=super-secret-123',
        '-e',
        'TOKEN=abc',
        'node:20-slim',
      ];
      const redacted = provider.redactDockerArgs(args);
      expect(redacted).toContain('API_KEY=***');
      expect(redacted).toContain('TOKEN=***');
      expect(redacted).not.toContain('super-secret-123');
      expect(redacted).not.toContain('abc');
    });

    it('should not redact non-env args', () => {
      const args = ['run', '--rm', '-v', '/home:/workspace', 'node:20-slim'];
      expect(provider.redactDockerArgs(args)).toEqual(args);
    });

    it('should handle env vars with = in the value', () => {
      const args = ['-e', 'CONFIG=key=value=extra'];
      const redacted = provider.redactDockerArgs(args);
      expect(redacted[1]).toBe('CONFIG=***');
    });
  });

  describe('wrapSpawnArgs', () => {
    it('should rewire the file to "docker"', async () => {
      const result = await provider.wrapSpawnArgs(BASE_SPAWN_ARGS, DOCKER_CONFIG);
      expect(result.file).toBe('docker');
      expect(result.args[0]).toBe('run');
    });

    it('should preserve cwd and include original env vars merged with sandbox env', async () => {
      const result = await provider.wrapSpawnArgs(BASE_SPAWN_ARGS, DOCKER_CONFIG);
      expect(result.cwd).toBe(BASE_SPAWN_ARGS.cwd);
      // env is a new merged object: original vars preserved + ACCOMPLISH_SANDBOX_MODE injected
      expect(result.env).toMatchObject(BASE_SPAWN_ARGS.env);
      expect(result.env['ACCOMPLISH_SANDBOX_MODE']).toBe('docker');
    });
  });
});

describe('SandboxConfig docker-mode type validation (SaaiAravindhRaja, PR #612)', () => {
  it('should accept valid docker config with networkPolicy', () => {
    const config: SandboxConfig = {
      mode: 'docker',
      allowedPaths: ['/tmp', '/var/data'],
      networkRestricted: false,
      allowedHosts: [],
      dockerImage: 'node:20-slim',
      networkPolicy: {
        allowOutbound: true,
        allowedHosts: ['api.openai.com', 'github.com'],
      },
    };
    expect(config.mode).toBe('docker');
    expect(config.dockerImage).toBe('node:20-slim');
    expect(config.networkPolicy?.allowedHosts).toHaveLength(2);
  });

  it('should allow optional docker fields to be omitted', () => {
    const config: SandboxConfig = {
      mode: 'docker',
      allowedPaths: [],
      networkRestricted: false,
      allowedHosts: [],
    };
    expect(config.dockerImage).toBeUndefined();
    expect(config.networkPolicy).toBeUndefined();
  });
});

describe('SandboxPaths type (preeeetham, PR #430)', () => {
  it('should accept valid SandboxPaths object', async () => {
    const { DockerSandboxProvider } = await import('../../../src/sandbox/docker-provider.js');
    const paths = {
      configDir: '/home/user/.config/opencode',
      openDataHome: '/home/user/.local/share',
    };
    const p = new DockerSandboxProvider('linux', () => paths);
    expect(p.name).toBe('docker');
  });
});
