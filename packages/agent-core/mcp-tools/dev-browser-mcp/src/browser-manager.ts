import { type Browser, type Page } from 'playwright';

const RECOVERABLE_PATTERNS = [
  'econnrefused',
  'econnreset',
  'epipe',
  'enotfound',
  'socket hang up',
  'net::err_',
  'websocket',
  'connection',
  'target closed',
  'session closed',
  'browser closed',
  'fetch failed',
  'connectovercdp',
  'page closed',
  'connection timeout',
  'socket timeout',
  'connect timeout',
  'request aborted',
  'connection aborted',
];

export function isRecoverableConnectionError(error: unknown): boolean {
  const message = String(error).toLowerCase();
  return RECOVERABLE_PATTERNS.some((p) => message.includes(p));
}

export class BrowserManager {
  private browser: Browser | null = null;
  private connectingPromise: Promise<Browser> | null = null;
  private readonly localPageRegistry = new Map<string, Page>();
  private cachedServerMode: string | null = null;

  getBrowser(): Browser | null {
    return this.browser;
  }
  setBrowser(browser: Browser): void {
    this.browser = browser;
  }
  getLocalPageRegistry(): Map<string, Page> {
    return this.localPageRegistry;
  }
  getCachedServerMode(): string | null {
    return this.cachedServerMode;
  }
  setCachedServerMode(mode: string): void {
    this.cachedServerMode = mode;
  }

  async ensureConnected(connect: () => Promise<Browser>): Promise<Browser> {
    if (this.browser && this.browser.isConnected()) return this.browser;

    if (!this.connectingPromise) {
      this.connectingPromise = connect()
        .then((b) => {
          this.browser = b;
          return b;
        })
        .finally(() => {
          this.connectingPromise = null;
        });
    }

    return this.connectingPromise;
  }

  async resetConnection(): Promise<void> {
    // Gracefully close all pages in the local registry before clearing
    const closePromises: Promise<void>[] = [];
    for (const page of this.localPageRegistry.values()) {
      try {
        if (!page.isClosed()) {
          closePromises.push(page.close().catch(() => {}));
        }
      } catch {
        // Ignore errors when closing pages during reset
      }
    }
    await Promise.all(closePromises);
    this.localPageRegistry.clear();
    this.browser = null;
    this.connectingPromise = null;
    this.cachedServerMode = null;
  }

  async clearCachedBrowser(): Promise<void> {
    await this.resetConnection();
  }

  async withConnectionRecovery<T>(
    fn: () => Promise<T>,
    label: string,
    maxAttempts = 2,
    baseDelayMs = 100,
    allowRetry = false,
  ): Promise<T> {
    // Validate maxAttempts
    if (!Number.isFinite(maxAttempts) || maxAttempts <= 0) {
      throw new RangeError(`maxAttempts must be a positive integer, got: ${maxAttempts}`);
    }
    maxAttempts = Math.max(1, Math.floor(maxAttempts));
    let lastError: Error | unknown = undefined;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        if (!allowRetry || !isRecoverableConnectionError(error) || attempt >= maxAttempts - 1) {
          throw error;
        }
        await this.resetConnection();
        await new Promise((r) => setTimeout(r, baseDelayMs * Math.pow(2, attempt)));
        console.error(`[browser-manager] Retrying ${label} after connection error...`);
      }
    }
    throw lastError ?? new Error(`Failed to ${label} (no error captured)`);
  }
}