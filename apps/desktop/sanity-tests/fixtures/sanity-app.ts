// apps/desktop/sanity-tests/fixtures/sanity-app.ts
import { test as base, _electron as electron, ElectronApplication, Page } from '@playwright/test';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import type { SanityModel } from '../utils/models';
import { getApiKeyForModel } from '../utils/models';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Timeout constants for sanity tests
export const SANITY_TIMEOUTS = {
  APP_LAUNCH: 30000,
  HYDRATION: 15000,
  TASK_COMPLETE: 300000, // 5 minutes for agent work
  APP_RESTART: 2000,
} as const;

/**
 * Fixtures for sanity testing with real API calls.
 */
type SanityFixtures = {
  /** The Electron application instance */
  electronApp: ElectronApplication;
  /** The main renderer window */
  window: Page;
  /** Current model being tested (set per-test) */
  currentModel: SanityModel;
};

/**
 * Extended Playwright test with sanity fixtures.
 * NO MOCKS - uses real API calls.
 */
export const test = base.extend<SanityFixtures>({
  currentModel: [async ({}, use) => {
    // This will be overridden in test files
    throw new Error('currentModel must be set in test');
  }, { option: true }],

  electronApp: async ({ currentModel }, use) => {
    const mainPath = resolve(__dirname, '../../dist-electron/main/index.js');
    const apiKey = getApiKeyForModel(currentModel);

    // Launch WITHOUT mock flags - real API calls
    const app = await electron.launch({
      args: [
        mainPath,
        '--e2e-skip-auth', // Skip onboarding UI but still use real keys
      ],
      env: {
        ...process.env,
        E2E_SKIP_AUTH: '1',
        // NO E2E_MOCK_TASK_EVENTS - we want real execution
        NODE_ENV: 'test',
        // Pass the API key for the current model
        [`${currentModel.envKeyName}`]: apiKey,
      },
    });

    await use(app);

    await app.close();
    await new Promise(resolve => setTimeout(resolve, SANITY_TIMEOUTS.APP_RESTART));
  },

  window: async ({ electronApp }, use) => {
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('load');

    // Wait for React hydration
    await window.waitForSelector('[data-testid="task-input-textarea"]', {
      state: 'visible',
      timeout: SANITY_TIMEOUTS.HYDRATION,
    });

    await use(window);
  },
});

export { expect } from '@playwright/test';
