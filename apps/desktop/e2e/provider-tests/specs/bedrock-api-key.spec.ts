/**
 * E2E test: AWS Bedrock provider with API key authentication.
 *
 * Prerequisites:
 *   - E2E_BEDROCK_API_KEY env var or secrets.json with bedrock-api-key.apiKey
 *   - Optionally E2E_BEDROCK_REGION (defaults to us-east-1)
 *
 * What this test does:
 *   1. Launches app with CLEAN_START (fresh state, no auth skip)
 *   2. Opens settings dialog (onboarding)
 *   3. Selects the Bedrock provider
 *   4. Selects the API Key auth tab
 *   5. Enters the Bedrock API key
 *   6. Optionally selects a region
 *   7. Clicks Connect and waits for connection
 *   8. Closes settings
 *   9. Submits a task and waits for completion
 */

import { test, expect } from '../fixtures';
import { SettingsPage, HomePage, ExecutionPage } from '../../pages';
import { getProviderTestConfig, DEFAULT_TEST_MODELS } from '../provider-test-configs';
import { getTaskPrompt } from '../secrets-loader';
import type { BedrockApiKeySecrets } from '../types';

const config = getProviderTestConfig('bedrock-api-key');

test.describe('Bedrock Provider (API Key)', () => {
  test.skip(!config, 'No Bedrock API Key secrets configured — skipping');

  test('should connect with Bedrock API key and complete a task', async ({ window }) => {
    const secrets = config!.secrets as BedrockApiKeySecrets;
    const settingsPage = new SettingsPage(window);
    const homePage = new HomePage(window);
    const executionPage = new ExecutionPage(window);

    // Step 1: The app should show onboarding (settings dialog)
    await expect(settingsPage.settingsDialog).toBeVisible({ timeout: 15000 });

    // Step 2: Select the Bedrock provider
    await settingsPage.selectProvider('bedrock');

    // Step 3: Select the API Key auth tab
    await settingsPage.selectBedrockApiKeyTab();

    // Step 4: Enter the Bedrock API key
    await settingsPage.enterBedrockApiKey(secrets.apiKey);

    // Step 5: Select region if provided
    if (secrets.region) {
      await settingsPage.selectBedrockRegion(secrets.region);
    }

    // Step 6: Click Connect
    await settingsPage.clickConnect();

    // Step 7: Wait for connection to succeed
    await expect(settingsPage.connectionStatus).toHaveAttribute('data-status', 'connected', {
      timeout: 30000,
    });

    // Step 8: Select a model
    const modelId = config!.modelId || DEFAULT_TEST_MODELS['bedrock-api-key'];
    if (modelId) {
      await settingsPage.selectModel(modelId);
    }

    // Step 9: Close settings
    await settingsPage.closeDialog();

    // Step 10: Submit a task
    const taskPrompt = getTaskPrompt();
    await homePage.enterTask(taskPrompt);
    await homePage.submitTask();

    // Step 11: Wait for the task to complete (real API call)
    await executionPage.waitForCompleteReal(config!.timeout || 180000);

    // Verify it completed (not failed)
    const badgeText = await executionPage.statusBadge.textContent();
    expect(badgeText?.toLowerCase()).toContain('completed');
  });
});
