import { test, expect } from '../fixtures';
import { SettingsPage, HomePage, ExecutionPage } from '../../pages';
import { getProviderTestConfig } from '../provider-test-configs';
import { OllamaTestDriver, isOllamaInstalled } from '../helpers/ollama-server';

const config = getProviderTestConfig('ollama');

// Ollama doesn't require API key secrets — it just needs a reachable server.
// Skip only when there's no env var pointing to a remote server AND no local install.
const ollamaAvailable = !!process.env.E2E_OLLAMA_SERVER_URL || isOllamaInstalled();

test.describe('Ollama Provider', () => {
  test.skip(!ollamaAvailable, 'Ollama not available — skipping');

  // OllamaTestDriver handles undefined secrets with sensible defaults
  const ollama = new OllamaTestDriver(config?.secrets as { serverUrl?: string; modelId?: string });

  // Ollama tests may need extra time for model pulling + local inference
  test.setTimeout(600000); // 10 minutes

  test.beforeAll(ollama.beforeAll);
  test.afterAll(ollama.afterAll);

  test('should connect to Ollama and complete a task', async ({ window }) => {
    const settingsPage = new SettingsPage(window);
    const homePage = new HomePage(window);
    const executionPage = new ExecutionPage(window);

    await settingsPage.navigateToSettings();

    await settingsPage.toggleShowAll();
    await settingsPage.selectProvider('ollama');

    await settingsPage.enterOllamaServerUrl(ollama.serverUrl);

    await settingsPage.clickConnect();

    // Ollama connection also fetches models, so allow extra time
    await settingsPage.waitForConnection(60000);

    await settingsPage.selectFirstModel();

    await settingsPage.closeDialog();

    await homePage.enterTask('What is 2 + 2? Reply with just the number.');
    await homePage.submitTask();

    await executionPage.waitForComplete(config?.timeout || 300000);
    const badgeText = await executionPage.statusBadge.textContent();
    expect(badgeText?.toLowerCase()).toContain('completed');
  });
});
