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

  test('should display all six cloud providers', async ({ window }) => {
    const settingsPage = new SettingsPage(window);

    // Navigate to settings
    await window.waitForLoadState('domcontentloaded');
    await settingsPage.navigateToSettings();

    // Verify all providers are visible
    const providers = ['Anthropic', 'OpenAI', 'Google AI', 'xAI (Grok)', 'DeepSeek', 'Z.AI Coding Plan'];

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
        'All six cloud providers are visible',
        'Anthropic, OpenAI, Google AI, xAI, DeepSeek, Z.AI all present',
        'User can select any provider'
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
});
