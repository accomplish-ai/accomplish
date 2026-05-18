import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchAndEnrichModels } from '../../../src/providers/lmstudio-models.js';

vi.mock('../../../src/utils/fetch.js', () => ({
  fetchWithTimeout: vi.fn(),
}));

vi.mock('../../../src/providers/tool-support-testing.js', () => ({
  testLMStudioModelToolSupport: vi.fn(),
}));

import { fetchWithTimeout } from '../../../src/utils/fetch.js';
import { testLMStudioModelToolSupport } from '../../../src/providers/tool-support-testing.js';

describe('fetchAndEnrichModels', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends bearer auth header and forwards apiKey to tool support checks', async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [{ id: 'llama-3.1', object: 'model' }],
      }),
    } as Response);
    vi.mocked(testLMStudioModelToolSupport).mockResolvedValueOnce('supported');

    const result = await fetchAndEnrichModels('http://localhost:1234', 15000, 'token-123');

    expect(result.success).toBe(true);
    expect(fetchWithTimeout).toHaveBeenCalledWith(
      'http://localhost:1234/v1/models',
      expect.objectContaining({
        method: 'GET',
        headers: { Authorization: 'Bearer token-123' },
      }),
      15000,
    );
    expect(testLMStudioModelToolSupport).toHaveBeenCalledWith(
      'http://localhost:1234',
      'llama-3.1',
      'token-123',
    );
  });
});
