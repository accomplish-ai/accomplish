import { test, expect } from '../fixtures';
import { SettingsPage } from '../../pages/settings.page';
import { HomePage } from '../../pages/home.page';
import { ExecutionPage } from '../../pages/execution.page';
import { getProviderTestConfig, DEFAULT_TASK_TIMEOUT } from '../provider-test-configs';
import type { ResolvedProviderTestConfig, ApiKeySecrets } from '../types';

test.describe('Google Provider E2E', () => {
  let testConfig: ResolvedProviderTestConfig;

  test.beforeEach(async ({}, testInfo) => {
    const config = getProviderTestConfig('google');
    if (!config) {
      testInfo.skip(true, 'No Google secrets configured');
      return;
    }
    testConfig = config;
  });

  test('connect and complete task', async ({ providerWindow }) => {
    const settings = new SettingsPage(providerWindow);
    const home = new HomePage(providerWindow);
    const execution = new ExecutionPage(providerWindow);
    const secrets = testConfig.secrets as ApiKeySecrets;

    await settings.navigateToSettings();
    await settings.selectProvider(testConfig.config.providerId);

    const isAlreadyConnected = await settings.disconnectButton.isVisible();
    if (isAlreadyConnected) {
      await settings.clickDisconnect();
      await providerWindow.waitForTimeout(500);
    }

    await settings.enterApiKey(secrets.apiKey);
    await settings.clickConnect();

    const statusText = await settings.connectionStatus.textContent();
    expect(statusText?.toLowerCase()).toContain('connected');

    await settings.selectModel(testConfig.modelId);
    await settings.doneButton.click();
    await providerWindow.waitForTimeout(1000);

    await home.enterTask(testConfig.taskPrompt);
    await home.submitButton.click();
    await execution.waitForCompletedSuccessfully(DEFAULT_TASK_TIMEOUT);
  });
});
