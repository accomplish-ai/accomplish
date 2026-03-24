import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { testOllamaModelToolSupport } from '../../../src/providers/tool-support-testing.js';

describe('testOllamaModelToolSupport', () => {
  const baseUrl = 'http://localhost:11434';
  const modelId = 'llama3:latest';

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('should return "supported" when capabilities include "tools"', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ capabilities: ['tools', 'completion'] }),
    } as Response);

    const result = await testOllamaModelToolSupport(baseUrl, modelId);

    expect(result).toBe('supported');
  });

  it('should return "unsupported" when capabilities exist but do not include "tools"', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ capabilities: ['completion'] }),
    } as Response);

    const result = await testOllamaModelToolSupport(baseUrl, modelId);

    expect(result).toBe('unsupported');
  });

  it('should return "unsupported" when capabilities is an empty array', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ capabilities: [] }),
    } as Response);

    const result = await testOllamaModelToolSupport(baseUrl, modelId);

    expect(result).toBe('unsupported');
  });

  it('should return "unknown" when response has no capabilities field', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ modelfile: '...' }),
    } as Response);

    const result = await testOllamaModelToolSupport(baseUrl, modelId);

    expect(result).toBe('unknown');
  });

  it('should return "unknown" when /api/show returns a non-ok status', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 404,
    } as Response);

    const result = await testOllamaModelToolSupport(baseUrl, modelId);

    expect(result).toBe('unknown');
  });

  it('should return "unknown" when fetch throws a network error', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('fetch failed'));

    const result = await testOllamaModelToolSupport(baseUrl, modelId);

    expect(result).toBe('unknown');
  });

  it('should return "unknown" when fetch is aborted (timeout)', async () => {
    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';
    vi.mocked(fetch).mockRejectedValueOnce(abortError);

    const result = await testOllamaModelToolSupport(baseUrl, modelId);

    expect(result).toBe('unknown');
  });

  it('should call the correct URL with POST and model in the body', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ capabilities: ['tools'] }),
    } as Response);

    await testOllamaModelToolSupport(baseUrl, modelId);

    expect(fetch).toHaveBeenCalledWith(
      `${baseUrl}/api/show`,
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: modelId }),
        signal: expect.any(AbortSignal),
      }),
    );
  });
});
