import { test, expect } from '../fixtures';
import { SettingsPage } from '../../pages/settings.page';
import { HomePage } from '../../pages/home.page';
import { ExecutionPage } from '../../pages/execution.page';
import { getProviderTestConfig, DEFAULT_TASK_TIMEOUT } from '../provider-test-configs';
import type { ResolvedProviderTestConfig, BedrockApiKeySecrets } from '../types';

test.describe('Bedrock API Key Provider E2E', () => {
  let testConfig: ResolvedProviderTestConfig;

  test.beforeEach(async ({}, testInfo) => {
    const config = getProviderTestConfig('bedrock-api-key');
    if (!config) {
      testInfo.skip(true, 'No Bedrock API Key secrets configured');
      return;
    }
    testConfig = config;
  });

  test('connect and complete task', async ({ providerWindow }) => {
    const settings = new SettingsPage(providerWindow);
    const home = new HomePage(providerWindow);
    const execution = new ExecutionPage(providerWindow);
    const secrets = testConfig.secrets as BedrockApiKeySecrets;

    // Navigate to settings and select Bedrock provider
    await settings.navigateToSettings();
    await settings.selectProvider(testConfig.config.providerId);

    // Select the API Key tab (Bedrock has multiple auth methods)
    await settings.selectBedrockApiKeyTab();

    // Disconnect if already connected
    const isAlreadyConnected = await settings.disconnectButton.isVisible();
    if (isAlreadyConnected) {
      await settings.clickDisconnect();
      await providerWindow.waitForTimeout(500);
    }

    // Enter API key
    await settings.enterBedrockApiKey(secrets.apiKey);

    // Select region if specified
    if (secrets.region) {
      await settings.selectBedrockRegion(secrets.region);
    }

    // Connect and verify
    await settings.clickConnect();

    const statusText = await settings.connectionStatus.textContent();
    expect(statusText?.toLowerCase()).toContain('connected');

    // Select model and close settings
    await settings.selectModel(testConfig.modelId);
  
    await settings.doneButton.click();

    await providerWindow.waitForTimeout(1000);

    // Submit task and wait for completion
    await home.enterTask(testConfig.taskPrompt);
    await home.submitButton.click();

    await execution.waitForCompletedSuccessfully(DEFAULT_TASK_TIMEOUT);
  });
});
