import { test, expect } from '../fixtures';
import { SettingsPage, HomePage, ExecutionPage } from '../pages';
import { captureForAI } from '../utils';
import { TEST_TIMEOUTS, TEST_SCENARIOS } from '../config';

test.describe('Settings Dialog', () => {
  test('should open settings dialog when clicking settings button', async ({ window }) => {
    const settingsPage = new SettingsPage(window);

    // Fixture already handles hydration, just ensure DOM is ready
    await window.waitForLoadState('domcontentloaded');

    // Click the settings button in sidebar
    await settingsPage.navigateToSettings();

    // Capture settings dialog
    await captureForAI(
      window,
      'settings-dialog',
      'dialog-open',
      [
        'Settings dialog is visible',
        'Dialog contains settings sections',
        'User can interact with settings'
      ]
    );

    // Verify dialog opened by checking for model select
    await expect(settingsPage.modelSelect).toBeVisible({ timeout: TEST_TIMEOUTS.NAVIGATION });
  });

  test('should display model selection dropdown', async ({ window }) => {
    const settingsPage = new SettingsPage(window);

    // Fixture already handles hydration, just ensure DOM is ready
    await window.waitForLoadState('domcontentloaded');

    // Open settings dialog
    await settingsPage.navigateToSettings();

    // Verify model select is visible
    await expect(settingsPage.modelSelect).toBeVisible({ timeout: TEST_TIMEOUTS.NAVIGATION });

    // Capture model section
    await captureForAI(
      window,
      'settings-dialog',
      'model-section',
      [
        'Model selection dropdown is visible',
        'Model options are available',
        'User can select a model'
      ]
    );
  });

  test('should display API key input', async ({ window }) => {
    const settingsPage = new SettingsPage(window);

    // Fixture already handles hydration, just ensure DOM is ready
    await window.waitForLoadState('domcontentloaded');

    // Open settings dialog
    await settingsPage.navigateToSettings();

    // Scroll to API key section if needed
    await settingsPage.apiKeyInput.scrollIntoViewIfNeeded();

    // Verify API key input is visible
    await expect(settingsPage.apiKeyInput).toBeVisible({ timeout: TEST_TIMEOUTS.NAVIGATION });

    // Capture API key section
    await captureForAI(
      window,
      'settings-dialog',
      'api-key-section',
      [
        'API key input is visible',
        'User can enter an API key',
        'Input is accessible'
      ]
    );
  });

  test('should allow typing in API key input', async ({ window }) => {
    const settingsPage = new SettingsPage(window);

    // Fixture already handles hydration, just ensure DOM is ready
    await window.waitForLoadState('domcontentloaded');

    // Open settings dialog
    await settingsPage.navigateToSettings();

    // Scroll to API key input
    await settingsPage.apiKeyInput.scrollIntoViewIfNeeded();

    // Type in API key input
    const testKey = 'sk-ant-test-key-12345';
    await settingsPage.apiKeyInput.fill(testKey);

    // Verify value was entered
    await expect(settingsPage.apiKeyInput).toHaveValue(testKey);

    // Capture filled state
    await captureForAI(
      window,
      'settings-dialog',
      'api-key-filled',
      [
        'API key input has value',
        'Input accepts text entry',
        'Value is correctly displayed'
      ]
    );
  });

  test('should display debug mode toggle', async ({ window }) => {
    const settingsPage = new SettingsPage(window);

    // Fixture already handles hydration, just ensure DOM is ready
    await window.waitForLoadState('domcontentloaded');

    // Open settings dialog
    await settingsPage.navigateToSettings();

    // Scroll to debug toggle
    await settingsPage.debugModeToggle.scrollIntoViewIfNeeded();

    // Verify debug toggle is visible
    await expect(settingsPage.debugModeToggle).toBeVisible({ timeout: TEST_TIMEOUTS.NAVIGATION });

    // Capture debug section
    await captureForAI(
      window,
      'settings-dialog',
      'debug-section',
      [
        'Debug mode toggle is visible',
        'Toggle is clickable',
        'Developer settings are accessible'
      ]
    );
  });

  test('should allow toggling debug mode', async ({ window }) => {
    const settingsPage = new SettingsPage(window);

    // Fixture already handles hydration, just ensure DOM is ready
    await window.waitForLoadState('domcontentloaded');

    // Open settings dialog
    await settingsPage.navigateToSettings();

    // Scroll to debug toggle
    await settingsPage.debugModeToggle.scrollIntoViewIfNeeded();

    // Capture initial state
    await captureForAI(
      window,
      'settings-dialog',
      'debug-before-toggle',
      [
        'Debug toggle in initial state',
        'Toggle is ready to click'
      ]
    );

    // Click toggle - state change is immediate in React
    await settingsPage.toggleDebugMode();

    // Capture toggled state
    await captureForAI(
      window,
      'settings-dialog',
      'debug-after-toggle',
      [
        'Debug toggle state changed',
        'UI reflects new state'
      ]
    );
  });

  test('should close dialog when pressing Escape', async ({ window }) => {
    const settingsPage = new SettingsPage(window);

    // Fixture already handles hydration, just ensure DOM is ready
    await window.waitForLoadState('domcontentloaded');

    // Open settings dialog
    await settingsPage.navigateToSettings();

    // Verify dialog is open
    await expect(settingsPage.modelSelect).toBeVisible({ timeout: TEST_TIMEOUTS.NAVIGATION });

    // Press Escape to close dialog - expect handles the wait
    await window.keyboard.press('Escape');

    // Verify dialog closed (model select should not be visible)
    await expect(settingsPage.modelSelect).not.toBeVisible({ timeout: TEST_TIMEOUTS.NAVIGATION });

    // Capture closed state
    await captureForAI(
      window,
      'settings-dialog',
      'dialog-closed',
      [
        'Dialog is closed',
        'Main app is visible again',
        'Settings are no longer shown'
      ]
    );
  });

  test('should display DeepSeek as a provider option', async ({ window }) => {
    const settingsPage = new SettingsPage(window);

    // Navigate to settings
    await window.waitForLoadState('domcontentloaded');
    await settingsPage.navigateToSettings();

    // Verify DeepSeek provider button is visible
    const deepseekButton = settingsPage.getProviderButton('DeepSeek');
    await expect(deepseekButton).toBeVisible({ timeout: TEST_TIMEOUTS.NAVIGATION });

    // Capture provider selection area
    await captureForAI(
      window,
      'settings-dialog',
      'deepseek-provider-visible',
      [
        'DeepSeek provider is visible in settings',
        'Provider button can be clicked',
        'User can select DeepSeek as their provider'
      ]
    );
  });

  test('should allow selecting DeepSeek provider and entering API key', async ({ window }) => {
    const settingsPage = new SettingsPage(window);

    // Navigate to settings
    await window.waitForLoadState('domcontentloaded');
    await settingsPage.navigateToSettings();

    // Click DeepSeek provider
    await settingsPage.selectProvider('DeepSeek');

    // Enter API key
    const testKey = 'sk-deepseek-test-key-12345';
    await settingsPage.apiKeyInput.fill(testKey);

    // Verify value was entered
    await expect(settingsPage.apiKeyInput).toHaveValue(testKey);

    // Capture filled state
    await captureForAI(
      window,
      'settings-dialog',
      'deepseek-api-key-filled',
      [
        'DeepSeek provider is selected',
        'API key input accepts DeepSeek key format',
        'Value is correctly displayed'
      ]
    );
  });

  test('should display Z.AI Coding Plan as a provider option', async ({ window }) => {
    const settingsPage = new SettingsPage(window);

    // Navigate to settings
    await window.waitForLoadState('domcontentloaded');
    await settingsPage.navigateToSettings();

    // Verify Z.AI provider button is visible
    const zaiButton = settingsPage.getProviderButton('Z.AI Coding Plan');
    await expect(zaiButton).toBeVisible({ timeout: TEST_TIMEOUTS.NAVIGATION });

    // Capture provider selection area
    await captureForAI(
      window,
      'settings-dialog',
      'zai-provider-visible',
      [
        'Z.AI Coding Plan provider is visible in settings',
        'Provider button can be clicked',
        'User can select Z.AI as their provider'
      ]
    );
  });

  test('should allow selecting Z.AI Coding Plan provider and entering API key', async ({ window }) => {
    const settingsPage = new SettingsPage(window);

    // Navigate to settings
    await window.waitForLoadState('domcontentloaded');
    await settingsPage.navigateToSettings();

    // Click Z.AI provider
    await settingsPage.selectProvider('Z.AI Coding Plan');

    // Enter API key
    const testKey = 'zai-test-api-key-67890';
    await settingsPage.apiKeyInput.fill(testKey);

    // Verify value was entered
    await expect(settingsPage.apiKeyInput).toHaveValue(testKey);

    // Capture filled state
    await captureForAI(
      window,
      'settings-dialog',
      'zai-api-key-filled',
      [
        'Z.AI Coding Plan provider is selected',
        'API key input accepts Z.AI key format',
        'Value is correctly displayed'
      ]
    );
  });

  test('should display all seven cloud providers', async ({ window }) => {
    const settingsPage = new SettingsPage(window);

    // Navigate to settings
    await window.waitForLoadState('domcontentloaded');
    await settingsPage.navigateToSettings();

    // Verify all providers are visible
    const providers = ['Anthropic', 'OpenAI', 'OpenRouter', 'Google AI', 'xAI (Grok)', 'DeepSeek', 'Z.AI Coding Plan'];

    for (const provider of providers) {
      const button = settingsPage.getProviderButton(provider);
      await expect(button).toBeVisible({ timeout: TEST_TIMEOUTS.NAVIGATION });
    }

    // Capture all providers
    await captureForAI(
      window,
      'settings-dialog',
      'all-providers-visible',
      [
        'All seven cloud providers are visible',
        'Anthropic, OpenAI, OpenRouter, Google AI, xAI, DeepSeek, Z.AI all present',
        'User can select any provider'
      ]
    );
  });

  test('should display OpenRouter as a provider option', async ({ window }) => {
    const settingsPage = new SettingsPage(window);

    // Navigate to settings
    await window.waitForLoadState('domcontentloaded');
    await settingsPage.navigateToSettings();

    // Verify OpenRouter provider button is visible
    const openrouterButton = settingsPage.getProviderButton('OpenRouter');
    await expect(openrouterButton).toBeVisible({ timeout: TEST_TIMEOUTS.NAVIGATION });

    // Capture provider selection area
    await captureForAI(
      window,
      'settings-dialog',
      'openrouter-provider-visible',
      [
        'OpenRouter provider is visible in settings',
        'Provider button can be clicked',
        'User can select OpenRouter as their provider'
      ]
    );
  });

  test('should allow selecting OpenRouter provider and entering API key', async ({ window }) => {
    const settingsPage = new SettingsPage(window);

    // Navigate to settings
    await window.waitForLoadState('domcontentloaded');
    await settingsPage.navigateToSettings();

    // Click OpenRouter provider
    await settingsPage.selectProvider('OpenRouter');

    // Enter API key
    const testKey = 'sk-or-v1-test-key-12345';
    await settingsPage.apiKeyInput.fill(testKey);

    // Verify value was entered
    await expect(settingsPage.apiKeyInput).toHaveValue(testKey);

    // Capture filled state
    await captureForAI(
      window,
      'settings-dialog',
      'openrouter-api-key-filled',
      [
        'OpenRouter provider is selected',
        'API key input accepts OpenRouter key format',
        'Value is correctly displayed'
      ]
    );
  });

  test('should display Proxy Platforms tab', async ({ window }) => {
    const settingsPage = new SettingsPage(window);

    // Navigate to settings
    await window.waitForLoadState('domcontentloaded');
    await settingsPage.navigateToSettings();

    // Verify Proxy Platforms tab is visible
    await expect(settingsPage.proxyPlatformsTab).toBeVisible({ timeout: TEST_TIMEOUTS.NAVIGATION });

    // Capture tabs
    await captureForAI(
      window,
      'settings-dialog',
      'proxy-platforms-tab-visible',
      [
        'Proxy Platforms tab is visible',
        'Tab can be clicked',
        'User can navigate to proxy platforms settings'
      ]
    );
  });

  test('should show OpenRouter and LiteLLM options when Proxy Platforms tab is clicked', async ({ window }) => {
    const settingsPage = new SettingsPage(window);

    // Navigate to settings
    await window.waitForLoadState('domcontentloaded');
    await settingsPage.navigateToSettings();

    // Click Proxy Platforms tab
    await settingsPage.selectProxyPlatformsTab();

    // Verify OpenRouter platform option is visible
    await expect(settingsPage.openrouterPlatformButton).toBeVisible({ timeout: TEST_TIMEOUTS.NAVIGATION });

    // Verify LiteLLM platform option is visible (but disabled)
    await expect(settingsPage.litellmPlatformButton).toBeVisible({ timeout: TEST_TIMEOUTS.NAVIGATION });

    // Verify API key input is visible when no key is configured
    // (This may or may not be visible depending on test state)
    const apiKeyInput = settingsPage.openrouterApiKeyInput;
    const keyConfigured = await window.locator('text=API key configured').isVisible();
    if (!keyConfigured) {
      await expect(apiKeyInput).toBeVisible({ timeout: TEST_TIMEOUTS.NAVIGATION });
    }

    // Capture proxy platforms content
    await captureForAI(
      window,
      'settings-dialog',
      'proxy-platforms-content',
      [
        'OpenRouter platform option is visible',
        'LiteLLM platform option is visible (coming soon)',
        'User can select a proxy platform'
      ]
    );
  });

  test('should keep dialog open when saving OpenRouter API key (regression: dialog closing before model selection)', async ({ window }) => {
    const settingsPage = new SettingsPage(window);

    // Navigate to settings
    await window.waitForLoadState('domcontentloaded');
    await settingsPage.navigateToSettings();

    // Click Proxy Platforms tab
    await settingsPage.selectProxyPlatformsTab();

    // Check if API key input is visible (no key configured yet)
    const apiKeyInput = settingsPage.openrouterApiKeyInput;
    const keyConfigured = await window.locator('text=API key configured').isVisible();

    if (!keyConfigured) {
      // Enter an invalid format API key (doesn't start with sk-or-)
      await apiKeyInput.fill('invalid-key-format');
      await settingsPage.saveOpenrouterApiKeyButton.click();

      // Verify error message appears
      await expect(window.locator('text=Invalid API key format')).toBeVisible({ timeout: TEST_TIMEOUTS.NAVIGATION });

      // Verify dialog is still open (this is the key assertion - dialog should NOT close)
      await expect(settingsPage.openrouterPlatformButton).toBeVisible({ timeout: TEST_TIMEOUTS.NAVIGATION });

      // Clear and try with valid format but invalid key (will fail validation but dialog should stay open)
      await apiKeyInput.fill('sk-or-v1-invalid-test-key');
      await settingsPage.saveOpenrouterApiKeyButton.click();

      // Should show "Validating..." then error, but dialog stays open
      // We just verify the dialog is still visible after a brief wait
      await window.waitForTimeout(1000);
      await expect(settingsPage.openrouterPlatformButton).toBeVisible({ timeout: TEST_TIMEOUTS.NAVIGATION });
    }

    // Capture the state for AI verification
    await captureForAI(
      window,
      'settings-dialog',
      'proxy-platforms-api-key-flow',
      [
        'Dialog stays open after API key validation',
        'Error messages are displayed for invalid keys',
        'User can retry entering API key'
      ]
    );
  });

  /**
   * Regression test for: "Maximum update depth exceeded" infinite loop bug
   *
   * Bug: Execution.tsx called getAccomplish() on every render, creating a new
   * object reference. This was used as a useEffect dependency, causing:
   * render -> new accomplish -> useEffect runs -> setState -> render -> loop
   *
   * This test verifies Settings dialog opens correctly after a task completes.
   */
  test('should open settings dialog after task completes without crashing', async ({ window }) => {
    const homePage = new HomePage(window);
    const executionPage = new ExecutionPage(window);
    const settingsPage = new SettingsPage(window);

    await window.waitForLoadState('domcontentloaded');

    // Step 1: Start a task
    await homePage.enterTask(TEST_SCENARIOS.SUCCESS.keyword);
    await homePage.submitTask();

    // Step 2: Wait for navigation to execution page
    await window.waitForURL(/.*#\/execution.*/, { timeout: TEST_TIMEOUTS.NAVIGATION });

    // Step 3: Wait for task to complete
    await executionPage.waitForComplete();

    // Verify task completed
    await expect(executionPage.statusBadge).toBeVisible();

    // Step 4: Open settings dialog - this is where the bug would cause infinite loop
    // The test should NOT timeout here. If it does, the infinite loop bug is present.
    await settingsPage.navigateToSettings();

    // Step 5: Verify settings dialog opened successfully (no crash/freeze)
    await expect(settingsPage.modelSelect).toBeVisible({ timeout: TEST_TIMEOUTS.NAVIGATION });

    // Additional verification: can interact with the dialog
    const dialogTitle = window.getByRole('heading', { name: 'Settings' });
    await expect(dialogTitle).toBeVisible();

    // Capture successful state
    await captureForAI(
      window,
      'settings-dialog',
      'after-task-completion',
      [
        'Settings dialog opened successfully after task completion',
        'No infinite loop or crash occurred',
        'Dialog is fully functional'
      ]
    );
  });

  test('should display LiteLLM as enabled option in Proxy Platforms tab', async ({ window }) => {
    const settingsPage = new SettingsPage(window);

    // Navigate to settings
    await window.waitForLoadState('domcontentloaded');
    await settingsPage.navigateToSettings();

    // Click Proxy Platforms tab
    await settingsPage.selectProxyPlatformsTab();

    // Verify LiteLLM platform button is visible and enabled
    await expect(settingsPage.litellmPlatformButton).toBeVisible({ timeout: TEST_TIMEOUTS.NAVIGATION });
    await expect(settingsPage.litellmPlatformButton).toBeEnabled();

    // Capture proxy platforms with LiteLLM enabled
    await captureForAI(
      window,
      'settings-dialog',
      'litellm-enabled',
      [
        'LiteLLM platform is visible and enabled',
        'Button can be clicked',
        'User can select LiteLLM as their proxy platform'
      ]
    );
  });

  test('should show URL and API key inputs when LiteLLM is selected', async ({ window }) => {
    const settingsPage = new SettingsPage(window);

    // Navigate to settings
    await window.waitForLoadState('domcontentloaded');
    await settingsPage.navigateToSettings();

    // Click Proxy Platforms tab
    await settingsPage.selectProxyPlatformsTab();

    // Click LiteLLM platform button
    await settingsPage.selectLiteLLMPlatform();

    // Verify URL input is visible
    await expect(settingsPage.litellmUrlInput).toBeVisible({ timeout: TEST_TIMEOUTS.NAVIGATION });

    // Verify API key input is visible (optional field)
    await expect(settingsPage.litellmApiKeyInput).toBeVisible({ timeout: TEST_TIMEOUTS.NAVIGATION });

    // Verify Test Connection button is visible
    await expect(settingsPage.litellmTestConnectionButton).toBeVisible({ timeout: TEST_TIMEOUTS.NAVIGATION });

    // Capture LiteLLM selection state
    await captureForAI(
      window,
      'settings-dialog',
      'litellm-selected',
      [
        'LiteLLM platform is selected',
        'URL input is visible with default value',
        'Optional API key input is visible',
        'Test Connection button is visible'
      ]
    );
  });

  test('should allow editing LiteLLM URL', async ({ window }) => {
    const settingsPage = new SettingsPage(window);

    // Navigate to settings
    await window.waitForLoadState('domcontentloaded');
    await settingsPage.navigateToSettings();

    // Click Proxy Platforms tab
    await settingsPage.selectProxyPlatformsTab();

    // Click LiteLLM platform button
    await settingsPage.selectLiteLLMPlatform();

    // Clear and enter a custom URL
    await settingsPage.litellmUrlInput.clear();
    await settingsPage.litellmUrlInput.fill('http://192.168.1.100:8000');

    // Verify value was entered
    await expect(settingsPage.litellmUrlInput).toHaveValue('http://192.168.1.100:8000');

    // Capture edited URL state
    await captureForAI(
      window,
      'settings-dialog',
      'litellm-url-edited',
      [
        'LiteLLM URL input accepts custom values',
        'User can connect to remote LiteLLM instances',
        'URL field is editable'
      ]
    );
  });
});
