/**
 * E2E test: OpenAI provider with real API key.
 *
 * Prerequisites:
 *   - E2E_OPENAI_API_KEY env var or secrets.json with openai.apiKey
 *
 * What this test does:
 *   1. Launches app with CLEAN_START (fresh state, no auth skip)
 *   2. Opens settings dialog (onboarding)
 *   3. Selects the OpenAI provider
 *   4. Enters the real API key
 *   5. Clicks Connect and waits for connection
 *   6. Selects a model
 *   7. Closes settings
 *   8. Submits a task and waits for completion
 */

import { test, expect } from '../fixtures';
import { SettingsPage, HomePage, ExecutionPage } from '../../pages';
import { getProviderTestConfig, DEFAULT_TEST_MODELS } from '../provider-test-configs';
import { getTaskPrompt } from '../secrets-loader';
import type { ApiKeySecrets } from '../types';

const config = getProviderTestConfig('openai');

test.describe('OpenAI Provider', () => {
  test.skip(!config, 'No OpenAI secrets configured — skipping');

  test('should connect with API key and complete a task', async ({ window }) => {
    const secrets = config!.secrets as ApiKeySecrets;
    const settingsPage = new SettingsPage(window);
    const homePage = new HomePage(window);
    const executionPage = new ExecutionPage(window);

    // Step 1: The app should show onboarding (settings dialog)
    await expect(settingsPage.settingsDialog).toBeVisible({ timeout: 15000 });

    // Step 2: Select the OpenAI provider
    await settingsPage.selectProvider('openai');

    // Step 3: Enter the API key
    await settingsPage.enterApiKey(secrets.apiKey);

    // Step 4: Click Connect
    await settingsPage.clickConnect();

    // Step 5: Wait for connection to succeed
    await expect(settingsPage.connectionStatus).toHaveAttribute('data-status', 'connected', {
      timeout: 30000,
    });

    // Step 6: Select a model
    const modelId = config!.modelId || DEFAULT_TEST_MODELS['openai'];
    if (modelId) {
      // The model ID in the selector is the full ID (e.g., 'openai/gpt-4o-mini')
      // but we need to match what the provider returns
      await settingsPage.selectModel(modelId);
    }

    // Step 7: Close settings
    await settingsPage.closeDialog();

    // Step 8: Submit a task
    const taskPrompt = getTaskPrompt();
    await homePage.enterTask(taskPrompt);
    await homePage.submitTask();

    // Step 9: Wait for the task to complete (real API call)
    await executionPage.waitForCompleteReal(config!.timeout || 180000);

    // Verify it completed (not failed)
    const badgeText = await executionPage.statusBadge.textContent();
    expect(badgeText?.toLowerCase()).toContain('completed');
  });
});
