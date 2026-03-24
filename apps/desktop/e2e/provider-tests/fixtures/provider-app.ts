/**
 * Playwright fixtures for provider E2E tests.
 *
 * Unlike the standard E2E fixtures, these:
 * - Use CLEAN_START=1 to ensure a fresh state
 * - Do NOT skip auth (no --e2e-skip-auth)
 * - Do NOT mock task events (no --e2e-mock-tasks)
 * - Have longer timeouts for real API calls
 */

import {
  test as base,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

type ProviderTestFixtures = {
  /** The Electron application instance (clean start, no auth skip) */
  electronApp: ElectronApplication;
  /** The main renderer window */
  window: Page;
};

/** Time to wait for single-instance lock release between app launches */
const APP_RESTART_DELAY = 1500;

/** Time to wait for the home screen to appear */
const HOME_SCREEN_TIMEOUT = 30000;

export const test = base.extend<ProviderTestFixtures>({
  // eslint-disable-next-line no-empty-pattern
  electronApp: async ({}, use) => {
    // Pass the app directory (not the compiled entry file) so that
    // app.getAppPath() returns 'apps/desktop/' — needed for correct
    // MCP tool path resolution in getMcpToolsPath().
    const appDir = resolve(__dirname, '../../..');

    const app = await electron.launch({
      args: [
        appDir,
        // No --e2e-skip-auth: we need the real onboarding flow
        // No --e2e-mock-tasks: we need real task execution
        ...(process.env.DOCKER_ENV === '1' ? ['--no-sandbox', '--disable-gpu'] : []),
      ],
      env: {
        ...process.env,
        CLEAN_START: '1',
        NODE_ENV: 'test',
      },
    });

    // Capture main process stdout/stderr for debugging
    const proc = app.process();
    proc.stdout?.on('data', (data: Buffer) => {
      const msg = data.toString().trim();
      if (msg) console.log('[Electron stdout]', msg);
    });
    proc.stderr?.on('data', (data: Buffer) => {
      const msg = data.toString().trim();
      if (msg) console.log('[Electron stderr]', msg);
    });

    await use(app);

    await app.close();
    await new Promise((resolve) => setTimeout(resolve, APP_RESTART_DELAY));
  },

  window: async ({ electronApp }, use) => {
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('load');

    // The app always starts at the Home screen (no auto-opening settings dialog).
    // Wait for the task input to confirm the renderer is fully loaded.
    await window.waitForSelector('[data-testid="task-input-textarea"]', {
      state: 'visible',
      timeout: HOME_SCREEN_TIMEOUT,
    });

    await use(window);
  },
});

export { expect } from '@playwright/test';
