import { chromium, type Browser, type CDPSession, type Page } from 'playwright';
import { BrowserManager, isRecoverableConnectionError } from './browser-manager.js';
export { isRecoverableConnectionError };

export type ConnectionMode = 'builtin' | 'remote';

export interface BuiltinConnectionConfig {
  mode: 'builtin';
  devBrowserUrl: string;
  taskId: string;
  cdpHeaders?: never;
  cdpEndpoint?: never;
}

export interface RemoteConnectionConfig {
  mode: 'remote';
  cdpEndpoint: string;
  cdpHeaders?: Record<string, string>;
  taskId: string;
  devBrowserUrl?: never;
}

export type ConnectionConfig = BuiltinConnectionConfig | RemoteConnectionConfig;

// ─── Singleton state ────────────────────────────────────────────────────────

// Use buildConfigFromEnv (hoisted function declaration) to avoid TDZ issue
let _config: ConnectionConfig = buildConfigFromEnv();
const _manager = new BrowserManager();

// Cache CDP session promises per page to prevent concurrent creation races
const _cdpSessionCache = new WeakMap<Page, Promise<CDPSession>>();

// ─── Configuration helpers ──────────────────────────────────────────────────

// Pure function: builds config from environment, no side effects
function buildConfigFromEnv(): ConnectionConfig {
  const cdpEndpoint = process.env.CDP_ENDPOINT;
  const taskId = process.env.ACCOMPLISH_TASK_ID || 'default';

  if (cdpEndpoint) {
    const headers: Record<string, string> = {};
    if (process.env.CDP_SECRET) {
      headers['X-CDP-Secret'] = process.env.CDP_SECRET;
    }
    return { mode: 'remote', cdpEndpoint, cdpHeaders: headers, taskId };
  }

  let port = parseInt(process.env.DEV_BROWSER_PORT || '9224', 10);
  if (!Number.isFinite(port) || !Number.isInteger(port) || port < 1 || port > 65535) {
    port = 9224;
  }
  // Use 127.0.0.1 instead of localhost to avoid macOS Local Network permission
  // dialog and ensure IPv4 loopback is used consistently.
  return { mode: 'builtin', devBrowserUrl: `http://127.0.0.1:${port}`, taskId };
}

// Internal helper: async cleanup that propagates errors
async function clearCachedBrowser(): Promise<void> {
  await _manager.clearCachedBrowser();
}

// Read from environment and update singleton config.
// Synchronous so callers at module-load and in tests can read the returned
// ConnectionConfig immediately.  Browser disconnection is fire-and-forget —
// the next tool call will reconnect with the new config.
export function configureFromEnv(): ConnectionConfig {
  const newConfig = buildConfigFromEnv();
  void clearCachedBrowser();
  _config = newConfig;
  return _config;
}

// Update singleton config directly (for testing or runtime reconfiguration).
// Synchronous for the same reason as configureFromEnv.
export function configure(config: ConnectionConfig): void {
  void clearCachedBrowser();
  _config = config;
}

// Reset singleton state (for testing)
export async function resetConnection(): Promise<void> {
  _config = buildConfigFromEnv();
  await _manager.resetConnection();
}

// Page name isolation: always prefix with taskId
export function getFullPageName(pageName?: string): string {
  return `${_config.taskId}-${pageName || 'main'}`;
}

// ─── Public API ─────────────────────────────────────────────────────────────

export function getConnectionMode(): ConnectionMode {
  return _config.mode;
}

export async function ensureConnected(): Promise<Browser> {
  return _manager.ensureConnected(() => connectBrowser(_config));
}

export async function getPage(pageName?: string): Promise<Page> {
  const fullName = getFullPageName(pageName);

  if (_config.mode === 'builtin') {
    return getBuiltinPage(fullName);
  }

  return getRemotePage(fullName);
}

