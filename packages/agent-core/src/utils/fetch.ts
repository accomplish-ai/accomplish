import { HttpsProxyAgent } from 'https-proxy-agent';

/**
 * Returns an HTTPS proxy agent when a proxy is configured via environment variables
 * (HTTP_PROXY, HTTPS_PROXY, ALL_PROXY, or their lowercase equivalents).
 * Returns undefined when no proxy is set.
 */
function getProxyAgent(url: string): HttpsProxyAgent<string> | undefined {
  const proxyUrl =
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy ||
    process.env.ALL_PROXY ||
    process.env.all_proxy;

  if (!proxyUrl) {
    return undefined;
  }

  // Honour NO_PROXY / no_proxy exclusions
  const noProxy = process.env.NO_PROXY || process.env.no_proxy;
  if (noProxy) {
    try {
      const targetHost = new URL(url).hostname;
      const excluded = noProxy
        .split(',')
        .map((h) => h.trim().toLowerCase())
        .some((h) => h === '*' || targetHost === h || targetHost.endsWith(`.${h}`));
      if (excluded) return undefined;
    } catch {
      // If URL parsing fails, don't exclude
    }
  }

  return new HttpsProxyAgent(proxyUrl);
}

export async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const proxyAgent = getProxyAgent(url);
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      // Pass the proxy agent when one is configured.
      // Node 22's built-in fetch (undici) accepts a `dispatcher` option but the
      // standard RequestInit type does not expose it; we cast to unknown first so
      // TypeScript doesn't complain while still supporting proxy at runtime.
      ...(proxyAgent ? ({ dispatcher: proxyAgent } as unknown as RequestInit) : {}),
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}
