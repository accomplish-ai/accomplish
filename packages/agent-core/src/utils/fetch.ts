import { ProxyAgent, type Dispatcher } from 'undici';
import { getProxyForUrl } from 'proxy-from-env';

const proxyDispatcherCache = new Map<string, ProxyAgent>();

/**
 * Returns an undici ProxyAgent for the given URL when a proxy is configured
 * via environment variables (HTTP_PROXY, HTTPS_PROXY, ALL_PROXY, NO_PROXY, …).
 * Proxy selection and NO_PROXY exclusion logic is delegated to proxy-from-env.
 * Results are cached by proxy URL so a single dispatcher is reused per proxy.
 */
function getProxyDispatcher(url: string): Dispatcher | undefined {
  const proxyUrl = getProxyForUrl(url);
  if (!proxyUrl) {
    return undefined;
  }
  let dispatcher = proxyDispatcherCache.get(proxyUrl);
  if (!dispatcher) {
    dispatcher = new ProxyAgent(proxyUrl);
    proxyDispatcherCache.set(proxyUrl, dispatcher);
  }
  return dispatcher;
}

export async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const proxyDispatcher = getProxyDispatcher(url);
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      // Node 22's built-in fetch (undici) accepts a `dispatcher` option; the
      // standard RequestInit type doesn't expose it so we cast via unknown.
      ...(proxyDispatcher ? ({ dispatcher: proxyDispatcher } as unknown as RequestInit) : {}),
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}