export async function listPages(): Promise<string[]> {
  const prefix = `${_config.taskId}-`;

  if (_config.mode === 'builtin') {
    const url = `${_config.devBrowserUrl}/pages`;
    try {
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Failed to list pages: HTTP ${res.status} at ${url}`);
      }
      const data = (await res.json()) as { pages: string[] };
      return data.pages.filter((n) => n.startsWith(prefix)).map((n) => n.slice(prefix.length));
    } catch (err) {
      throw new Error(
        `Error listing pages from dev-browser at ${url}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // Remote mode: return public page names by stripping the taskId prefix
  return Array.from(_manager.getLocalPageRegistry().keys())
    .filter((n) => n.startsWith(prefix))
    .map((n) => n.slice(prefix.length));
}

export async function closePage(pageName?: string): Promise<boolean> {
  const fullName = getFullPageName(pageName);

  if (_config.mode === 'builtin') {
    const url = `${_config.devBrowserUrl}/pages/${encodeURIComponent(fullName)}`;
    try {
      const res = await fetch(url, { method: 'DELETE' });
      if (!res.ok) {
        console.error(`Failed to close page "${fullName}" via fetch:`, res.status, res.statusText);
        return false;
      }
      return true;
    } catch (err) {
      console.error(`Failed to close page "${fullName}" via fetch:`, err);
      return false;
    }
  }

  const registry = _manager.getLocalPageRegistry();
  const page = registry.get(fullName);
  if (!page) {
    return false;
  }
  try {
    await page.close();
    registry.delete(fullName);
    return true;
  } catch (err) {
    console.error(`Failed to close page "${fullName}":`, err);
    return false;
  }
}

/**
 * Restores and focuses the OS window for the given page.
 * Called when auth/interaction detection requires user to see the browser.
 */
export async function focusPageWindow(pageName?: string): Promise<void> {
  if (_config.mode !== 'builtin') {
    return;
  }
  const fullName = getFullPageName(pageName);
  const url = `${_config.devBrowserUrl}/pages/${encodeURIComponent(fullName)}/focus`;
  await fetch(url, { method: 'POST' }).catch(() => {
    // best-effort — never block the tool call on window management
  });
}

/**
 * Minimizes the OS window for the given page.
 * Called when the user has completed an interaction and the page is no longer auth-gated.
 */
export async function backgroundPageWindow(pageName?: string): Promise<void> {
  if (_config.mode !== 'builtin') {
    return;
  }
  const fullName = getFullPageName(pageName);
  const url = `${_config.devBrowserUrl}/pages/${encodeURIComponent(fullName)}/background`;
  await fetch(url, { method: 'POST' }).catch(() => {
    // best-effort — never block the tool call on window management
  });
}

export async function getCDPSession(pageName?: string): Promise<CDPSession> {
  const page = await getPage(pageName);

  // Return cached promise if available (prevents concurrent creation races)
  const cached = _cdpSessionCache.get(page);
  if (cached) {
    return cached;
  }

  // Create new session promise and cache it immediately
  const context = page.context();
  if (!context) {
    throw new Error('No browser context available for page');
  }

  const sessionPromise = context.newCDPSession(page).then(
    (session) => {
      // Clean up cache entry when page closes
      page.once('close', () => {
        _cdpSessionCache.delete(page);
      });
      return session;
    },
    (error) => {
      // Remove failed promise from cache to allow retry
      _cdpSessionCache.delete(page);
      throw error;
    },
  );

  _cdpSessionCache.set(page, sessionPromise);
  return sessionPromise;
}

// ─── Internal helpers ────────────────────────────────────────────────────────

const BROWSER_CONNECT_MAX_ATTEMPTS = 3;
const BROWSER_CONNECT_RETRY_BASE_MS = 500;

async function connectBrowser(config: ConnectionConfig): Promise<Browser> {
  if (config.mode === 'remote') {
    return chromium.connectOverCDP(config.cdpEndpoint, {
      headers: config.cdpHeaders,
    });
  }

  // Builtin: fetch wsEndpoint from dev-browser HTTP server, then connect via CDP.
  // Retry with backoff to handle the race condition where the HTTP server is still
  // starting up when the first tool call arrives (ENG-1514).
  const infoUrl = `${config.devBrowserUrl}/`;
  let lastError: Error | undefined;
  for (let attempt = 0; attempt < BROWSER_CONNECT_MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(infoUrl, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) {
        throw new Error(`dev-browser health check failed: ${res.status}`);
      }
      const info = (await res.json()) as { wsEndpoint: string };
      if (!info.wsEndpoint) {
        // Chrome not yet launched — treat as a recoverable error so the retry loop
        // waits and tries again (the POST /pages call will trigger launch on first use).
        throw new Error('fetch failed: dev-browser wsEndpoint is empty (browser not ready)');
      }
      // Normalize to 127.0.0.1: Chrome may report "localhost" which resolves to ::1 (IPv6)
      // on macOS Sequoia/Tahoe, causing connectOverCDP to fail with ECONNREFUSED.
      const normalizedEndpoint = info.wsEndpoint.replace(
        /^(wss?:\/\/)localhost(:\d+)/,
        '$1127.0.0.1$2',
      );
      return chromium.connectOverCDP(normalizedEndpoint);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < BROWSER_CONNECT_MAX_ATTEMPTS - 1 && isRecoverableConnectionError(lastError)) {
        const delayMs = BROWSER_CONNECT_RETRY_BASE_MS * Math.pow(2, attempt);
        console.error(
          `[connection] dev-browser server not ready (attempt ${attempt + 1}/${BROWSER_CONNECT_MAX_ATTEMPTS}), retrying in ${delayMs}ms...`,
        );
        await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
      } else {
        break;
      }
    }
  }
  throw lastError ?? new Error('Failed to connect to dev-browser server');
}

