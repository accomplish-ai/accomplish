import { describe, it, expect } from 'vitest';
import { DisabledSandboxProvider } from '../../../src/sandbox/disabled-provider.js';
import type { SandboxConfig, SpawnArgs } from '../../../src/common/types/sandbox.js';
import { DEFAULT_SANDBOX_CONFIG } from '../../../src/common/types/sandbox.js';

describe('DisabledSandboxProvider', () => {
  const provider = new DisabledSandboxProvider();

  it('should have name "disabled"', () => {
    expect(provider.name).toBe('disabled');
  });

  it('isAvailable should return true', async () => {
    const result = await provider.isAvailable();
    expect(result).toBe(true);
  });

  it('wrapSpawnArgs should return args unchanged (passthrough)', async () => {
    const spawnArgs: SpawnArgs = {
      file: '/usr/bin/node',
      args: ['--version'],
      cwd: '/tmp',
      env: { HOME: '/home/test', PATH: '/usr/bin' },
    };

    const config: SandboxConfig = {
      mode: 'disabled',
      allowedPaths: ['/some/path'],
      networkRestricted: true,
      allowedHosts: ['example.com'],
    };

    const result = await provider.wrapSpawnArgs(spawnArgs, config);

    expect(result).toEqual(spawnArgs);
    expect(result.file).toBe(spawnArgs.file);
    expect(result.args).toBe(spawnArgs.args);
    expect(result.cwd).toBe(spawnArgs.cwd);
    expect(result.env).toBe(spawnArgs.env);
  });

  it('wrapSpawnArgs should not mutate original args', async () => {
    const original: SpawnArgs = {
      file: 'cmd.exe',
      args: ['/c', 'echo hello'],
      cwd: 'C:\\Temp',
      env: { COMSPEC: 'cmd.exe' },
    };

    // Deep-clone nested arrays/objects so the assertion catches mutations to
    // original.args and original.env references (shallow spread would miss these).
    const frozen: SpawnArgs = {
      file: original.file,
      args: [...original.args],
      cwd: original.cwd,
      env: { ...original.env },
    };
    await provider.wrapSpawnArgs(original, DEFAULT_SANDBOX_CONFIG);

    expect(original.file).toBe(frozen.file);
    expect(original.args).toEqual(frozen.args);
    expect(original.cwd).toBe(frozen.cwd);
    expect(original.env).toEqual(frozen.env);
  });

  it('dispose should resolve without error', async () => {
    await expect(provider.dispose()).resolves.toBeUndefined();
  });
});
