import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchAndEnrichModels } from '../../../src/providers/lmstudio-models.js';

vi.mock('../../../src/providers/tool-support-testing.js', () => ({
  testLMStudioModelToolSupport: vi.fn(),
}));

import { testLMStudioModelToolSupport } from '../../../src/providers/tool-support-testing.js';

const mockedToolSupport = vi.mocked(testLMStudioModelToolSupport);

function response(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as Response;
}

describe('fetchAndEnrichModels', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    mockedToolSupport.mockReset();
    mockedToolSupport.mockResolvedValue('supported');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('discovers models from the OpenAI-compatible endpoint', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      response({ data: [{ id: 'qwen/qwen3-8b' }] }),
    );

    const result = await fetchAndEnrichModels('http://localhost:1234/', 1000);

    expect(result).toEqual({
      success: true,
      models: [
        {
          id: 'qwen/qwen3-8b',
          name: 'Qwen/Qwen3 8b',
          toolSupport: 'supported',
        },
      ],
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:1234/v1/models',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(mockedToolSupport).toHaveBeenCalledWith('http://localhost:1234', 'qwen/qwen3-8b');
  });

  it('falls back to the native endpoint when the compatible endpoint is empty', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(response({ data: [] }))
      .mockResolvedValueOnce(
        response({
          models: [
            {
              type: 'llm',
              key: 'qwen/qwen3-8b',
              display_name: 'Qwen 3 8B',
              loaded_instances: [{ id: 'qwen/qwen3-8b' }],
            },
            {
              type: 'embedding',
              key: 'nomic-embed-text',
              display_name: 'Nomic Embed Text',
            },
          ],
        }),
      );

    const result = await fetchAndEnrichModels('http://localhost:1234', 1000);

    expect(result).toEqual({
      success: true,
      models: [
        {
          id: 'qwen/qwen3-8b',
          name: 'Qwen 3 8B',
          toolSupport: 'supported',
        },
      ],
    });
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      'http://localhost:1234/api/v1/models',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(mockedToolSupport).toHaveBeenCalledTimes(1);
  });

  it('returns the original endpoint error when both discovery endpoints fail', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        response({ error: { message: 'OpenAI endpoint unavailable' } }, false, 404),
      )
      .mockResolvedValueOnce(
        response({ error: { message: 'Native endpoint unavailable' } }, false, 404),
      );

    const result = await fetchAndEnrichModels('http://localhost:1234', 1000);

    expect(result).toEqual({ success: false, error: 'OpenAI endpoint unavailable' });
    expect(mockedToolSupport).not.toHaveBeenCalled();
  });
});