async function getBuiltinPage(fullName: string): Promise<Page> {
  const url = `${_config.devBrowserUrl}/pages`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // launchIntent 'background-normal' ensures the page window starts minimized.
    // The in-app screencast preview is the sole visual surface by default.
    body: JSON.stringify({ name: fullName, launchIntent: 'background-normal' }),
  });
  if (!res.ok) {
    throw new Error(`Failed to get page "${fullName}": ${res.status}`);
  }
  const data = (await res.json()) as { wsEndpoint: string; targetId: string };

  const browser = await ensureConnected();
  const contexts = browser.contexts();
  const context = contexts[0];
  if (!context) {
    throw new Error('No browser context available');
  }

  const pages = context.pages();
  // Match by targetId using short-lived CDP sessions.
  // Do NOT use _cdpSessionCache here — this is a one-shot lookup and the session
  // is detached immediately after. Caching then detaching would poison the cache
  // and break all subsequent tool calls for the same page.
  for (const page of pages) {
    if (page.isClosed()) {
      continue;
    }
    let session: CDPSession | undefined;
    try {
      session = await context.newCDPSession(page);
      const { targetInfo } = (await session.send('Target.getTargetInfo')) as {
        targetInfo: { targetId: string };
      };
      if (targetInfo.targetId === data.targetId) {
        return page;
      }
    } catch {
      // try next
    } finally {
      if (session) {
        await session.detach().catch(() => {});
      }
    }
  }
  // Target ID was specified but not found - throw error instead of falling back
  throw new Error(
    `Page "${fullName}" with targetId "${data.targetId}" not found in browser context`,
  );
}

async function getRemotePage(fullName: string): Promise<Page> {
  const registry = _manager.getLocalPageRegistry();
  const existing = registry.get(fullName);
  if (existing && !existing.isClosed()) {
    return existing;
  }

  const browser = await ensureConnected();
  const context = browser.contexts()[0] ?? (await browser.newContext());
  const page = await context.newPage();
  registry.set(fullName, page);
  page.on('close', () => {
    if (registry.get(fullName) === page) {
      registry.delete(fullName);
    }
  });
  return page;
}
