import type { Browser, Page } from 'playwright';

const DEFAULT_RECOVERY_MAX_ATTEMPTS = 2;
const DEFAULT_RECOVERY_BASE_DELAY_MS = 100;

const RECOVERABLE_CONNECTION_PATTERNS: RegExp[] = [
  /fetch failed/i,
  /\bECONNREFUSED\b/i,
  /\bECONNRESET\b/i,
  /\bUND_ERR\b/i,
  /\bsocket\b/i,
  /connectovercdp/i,
  /\bwebsocket\b/i,
  /Target closed/i,
  /Session closed/i,
  /Page closed/i,
];

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isRecoverableConnectionError(error: unknown): boolean {
  const message = toErrorMessage(error);
  return RECOVERABLE_CONNECTION_PATTERNS.some((pattern) => pattern.test(message));
}

export interface BrowserManagerOptions {
  maxRecoveryAttempts?: number;
  recoveryBaseDelayMs?: number;
}

export class BrowserManager {
  private browser: Browser | null = null;
  private connectingPromise: Promise<Browser> | null = null;
  private cachedServerMode: string | null = null;
  private localPageRegistry = new Map<string, Page>();

  private readonly maxRecoveryAttempts: number;
  private readonly recoveryBaseDelayMs: number;

  constructor(options: BrowserManagerOptions = {}) {
    this.maxRecoveryAttempts = options.maxRecoveryAttempts ?? DEFAULT_RECOVERY_MAX_ATTEMPTS;
    this.recoveryBaseDelayMs = options.recoveryBaseDelayMs ?? DEFAULT_RECOVERY_BASE_DELAY_MS;
  }

  getBrowser(): Browser | null {
    return this.browser;
  }

  setBrowser(browser: Browser | null): void {
    this.browser = browser;
  }

  getCachedServerMode(): string | null {
    return this.cachedServerMode;
  }

  setCachedServerMode(mode: string | null): void {
    this.cachedServerMode = mode;
  }

  getLocalPageRegistry(): Map<string, Page> {
    return this.localPageRegistry;
  }

  resetConnection(): void {
    this.clearConnectionState();
  }

  async ensureConnected(connect: () => Promise<Browser>): Promise<Browser> {
    if (this.browser && this.browser.isConnected()) {
      return this.browser;
    }

    // Drop stale browser references before attempting a fresh connection.
    if (this.browser && !this.browser.isConnected()) {
      this.browser = null;
    }

    if (this.connectingPromise) {
      return this.connectingPromise;
    }

    this.connectingPromise = (async () => {
      try {
        const connected = await this.withConnectionRecovery(connect, 'ensureConnected');
        this.browser = connected;
        return connected;
      } finally {
        this.connectingPromise = null;
      }
    })();

    return this.connectingPromise;
  }

  async withConnectionRecovery<T>(operation: () => Promise<T>, context: string): Promise<T> {
    let lastError: unknown = null;

    for (let attempt = 0; attempt < this.maxRecoveryAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;

        if (!isRecoverableConnectionError(error) || attempt >= this.maxRecoveryAttempts - 1) {
          throw error;
        }

        const retryNumber = attempt + 1;
        const errorMessage = toErrorMessage(error);
        console.error(
          `[dev-browser-mcp] ${context} failed with recoverable connection error. ` +
            `Resetting connection and attempting retry ` +
            `(attempt ${retryNumber} of ${this.maxRecoveryAttempts - 1}): ${errorMessage}`,
        );

        this.clearConnectionState({ preserveConnectingPromise: true });
        const backoffMs = this.recoveryBaseDelayMs * Math.pow(2, attempt) + Math.random() * 50;
        await delay(backoffMs);
      }
    }

    throw lastError instanceof Error ? lastError : new Error(toErrorMessage(lastError));
  }

  private clearConnectionState(options?: { preserveConnectingPromise?: boolean }): void {
    this.browser = null;
    if (!options?.preserveConnectingPromise) {
      this.connectingPromise = null;
    }
    this.cachedServerMode = null;
    this.localPageRegistry.clear();
  }
}
