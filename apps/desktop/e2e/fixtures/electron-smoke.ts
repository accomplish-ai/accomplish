import { test as base, chromium, Page, Browser } from '@playwright/test';
import { spawn, execSync, type ChildProcess } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CDP_PORT = 19229;
const DESKTOP_DIR = resolve(__dirname, '../..');

/**
 * Kill any running Accomplish/Electron instances to avoid single-instance lock conflicts.
 */
function killExistingInstances(): void {
  try {
    // Kill Electron processes for Accomplish
    execSync('pkill -f "Electron.*Accomplish" 2>/dev/null || true', { stdio: 'ignore' });
    execSync('pkill -f "Accomplish.*Electron" 2>/dev/null || true', { stdio: 'ignore' });
    // Kill anything on the CDP port
    execSync(`lsof -ti:${CDP_PORT} | xargs kill -9 2>/dev/null || true`, { stdio: 'ignore' });
  } catch {
    // Ignore errors — processes may not exist
  }
}

/**
 * Wait for Electron's CDP endpoint to become available.
 */
async function waitForCDP(port: number, timeoutMs = 60_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) return;
    } catch {
      // Not ready yet
    }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error(`CDP not available on port ${port} after ${timeoutMs}ms`);
}

/**
 * Find the main renderer page among all browser contexts/pages.
 * Skips DevTools and empty pages.
 */
async function findRendererPage(browser: Browser, timeoutMs = 60_000): Promise<Page> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    for (const context of browser.contexts()) {
      for (const page of context.pages()) {
        const url = page.url();
        // The renderer in dev mode is served by Vite on localhost
        if (url.includes('localhost') || url.includes('file://')) {
          return page;
        }
      }
    }
    await new Promise(r => setTimeout(r, 500));
  }

  const allUrls = browser.contexts().flatMap(ctx => ctx.pages().map(p => p.url()));
  throw new Error(
    `Could not find renderer page after ${timeoutMs}ms. Found pages: ${JSON.stringify(allUrls)}`
  );
}

/**
 * Custom fixtures for Electron smoke testing via CDP.
 *
 * Kills existing Accomplish instances, spawns `pnpm dev` (real dev mode
 * where MCPs work correctly), connects Playwright via Chrome DevTools
 * Protocol, and runs tests against the live app.
 */
type SmokeFixtures = {
  /** The main renderer window */
  window: Page;
};

export const test = base.extend<SmokeFixtures>({
  window: async ({}, use) => {
    // Kill any existing Accomplish instances (single-instance lock)
    killExistingInstances();
    // Wait for lock file release
    await new Promise(r => setTimeout(r, 2000));

    // Spawn pnpm dev with remote debugging enabled
    const devProcess: ChildProcess = spawn('pnpm', ['dev'], {
      cwd: DESKTOP_DIR,
      env: {
        ...process.env,
        ELECTRON_CDP_PORT: String(CDP_PORT),
      },
      stdio: 'pipe',
    });

    // Log dev process output for debugging
    devProcess.stdout?.on('data', (data: Buffer) => {
      process.stdout.write(`[dev] ${data.toString()}`);
    });
    devProcess.stderr?.on('data', (data: Buffer) => {
      process.stderr.write(`[dev:err] ${data.toString()}`);
    });

    let browser: Browser | undefined;

    try {
      // Wait for CDP to become available
      await waitForCDP(CDP_PORT);

      // Connect Playwright via CDP
      browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`);

      // Find the renderer page (polls until Vite-served page appears)
      const page = await findRendererPage(browser);

      // Wait for React hydration
      await page.waitForSelector('[data-testid="task-input-textarea"]', {
        state: 'visible',
        timeout: 60_000,
      });

      await use(page);
    } finally {
      // Cleanup
      if (browser) {
        await browser.close().catch(() => {});
      }
      devProcess.kill('SIGTERM');
      await new Promise(r => setTimeout(r, 2000));
      if (!devProcess.killed) {
        devProcess.kill('SIGKILL');
      }
    }
  },
});

export { expect } from '@playwright/test';
