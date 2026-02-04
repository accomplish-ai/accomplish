import { test, expect } from '../fixtures';
import { SettingsPage } from '../../pages/settings.page';
import { HomePage } from '../../pages/home.page';
import { ExecutionPage } from '../../pages/execution.page';
import { PROVIDER_TEST_CONFIGS, DEFAULT_TASK_TIMEOUT } from '../provider-test-configs';
import {
  setupOllamaForTests,
  teardownOllama,
  type OllamaSetupResult,
} from '../helpers/ollama-server';

const ollamaConfig = PROVIDER_TEST_CONFIGS.ollama;
const DEFAULT_TASK_PROMPT = "Say 'hello' and nothing else";
test.setTimeout(1200000);
test.describe('Ollama Provider E2E', () => {
  let setupResult: OllamaSetupResult;

  test.beforeAll(async () => {
    setupResult = await setupOllamaForTests({
      serverUrl: ollamaConfig.serverUrl,
      modelId: ollamaConfig.modelSelection.modelId,
    });

    if (!setupResult.success) {
      console.warn(`[ollama] Setup failed: ${setupResult.error}`);
    }
  });

  test.afterAll(async () => {
    await teardownOllama();
  });

  test.beforeEach(async ({}, testInfo) => {
    if (!setupResult.success) {
      testInfo.skip(true, `Ollama setup failed: ${setupResult.error}`);
    }
  });

  test('connect and complete task', async ({ providerWindow }) => {
    const settings = new SettingsPage(providerWindow);
    const home = new HomePage(providerWindow);
    const execution = new ExecutionPage(providerWindow);

    await settings.navigateToSettings();
    await settings.searchProvider('ollama');
    await settings.selectProvider('ollama');

    const isAlreadyConnected = await settings.disconnectButton.isVisible();
    if (isAlreadyConnected) {
      await settings.clickDisconnect();
      await providerWindow.waitForTimeout(500);
    }

    await settings.enterOllamaServerUrl(setupResult.serverUrl);
    await settings.clickConnect();

    // Wait for connection with longer timeout for local server
    await providerWindow.waitForTimeout(2000);

    const statusText = await settings.connectionStatus.textContent({ timeout: 1200000 });
    expect(statusText?.toLowerCase()).toContain('connected');

    // Select model
    if (setupResult.modelId) {
      console.log('Selecting model', setupResult.modelId);

      await settings.selectModel(`ollama/${setupResult.modelId}`);
    } else {
      await settings.selectFirstModel();
    }

    await settings.doneButton.click();
    await providerWindow.waitForTimeout(1000);

    await home.enterTask(DEFAULT_TASK_PROMPT);
    await home.submitButton.click();
    await execution.waitForCompleteReal(DEFAULT_TASK_TIMEOUT);
  });
});
