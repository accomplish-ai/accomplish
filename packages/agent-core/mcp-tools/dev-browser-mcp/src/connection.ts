import { chromium, type Browser, type Page } from 'playwright';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ConnectionMode = 'builtin' | 'remote';

export interface ConnectionConfig {
  mode: ConnectionMode;
  /** For 'builtin': the dev-browser HTTP server URL (e.g. http://localhost:9224) */
  devBrowserUrl?: string;
  /** For 'remote': the CDP endpoint URL (e.g. http://localhost:9222 or ws://...) */
  cdpEndpoint?: string;
  /** For 'remote': optional headers for CDP connection (e.g. auth) */
  cdpHeaders?: Record<string, string>;
  /** Task ID for page name isolation */
  taskId: string;
}

// ---------------------------------------------------------------------------
// Shared state
// ---------------------------------------------------------------------------

let browser: Browser | null = null;
let connectingPromise: Promise<Browser> | null = null;
let cachedServerMode: string | null = null;
const localPageRegistry = new Map<string, Page>();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function getConnectionMode(): ConnectionMode {
  return config.mode;
}

export function getCachedServerMode(): string | null {
  return cachedServerMode;
}

export function getBrowser(): Browser | null {
  return browser;
}

let config: ConnectionConfig;

export function configure(cfg: ConnectionConfig): void {
  config = cfg;
}

/**
 * Detect config from environment variables.
 * CDP_ENDPOINT -> remote mode, else -> builtin mode.
 */
export function configureFromEnv(): ConnectionConfig {
  const cdpEndpoint = process.env.CDP_ENDPOINT;
  const taskId = process.env.ACCOMPLISH_TASK_ID || 'default';

  if (cdpEndpoint) {
    const headers: Record<string, string> = {};
    if (process.env.CDP_SECRET) {
      headers['X-CDP-Secret'] = process.env.CDP_SECRET;
    }
    config = { mode: 'remote', cdpEndpoint, cdpHeaders: headers, taskId };
  } else {
    const port = parseInt(process.env.DEV_BROWSER_PORT || '9224', 10);
    config = { mode: 'builtin', devBrowserUrl: `http://localhost:${port}`, taskId };
  }

  return config;
}

export async function ensureConnected(): Promise<Browser> {
  if (browser && browser.isConnected()) {
    return browser;
  }

  if (connectingPromise) {
    return connectingPromise;
  }

  connectingPromise = (async () => {
    try {
      if (config.mode === 'remote') {
        browser = await connectRemote();
      } else {
        browser = await connectBuiltin();
      }
      return browser;
    } finally {
      connectingPromise = null;
    }
  })();

  return connectingPromise;
}

export function getFullPageName(pageName?: string): string {
  const name = pageName || 'main';
  return `${config.taskId}-${name}`;
}

export async function getPage(pageName?: string): Promise<Page> {
  if (config.mode === 'remote') {
    return getPageRemote(pageName);
  }
  return getPageBuiltin(pageName);
}

export async function listPages(): Promise<string[]> {
  if (config.mode === 'remote') {
    return listPagesRemote();
  }
  return listPagesBuiltin();
}

export async function closePage(pageName: string): Promise<boolean> {
  if (config.mode === 'remote') {
    return closePageRemote(pageName);
  }
  return closePageBuiltin(pageName);
}

export function resetConnection(): void {
  browser = null;
  connectingPromise = null;
  cachedServerMode = null;
  localPageRegistry.clear();
}

// ---------------------------------------------------------------------------
// Builtin mode (existing behavior -- talks to dev-browser HTTP server)
// ---------------------------------------------------------------------------

async function fetchWithRetry(
  url: string,
  options?: RequestInit,
  maxRetries = 3,
  baseDelayMs = 100
): Promise<Response> {
  let lastError: Error | null = null;
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch(url, options);
      return res;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const isConnectionError = lastError.message.includes('fetch failed') ||
        lastError.message.includes('ECONNREFUSED') ||
        lastError.message.includes('socket') ||
        lastError.message.includes('UND_ERR');
      if (!isConnectionError || i >= maxRetries - 1) {
        throw lastError;
      }
      const delay = baseDelayMs * Math.pow(2, i) + Math.random() * 50;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError || new Error('fetchWithRetry failed');
}

async function connectBuiltin(): Promise<Browser> {
  const res = await fetchWithRetry(config.devBrowserUrl!);
  if (!res.ok) {
    throw new Error(`Server returned ${res.status}: ${await res.text()}`);
  }
  const info = await res.json() as { wsEndpoint: string; mode?: string };
  cachedServerMode = info.mode || 'normal';
  const b = await chromium.connectOverCDP(info.wsEndpoint);

  // Playwright's connectOverCDP sends Browser.setDownloadBehavior('allowAndName')
  // which hijacks downloads to a temp dir with UUID filenames. Since the MCP server
  // has no page.on('download') handler, this causes downloads to silently disappear.
  // Reset to Chrome's native behavior so downloads go to the user's Downloads folder.
  try {
    const cdpSession = await b.newBrowserCDPSession();
    await cdpSession.send('Browser.setDownloadBehavior', { behavior: 'default' });
    await cdpSession.detach();
  } catch (err) {
    console.error('[dev-browser-mcp] Failed to reset download behavior:', err);
  }

  return b;
}

