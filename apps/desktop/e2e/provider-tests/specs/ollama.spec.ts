/**
 * E2E test: Ollama provider with local server.
 *
 * Prerequisites:
 *   - Ollama server running (default: http://localhost:11434)
 *   - Optionally E2E_OLLAMA_SERVER_URL and E2E_OLLAMA_MODEL_ID
 *
 * What this test does:
 *   1. Verifies Ollama is running and pulls the test model if needed
 *   2. Launches app with CLEAN_START (fresh state, no auth skip)
 *   3. Opens settings dialog (onboarding)
 *   4. Selects the Ollama provider
 *   5. Enters the server URL
 *   6. Clicks Connect and waits for connection
 *   7. Selects a model
 *   8. Closes settings
 *   9. Submits a task and waits for completion
 */

import { test, expect } from '../fixtures';
import { SettingsPage, HomePage, ExecutionPage } from '../../pages';
import { getProviderTestConfig } from '../provider-test-configs';
import { getTaskPrompt } from '../secrets-loader';
import { setupOllamaForTests, teardownOllama } from '../helpers/ollama-server';
import type { OllamaSecrets } from '../types';

const config = getProviderTestConfig('ollama');

test.describe('Ollama Provider', () => {
  test.skip(!config, 'No Ollama secrets configured — skipping');

  let ollamaServerUrl: string;
  let ollamaModelId: string;

  // Ollama tests may need extra time for model pulling + local inference
  test.setTimeout(600000); // 10 minutes

  test.beforeAll(async () => {
    if (!config) return;
    const secrets = config.secrets as OllamaSecrets;
    const setup = await setupOllamaForTests(secrets);
    ollamaServerUrl = setup.serverUrl;
    ollamaModelId = setup.modelId;
  });

  test.afterAll(async () => {
    await teardownOllama();
  });

  test('should connect to Ollama and complete a task', async ({ window }) => {
    const settingsPage = new SettingsPage(window);
    const homePage = new HomePage(window);
    const executionPage = new ExecutionPage(window);

    // Step 1: The app should show onboarding (settings dialog)
    await expect(settingsPage.settingsDialog).toBeVisible({ timeout: 15000 });

    // Step 2: Select the Ollama provider — may need to scroll/show-all
    await settingsPage.toggleShowAll();
    await settingsPage.selectProvider('ollama');

    // Step 3: Enter the server URL
    await settingsPage.enterOllamaServerUrl(ollamaServerUrl);

    // Step 4: Click Connect
    await settingsPage.clickConnect();

    // Step 5: Wait for connection to succeed
    // Ollama connection also fetches models, so allow extra time
    await expect(settingsPage.connectionStatus).toHaveAttribute('data-status', 'connected', {
      timeout: 60000,
    });

    // Step 6: Select the first available model
    // Ollama uses a custom SearchableSelect, so we use selectFirstModel
    await settingsPage.selectFirstModel();

    // Step 7: Close settings
    await settingsPage.closeDialog();

    // Step 8: Submit a task
    const taskPrompt = getTaskPrompt();
    await homePage.enterTask(taskPrompt);
    await homePage.submitTask();

    // Step 9: Wait for the task to complete (local inference may be slow)
    await executionPage.waitForCompleteReal(config!.timeout || 300000);

    // Verify it completed (not failed)
    const badgeText = await executionPage.statusBadge.textContent();
    expect(badgeText?.toLowerCase()).toContain('completed');
  });
});
