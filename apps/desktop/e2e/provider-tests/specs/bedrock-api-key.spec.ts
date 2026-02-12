import { test, expect } from '../fixtures';
import { SettingsPage, HomePage, ExecutionPage } from '../../pages';
import { getProviderTestConfig } from '../provider-test-configs';
import type { BedrockApiKeySecrets } from '../types';

const config = getProviderTestConfig('bedrock-api-key');

test.describe('Bedrock Provider (API Key)', () => {
  test.skip(!config?.secrets, 'No Bedrock API Key secrets configured — skipping');

  test('should connect with Bedrock API key and complete a task', async ({ window }) => {
    // Runtime guard for TypeScript narrowing (test.skip doesn't narrow)
    if (!config?.secrets || !('apiKey' in config.secrets)) return;
    const secrets = config.secrets as BedrockApiKeySecrets;

    const settingsPage = new SettingsPage(window);
    const homePage = new HomePage(window);
    const executionPage = new ExecutionPage(window);

    // Step 1: Open settings via sidebar
    await settingsPage.navigateToSettings();

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
    await settingsPage.waitForConnection();

    // Step 8: Select a model (Bedrock uses 'first' since available models depend on region)
    await settingsPage.selectFirstModel();

    // Step 9: Close settings
    await settingsPage.closeDialog();

    // Step 10: Submit a task
    await homePage.enterTask('What is 2 + 2? Reply with just the number.');
    await homePage.submitTask();

    // Step 11: Wait for the task to complete (real API call)
    await executionPage.waitForComplete(config.timeout || 180000);

    // Verify it completed (not failed)
    const badgeText = await executionPage.statusBadge.textContent();
    expect(badgeText?.toLowerCase()).toContain('completed');
  });
});
