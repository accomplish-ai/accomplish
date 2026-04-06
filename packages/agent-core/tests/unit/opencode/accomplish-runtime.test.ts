import { describe, it, expect } from 'vitest';
import { noopRuntime } from '../../../src/opencode/accomplish-runtime.js';

const dummyDeps = {
  readKey: () => null,
  writeKey: () => {},
  readGaClientId: () => null,
};

describe('noopRuntime', () => {
  it('isAvailable returns false', () => {
    expect(noopRuntime.isAvailable()).toBe(false);
  });

  it('connect throws accomplish_runtime_unavailable', async () => {
    await expect(noopRuntime.connect(dummyDeps)).rejects.toThrow('accomplish_runtime_unavailable');
  });

  it('getUsage throws accomplish_runtime_unavailable', async () => {
    await expect(noopRuntime.getUsage()).rejects.toThrow('accomplish_runtime_unavailable');
  });

  it('disconnect does not throw', () => {
    expect(() => noopRuntime.disconnect()).not.toThrow();
  });

  it('onUsageUpdate returns unsubscribe function', () => {
    const unsubscribe = noopRuntime.onUsageUpdate(() => {});
    expect(typeof unsubscribe).toBe('function');
    expect(() => unsubscribe()).not.toThrow();
  });

  it('buildProviderConfig returns empty configs', async () => {
    const result = await noopRuntime.buildProviderConfig(dummyDeps);
    expect(result.configs).toEqual([]);
    expect(result.enableToAdd).toEqual([]);
  });
});
