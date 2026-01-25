import { chromium, type BrowserContext } from 'playwright';
import type { BrowserMode } from './types.js';
import { ensureProfileDir } from './profile.js';
import { isChromiumInstalled, installChromium } from './installer.js';

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
 * Launch mode - launches a new browser instance
 */
export class LaunchModeLauncher implements Launcher {
  readonly name: BrowserMode = 'launch';

  async canUse(): Promise<boolean> {
    return true; // Can always try to launch
  }

  async launch(httpPort: number, cdpPort: number, options: LaunchOptions): Promise<LaunchResult> {
    let context: BrowserContext;
    let usedSystemChrome = false;

    // Try system Chrome first
    try {
      options.onProgress?.('Trying to use system Chrome...');
      const profileDir = ensureProfileDir('chrome');

      context = await chromium.launchPersistentContext(profileDir, {
        headless: options.headless,
        channel: 'chrome',
        ignoreDefaultArgs: ['--enable-automation'],
        args: [
          `--remote-debugging-port=${cdpPort}`,
          '--disable-blink-features=AutomationControlled',
        ],
      });
      usedSystemChrome = true;
      options.onProgress?.('Using system Chrome');
    } catch {
      // Fall back to Playwright Chromium
      options.onProgress?.('System Chrome not available, using Playwright Chromium...');

      // Check if installed
      const installed = await isChromiumInstalled();
      if (!installed) {
        options.onProgress?.('Installing Playwright Chromium (one-time setup)...');
        await installChromium(options.onProgress);
      }

      const profileDir = ensureProfileDir('playwright');
      context = await chromium.launchPersistentContext(profileDir, {
        headless: options.headless,
        ignoreDefaultArgs: ['--enable-automation'],
        args: [
          `--remote-debugging-port=${cdpPort}`,
          '--disable-blink-features=AutomationControlled',
        ],
      });
      options.onProgress?.('Browser launched with Playwright Chromium');
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
      usedSystemChrome,
    };
  }
}