const DEFAULT_VIEWPORT = { width: 1280, height: 720 };

async function getPageBuiltin(pageName?: string): Promise<Page> {
  const fullName = getFullPageName(pageName);

  const res = await fetchWithRetry(`${config.devBrowserUrl}/pages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: fullName, viewport: DEFAULT_VIEWPORT }),
  });

  if (!res.ok) {
    throw new Error(`Failed to get page: ${await res.text()}`);
  }

  const pageInfo = await res.json() as { targetId: string; url?: string };
  const { targetId } = pageInfo;

  const b = await ensureConnected();

  const isExtensionMode = cachedServerMode === 'extension';
  if (isExtensionMode) {
    const allPages = b.contexts().flatMap((ctx) => ctx.pages());
    if (allPages.length === 0) throw new Error('No pages available in browser');
    if (allPages.length === 1) return allPages[0]!;
    if (pageInfo.url) {
      const matchingPage = allPages.find((p) => p.url() === pageInfo.url);
      if (matchingPage) return matchingPage;
    }
    return allPages[0]!;
  }

  const page = await findPageByTargetId(b, targetId);
  if (!page) {
    throw new Error(`Page "${fullName}" not found in browser contexts`);
  }

  return page;
}

async function listPagesBuiltin(): Promise<string[]> {
  const res = await fetchWithRetry(`${config.devBrowserUrl}/pages`);
  const data = await res.json() as { pages: string[] };
  const taskPrefix = `${config.taskId}-`;
  return data.pages
    .filter((name: string) => name.startsWith(taskPrefix))
    .map((name: string) => name.substring(taskPrefix.length));
}

async function closePageBuiltin(pageName: string): Promise<boolean> {
  const fullName = getFullPageName(pageName);
  const res = await fetchWithRetry(`${config.devBrowserUrl}/pages/${encodeURIComponent(fullName)}`, {
    method: 'DELETE',
  });
  return res.ok;
}

async function findPageByTargetId(b: Browser, targetId: string): Promise<Page | null> {
  for (const context of b.contexts()) {
    for (const page of context.pages()) {
      let cdpSession;
      try {
        cdpSession = await context.newCDPSession(page);
        const { targetInfo } = await cdpSession.send('Target.getTargetInfo');
        if (targetInfo.targetId === targetId) {
          return page;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.includes('Target closed') && !msg.includes('Session closed')) {
          console.warn(`Unexpected error checking page target: ${msg}`);
        }
      } finally {
        if (cdpSession) {
          try { await cdpSession.detach(); } catch {}
        }
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Remote mode (new -- connects to any CDP endpoint, manages pages locally)
// ---------------------------------------------------------------------------

async function connectRemote(): Promise<Browser> {
  const endpoint = config.cdpEndpoint!;
  const options: { headers?: Record<string, string> } = {};
  if (config.cdpHeaders && Object.keys(config.cdpHeaders).length > 0) {
    options.headers = config.cdpHeaders;
  }
  cachedServerMode = 'remote';
  return chromium.connectOverCDP(endpoint, options);
}

async function getPageRemote(pageName?: string): Promise<Page> {
  const fullName = getFullPageName(pageName);

  // Return existing page from local registry
  const existing = localPageRegistry.get(fullName);
  if (existing && !existing.isClosed()) {
    return existing;
  }

  // Create new page via Playwright
  const b = await ensureConnected();
  const context = b.contexts()[0];
  if (!context) {
    throw new Error('No browser context available');
  }

  const page = await context.newPage();
  localPageRegistry.set(fullName, page);

  page.on('close', () => {
    localPageRegistry.delete(fullName);
  });

  return page;
}

function listPagesRemote(): Promise<string[]> {
  const taskPrefix = `${config.taskId}-`;
  const pages = Array.from(localPageRegistry.keys())
    .filter(name => name.startsWith(taskPrefix))
    .filter(name => {
      const page = localPageRegistry.get(name);
      return page && !page.isClosed();
    })
    .map(name => name.substring(taskPrefix.length));
  return Promise.resolve(pages);
}

function closePageRemote(pageName: string): Promise<boolean> {
  const fullName = getFullPageName(pageName);
  const page = localPageRegistry.get(fullName);
  if (!page) return Promise.resolve(false);

  localPageRegistry.delete(fullName);
  if (!page.isClosed()) {
    return page.close().then(() => true);
  }
  return Promise.resolve(true);
}
