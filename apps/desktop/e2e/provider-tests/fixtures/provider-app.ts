/**
 * Playwright fixtures for provider E2E tests.
 *
 * Unlike the standard E2E fixtures, these:
 * - Use CLEAN_START=1 to ensure a fresh state
 * - Do NOT skip auth (no --e2e-skip-auth)
 * - Do NOT mock task events (no --e2e-mock-tasks)
 * - Have longer timeouts for real API calls
 */

import { test as base, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
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

/** Time to wait for the onboarding screen to appear */
const ONBOARDING_TIMEOUT = 15000;

export const test = base.extend<ProviderTestFixtures>({
  electronApp: async ({}, use) => {
    const mainPath = resolve(__dirname, '../../../dist-electron/main/index.js');

    const app = await electron.launch({
      args: [
        mainPath,
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

    await use(app);

    await app.close();
    await new Promise(resolve => setTimeout(resolve, APP_RESTART_DELAY));
  },

  window: async ({ electronApp }, use) => {
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('load');

    // In provider tests, the first screen is the onboarding/settings dialog
    // Wait for either the settings dialog or the task input to appear
    await window.waitForFunction(
      () => {
        const settingsDialog = document.querySelector('[data-testid="settings-dialog"]');
        const taskInput = document.querySelector('[data-testid="task-input-textarea"]');
        return settingsDialog !== null || taskInput !== null;
      },
      { timeout: ONBOARDING_TIMEOUT }
    );

    await use(window);
  },
});

export { expect } from '@playwright/test';
