import { test, expect } from '../fixtures';
import { SettingsPage } from '../pages';
import { captureForAI } from '../utils';
import { TEST_TIMEOUTS } from '../config';

test.describe('Settings - Amazon Bedrock', () => {
  test('should display Bedrock provider button', async ({ window }) => {
    const settingsPage = new SettingsPage(window);
    await window.waitForLoadState('domcontentloaded');
    await settingsPage.navigateToSettings();

    await expect(settingsPage.bedrockProviderButton).toBeVisible({ timeout: TEST_TIMEOUTS.NAVIGATION });

    await captureForAI(
      window,
      'settings-bedrock',
      'provider-button-visible',
      ['Bedrock provider button is visible', 'User can select Bedrock']
    );
  });

  test('should show Bedrock credential form when selected', async ({ window }) => {
    const settingsPage = new SettingsPage(window);
    await window.waitForLoadState('domcontentloaded');
    await settingsPage.navigateToSettings();

    await settingsPage.selectBedrockProvider();

    // Verify Access Keys tab is visible (default)
    await expect(settingsPage.bedrockAccessKeysTab).toBeVisible({ timeout: TEST_TIMEOUTS.NAVIGATION });
    await expect(settingsPage.bedrockProfileTab).toBeVisible({ timeout: TEST_TIMEOUTS.NAVIGATION });

    await captureForAI(
      window,
      'settings-bedrock',
      'credential-form-visible',
      ['Bedrock credential form is visible', 'Auth tabs are shown']
    );
  });

  test('should switch between Access Keys and Profile tabs', async ({ window }) => {
    const settingsPage = new SettingsPage(window);
    await window.waitForLoadState('domcontentloaded');
    await settingsPage.navigateToSettings();

    await settingsPage.selectBedrockProvider();

    // Default is Access Keys - verify inputs
    await expect(settingsPage.bedrockAccessKeyInput).toBeVisible({ timeout: TEST_TIMEOUTS.NAVIGATION });
    await expect(settingsPage.bedrockSecretKeyInput).toBeVisible({ timeout: TEST_TIMEOUTS.NAVIGATION });

    // Switch to Profile tab
    await settingsPage.selectBedrockProfileTab();
    await expect(settingsPage.bedrockProfileInput).toBeVisible({ timeout: TEST_TIMEOUTS.NAVIGATION });
    await expect(settingsPage.bedrockAccessKeyInput).not.toBeVisible();

    // Switch back to Access Keys
    await settingsPage.selectBedrockAccessKeysTab();
    await expect(settingsPage.bedrockAccessKeyInput).toBeVisible({ timeout: TEST_TIMEOUTS.NAVIGATION });

    await captureForAI(
      window,
      'settings-bedrock',
      'tab-switching',
      ['Can switch between auth tabs', 'Form fields update correctly']
    );
  });

  test('should allow typing in Bedrock access key fields', async ({ window }) => {
    const settingsPage = new SettingsPage(window);
    await window.waitForLoadState('domcontentloaded');
    await settingsPage.navigateToSettings();

    await settingsPage.selectBedrockProvider();

    const testAccessKey = 'AKIAIOSFODNN7EXAMPLE';
    const testSecretKey = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';
    const testRegion = 'us-west-2';

    await settingsPage.bedrockAccessKeyInput.fill(testAccessKey);
    await settingsPage.bedrockSecretKeyInput.fill(testSecretKey);
    await settingsPage.bedrockRegionInput.clear();
    await settingsPage.bedrockRegionInput.fill(testRegion);

    await expect(settingsPage.bedrockAccessKeyInput).toHaveValue(testAccessKey);
    await expect(settingsPage.bedrockSecretKeyInput).toHaveValue(testSecretKey);
    await expect(settingsPage.bedrockRegionInput).toHaveValue(testRegion);

    await captureForAI(
      window,
      'settings-bedrock',
      'access-key-fields-filled',
      ['Access key fields accept input', 'Region field works']
    );
  });

  test('should allow typing in Bedrock profile fields', async ({ window }) => {
    const settingsPage = new SettingsPage(window);
    await window.waitForLoadState('domcontentloaded');
    await settingsPage.navigateToSettings();

    await settingsPage.selectBedrockProvider();
    await settingsPage.selectBedrockProfileTab();

    const testProfile = 'my-aws-profile';
    const testRegion = 'eu-west-1';

    await settingsPage.bedrockProfileInput.clear();
    await settingsPage.bedrockProfileInput.fill(testProfile);
    await settingsPage.bedrockRegionInput.clear();
    await settingsPage.bedrockRegionInput.fill(testRegion);

    await expect(settingsPage.bedrockProfileInput).toHaveValue(testProfile);
    await expect(settingsPage.bedrockRegionInput).toHaveValue(testRegion);

    await captureForAI(
      window,
      'settings-bedrock',
      'profile-fields-filled',
      ['Profile field accepts input', 'Region field works']
    );
  });

  test('should have save button for Bedrock credentials', async ({ window }) => {
    const settingsPage = new SettingsPage(window);
    await window.waitForLoadState('domcontentloaded');
    await settingsPage.navigateToSettings();

    await settingsPage.selectBedrockProvider();

    await expect(settingsPage.bedrockSaveButton).toBeVisible({ timeout: TEST_TIMEOUTS.NAVIGATION });
    await expect(settingsPage.bedrockSaveButton).toHaveText('Save Bedrock Credentials');

    await captureForAI(
      window,
      'settings-bedrock',
      'save-button-visible',
      ['Save button is visible', 'Button text is correct']
    );
  });
});
