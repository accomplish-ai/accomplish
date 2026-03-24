import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { testOllamaConnection } from '../../../src/providers/ollama.js';

// Mock tool-support-testing module so we can control testOllamaModelToolSupport
vi.mock('../../../src/providers/tool-support-testing.js', () => ({
  testOllamaModelToolSupport: vi.fn(),
}));

import { testOllamaModelToolSupport } from '../../../src/providers/tool-support-testing.js';

const mockedToolSupport = vi.mocked(testOllamaModelToolSupport);

describe('testOllamaConnection', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    mockedToolSupport.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('should return empty models array when /api/tags returns no models', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ models: [] }),
    } as Response);

    const result = await testOllamaConnection('http://localhost:11434');

    expect(result.success).toBe(true);
    expect(result.models).toEqual([]);
    expect(mockedToolSupport).not.toHaveBeenCalled();
  });

  it('should return correct models with tool support status', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        models: [
          { name: 'model-a', size: 100 },
          { name: 'model-b', size: 200 },
        ],
      }),
    } as Response);

    mockedToolSupport.mockResolvedValueOnce('supported').mockResolvedValueOnce('unsupported');

    const result = await testOllamaConnection('http://localhost:11434');

    expect(result.success).toBe(true);
    expect(result.models).toEqual([
      { id: 'model-a', displayName: 'model-a', size: 100, toolSupport: 'supported' },
      { id: 'model-b', displayName: 'model-b', size: 200, toolSupport: 'unsupported' },
    ]);
  });

  it('should batch model checks in groups of 5', async () => {
    // Create 7 models
    const rawModels = Array.from({ length: 7 }, (_, i) => ({
      name: `model-${i}`,
      size: (i + 1) * 100,
    }));

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ models: rawModels }),
    } as Response);

    // Track the order of calls to verify batching behaviour
    const callTimestamps: number[] = [];
    mockedToolSupport.mockImplementation(async () => {
      callTimestamps.push(Date.now());
      // Small delay to make concurrent calls measurably close in time
      await new Promise((r) => setTimeout(r, 20));
      return 'supported';
    });

    const result = await testOllamaConnection('http://localhost:11434');

    expect(result.success).toBe(true);
    expect(result.models).toHaveLength(7);
    expect(mockedToolSupport).toHaveBeenCalledTimes(7);

    // First 5 calls should have started at roughly the same time (within 10ms of each other)
    // indicating they ran concurrently in the first batch
    const firstBatchStart = callTimestamps[0]!;
    for (let i = 0; i < 5; i++) {
      expect(callTimestamps[i]! - firstBatchStart).toBeLessThan(15);
    }

    // The 6th and 7th calls should have started after the first batch completed
    // (at least ~20ms after the first batch started, because of the delay)
    expect(callTimestamps[5]! - firstBatchStart).toBeGreaterThanOrEqual(15);
  });

  it('should return error for invalid URL', async () => {
    const result = await testOllamaConnection('not-a-url');

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('should return error when connection times out', async () => {
    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';
    vi.mocked(fetch).mockRejectedValueOnce(abortError);

    const result = await testOllamaConnection('http://localhost:11434');

    expect(result.success).toBe(false);
    expect(result.error).toContain('timed out');
  });

  it('should return error when Ollama returns non-ok status', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 500,
    } as Response);

    const result = await testOllamaConnection('http://localhost:11434');

    expect(result.success).toBe(false);
    expect(result.error).toContain('Cannot connect to Ollama');
  });
});
