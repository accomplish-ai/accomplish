import { chromium, type BrowserContext } from 'playwright';
import { existsSync } from 'fs';
import type { BrowserMode } from './types.js';
import { ensureProfileDir } from './profile.js';

export interface LaunchOptions {
  headless: boolean;
  onProgress?: (message: string) => void;
}

export interface LaunchResult {
  context: BrowserContext;
  wsEndpoint: string;
  usedSystemChrome: boolean;
}

export interface Launcher {
  name: BrowserMode;
  canUse(): Promise<boolean>;
  launch(httpPort: number, cdpPort: number, options: LaunchOptions): Promise<LaunchResult>;
}

/**
 * Chrome not found error with verbose debugging info
 */
export class ChromeNotFoundError extends Error {
  constructor(public readonly searchedPaths: string[]) {
    super(
      `Chrome browser not found. Searched paths:\n${searchedPaths.map(p => `  - ${p}`).join('\n')}\n\n` +
      `Please install Google Chrome from https://google.com/chrome and restart the app.`
    );
    this.name = 'ChromeNotFoundError';
  }
}

/**
 * Get platform-specific Chrome installation paths
 */
function getChromePaths(): string[] {
  const platform = process.platform;
  switch (platform) {
    case 'darwin':
      return [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Chromium.app/Contents/MacOS/Chromium',
      ];
    case 'win32':
      return [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      ];
    case 'linux':
      return [
        '/usr/bin/google-chrome',
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
      ];
    default:
      return [];
  }
}

/**
 * Check if Chrome is installed
 */
function isChromeInstalled(): boolean {
  const paths = getChromePaths();
  return paths.some(path => existsSync(path));
}

/**
 * Launch mode - launches a new browser instance
 */
export class LaunchModeLauncher implements Launcher {
  readonly name: BrowserMode = 'launch';

  async canUse(): Promise<boolean> {
    return true; // Can always try to launch
  }

  async launch(httpPort: number, cdpPort: number, options: LaunchOptions): Promise<LaunchResult> {
    // Pre-check: Verify Chrome is installed before attempting launch
    if (!isChromeInstalled()) {
      throw new ChromeNotFoundError(getChromePaths());
    }

    options.onProgress?.('Launching Chrome...');
    const profileDir = ensureProfileDir('chrome');

    let context: BrowserContext;
    try {
      context = await chromium.launchPersistentContext(profileDir, {
        headless: options.headless,
        channel: 'chrome',
        ignoreDefaultArgs: ['--enable-automation'],
        args: [
          `--remote-debugging-port=${cdpPort}`,
          '--disable-blink-features=AutomationControlled',
        ],
      });
      options.onProgress?.('Chrome launched successfully');
    } catch (error) {
      // If Playwright fails to launch Chrome, throw ChromeNotFoundError with detailed paths
      if (error instanceof Error) {
        const errorMsg = error.message.toLowerCase();
        const isNotFoundError =
          (errorMsg.includes('executable') && errorMsg.includes('doesn\'t exist')) ||
          (errorMsg.includes('browser') && errorMsg.includes('not found')) ||
          (errorMsg.includes('looks like') && errorMsg.includes('not installed'));

        if (isNotFoundError) {
          throw new ChromeNotFoundError(getChromePaths());
        }
      }
      // Re-throw original error if it's not a Chrome-not-found issue
      throw error;
    }

    // Get CDP WebSocket endpoint (with retry for browser startup)
    let wsEndpoint: string | undefined;
    for (let attempt = 0; attempt < 10; attempt++) {
      try {
        const cdpResponse = await fetch(`http://127.0.0.1:${cdpPort}/json/version`);
        const cdpInfo = (await cdpResponse.json()) as { webSocketDebuggerUrl: string };
        wsEndpoint = cdpInfo.webSocketDebuggerUrl;
        break;
      } catch {
        if (attempt === 9) {
          throw new Error(`CDP endpoint not ready after 10 attempts on port ${cdpPort}`);
        }
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    return {
      context,
      wsEndpoint: wsEndpoint!,
      usedSystemChrome: true,
    };
  }
}
