import { test as base, _electron as electron, ElectronApplication, Page } from '@playwright/test';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Provider E2E test fixtures.
 * Unlike the main fixtures, these do NOT mock auth or tasks.
 * Tests run against real provider APIs.
 */
type ProviderFixtures = {
  /** The Electron application instance */
  providerApp: ElectronApplication;
  /** The main renderer window */
  providerWindow: Page;
};

/**
 * Extended Playwright test with provider E2E fixtures.
 * Each test gets a fresh app instance with CLEAN_START=1 for database isolation.
 * No auth skipping or task mocking - real provider interactions.
 */
export const test = base.extend<ProviderFixtures>({
  providerApp: async ({}, use) => {
    const mainPath = resolve(__dirname, '../../../dist-electron/main/index.js');

    const app = await electron.launch({
      args: [
        mainPath,
        // Disable sandbox in Docker (required for containerized Electron)
        ...(process.env.DOCKER_ENV === '1' ? ['--no-sandbox', '--disable-gpu'] : []),
      ],
      env: {
        ...process.env,
        CLEAN_START: '1', // Fresh database for each test
        NODE_ENV: 'test',
        // NO E2E_SKIP_AUTH - go through real onboarding
        // NO E2E_MOCK_TASK_EVENTS - real API calls
      },
    });

    // Capture main process logs (IPC handlers, etc.)
    app.process().stdout?.on('data', (data) => {
      console.log('[MAIN]', data.toString().trim());
    });
    app.process().stderr?.on('data', (data) => {
      console.error('[MAIN-ERR]', data.toString().trim());
    });

    await use(app);

    // Close app and wait for single-instance lock release
    await app.close();
    await new Promise(resolve => setTimeout(resolve, 2000));
  },

  providerWindow: async ({ providerApp }, use) => {
    // Get the first window
    const window = await providerApp.firstWindow();

    // Wait for page to be fully loaded
    await window.waitForLoadState('load');

    // Wait for React hydration - settings button indicates app is ready
    // This takes longer without auth skip since we're showing the full UI
    await window.waitForSelector('[data-testid="sidebar-settings-button"]', {
      state: 'visible',
      timeout: 30000,
    });

    await use(window);
  },
});

export { expect } from '@playwright/test';
