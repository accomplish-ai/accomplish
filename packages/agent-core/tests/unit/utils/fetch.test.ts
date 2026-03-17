import { describe, it, expect, vi, afterEach } from 'vitest';

// We test the proxy-agent selection logic by mocking the environment
// and observing which dispatcher is passed to global fetch.

describe('fetchWithTimeout proxy support', () => {
  afterEach(() => {
    // Clean up env vars set during tests
    for (const key of [
      'HTTPS_PROXY',
      'https_proxy',
      'HTTP_PROXY',
      'http_proxy',
      'ALL_PROXY',
      'all_proxy',
      'NO_PROXY',
      'no_proxy',
    ]) {
      delete process.env[key];
    }
    vi.restoreAllMocks();
  });

  it('passes no dispatcher when no proxy env vars are set', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);

    const { fetchWithTimeout } = await import('../../../src/utils/fetch.js');

    await fetchWithTimeout('https://example.com', {}, 5000);

    const callArgs = mockFetch.mock.calls[0][1] as Record<string, unknown>;
    expect(callArgs.dispatcher).toBeUndefined();
  });

  it('passes a dispatcher when HTTPS_PROXY is set', async () => {
    process.env.HTTPS_PROXY = 'http://proxy.example.com:8080';

    const mockFetch = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);

    // Re-import to pick up the new env var
    vi.resetModules();
    const { fetchWithTimeout } = await import('../../../src/utils/fetch.js');

    await fetchWithTimeout('https://api.example.com/test', {}, 5000);

    const callArgs = mockFetch.mock.calls[0][1] as Record<string, unknown>;
    expect(callArgs.dispatcher).toBeDefined();
  });

  it('skips proxy for hosts in NO_PROXY', async () => {
    process.env.HTTPS_PROXY = 'http://proxy.example.com:8080';
    process.env.NO_PROXY = 'api.example.com';

    const mockFetch = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);

    vi.resetModules();
    const { fetchWithTimeout } = await import('../../../src/utils/fetch.js');

    await fetchWithTimeout('https://api.example.com/v1/models', {}, 5000);

    const callArgs = mockFetch.mock.calls[0][1] as Record<string, unknown>;
    expect(callArgs.dispatcher).toBeUndefined();
  });
});
