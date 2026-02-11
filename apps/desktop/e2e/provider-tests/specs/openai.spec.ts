/**
 * E2E test: OpenAI provider with real API key.
 *
 * Prerequisites:
 *   - E2E_OPENAI_API_KEY env var or secrets.json with openai.apiKey
 *
 * What this test does:
 *   1. Launches app with CLEAN_START (fresh state, no auth skip)
 *   2. Opens settings via sidebar button
 *   3. Selects the OpenAI provider
 *   4. Enters the real API key
 *   5. Clicks Connect and waits for connection
 *   6. Selects a model
 *   7. Closes settings
 *   8. Submits a task and waits for completion
 */

import { test, expect } from '../fixtures';
import { SettingsPage, HomePage, ExecutionPage } from '../../pages';
import {
  getProviderTestConfig,
  DEFAULT_TEST_MODELS,
} from '../provider-test-configs';

const config = getProviderTestConfig('openai');

test.describe('OpenAI Provider', () => {
  test.skip(!config?.secrets, 'No OpenAI secrets configured — skipping');

  test('should connect with API key and complete a task', async ({ window }) => {
    if (!config?.secrets || !('apiKey' in config.secrets)) return;

    const settingsPage = new SettingsPage(window);
    const homePage = new HomePage(window);
    const executionPage = new ExecutionPage(window);

    // Step 1: Open settings via sidebar
    await settingsPage.navigateToSettings();

    // Step 2: Select the OpenAI provider
    await settingsPage.selectProvider('openai');

    // Step 3: Enter the API key
    await settingsPage.enterApiKey(config.secrets.apiKey);

    // Step 4: Click Connect
    await settingsPage.clickConnect();

    // Step 5: Wait for connection to succeed
    await settingsPage.waitForConnection();

    // Step 6: Select a model
    const modelId = config.modelId || DEFAULT_TEST_MODELS['openai'];
    if (modelId) {
      await settingsPage.selectModel(modelId);
    }

    // Step 7: Close settings
    await settingsPage.closeDialog();

    // Step 8: Submit a task
    await homePage.enterTask('What is 2 + 2? Reply with just the number.');
    await homePage.submitTask();

    // Step 9: Wait for the task to complete (real API call)
    await executionPage.waitForComplete(config.timeout || 180000);

    // Verify it completed (not failed)
    const badgeText = await executionPage.statusBadge.textContent();
    expect(badgeText?.toLowerCase()).toContain('completed');
  });
});
