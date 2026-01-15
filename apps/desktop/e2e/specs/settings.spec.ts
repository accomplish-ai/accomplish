import { test, expect } from '../fixtures';
import { SettingsPage } from '../pages';
import { captureForAI } from '../utils';
import { TEST_TIMEOUTS } from '../config';

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
});
