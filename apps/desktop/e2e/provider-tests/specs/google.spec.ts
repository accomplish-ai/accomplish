import { test, expect } from '../fixtures';
import { SettingsPage, HomePage, ExecutionPage } from '../../pages';
import { getProviderTestConfig, DEFAULT_TEST_MODELS } from '../provider-test-configs';
import type { ApiKeySecrets } from '../types';

const config = getProviderTestConfig('google');

test.describe('Google Provider', () => {
  test.skip(!config?.secrets, 'No Google secrets configured — skipping');

  test('should connect with API key and complete a task', async ({ window }) => {
    const secrets = config.secrets as ApiKeySecrets;

    const settingsPage = new SettingsPage(window);
    const homePage = new HomePage(window);
    const executionPage = new ExecutionPage(window);

    // Step 1: Open settings via sidebar
    await settingsPage.navigateToSettings();

    // Step 2: Select the Google provider
    await settingsPage.selectProvider('google');

    // Step 3: Enter the API key
    await settingsPage.enterApiKey(secrets.apiKey);

    // Step 4: Click Connect
    await settingsPage.clickConnect();

    // Step 5: Wait for connection to succeed
    await settingsPage.waitForConnection();

    // Step 6: Select a model
    const modelId = config.modelId || DEFAULT_TEST_MODELS['google'];

    if (modelId) {
      await settingsPage.selectModel(modelId);
    }

    // Step 7: Close settings
    await settingsPage.closeDialog();

    // Step 8: Submit a task
    await homePage.enterTask('Create a plan and mark it as completed.');
    await homePage.submitTask();

    // Step 9: Wait for the task to complete (real API call)
    await executionPage.waitForComplete(config.timeout || 180000);

    // Verify it completed (not failed)
    const badgeText = await executionPage.statusBadge.textContent();

    expect(badgeText?.toLowerCase()).toContain('completed');
  });
});
