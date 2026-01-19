import type { Page } from '@playwright/test';
import { TEST_TIMEOUTS } from '../config';

export class SettingsPage {
  constructor(private page: Page) {}

  get title() {
    return this.page.getByTestId('settings-title');
  }

  get debugModeToggle() {
    return this.page.getByTestId('settings-debug-toggle');
  }

  get modelSection() {
    return this.page.getByTestId('settings-model-section');
  }

  get modelSelect() {
    return this.page.getByTestId('settings-model-select');
  }

  get providerSection() {
    return this.page.getByTestId('settings-provider-section');
  }

  get apiKeyInput() {
    return this.page.getByTestId('settings-api-key-input');
  }

  get addApiKeyButton() {
    return this.page.getByTestId('settings-add-api-key-button');
  }

  get removeApiKeyButton() {
    return this.page.getByTestId('settings-remove-api-key-button');
  }

  get backButton() {
    return this.page.getByTestId('settings-back-button');
  }

  get sidebarSettingsButton() {
    return this.page.getByTestId('sidebar-settings-button');
  }

  get bedrockProviderButton() {
    return this.page.locator('button:has-text("Amazon Bedrock")');
  }

  get bedrockAccessKeysTab() {
    return this.page.locator('button:has-text("Access Keys")');
  }

  get bedrockProfileTab() {
    return this.page.locator('button:has-text("AWS Profile")');
  }

  get bedrockAccessKeyInput() {
    return this.page.getByTestId('bedrock-access-key-input');
  }

  get bedrockSecretKeyInput() {
    return this.page.getByTestId('bedrock-secret-key-input');
  }

  get bedrockProfileInput() {
    return this.page.getByTestId('bedrock-profile-input');
  }

  get bedrockRegionInput() {
    return this.page.getByTestId('bedrock-region-input');
  }

  get bedrockSaveButton() {
    return this.page.getByTestId('bedrock-save-button');
  }

  // Tab buttons
  get cloudProvidersTab() {
    return this.page.getByRole('button', { name: 'Cloud Providers' });
  }

  get localModelsTab() {
    return this.page.getByRole('button', { name: 'Local Models' });
  }

  get proxyPlatformsTab() {
    return this.page.getByRole('button', { name: 'Proxy Platforms' });
  }

  // Proxy Platforms tab elements
  get openrouterPlatformButton() {
    return this.page.locator('button:has-text("OpenRouter")').first();
  }

  get litellmPlatformButton() {
    return this.page.locator('button:has-text("LiteLLM"):not([disabled])');
  }

  get litellmUrlInput() {
    return this.page.locator('[data-testid="litellm-url-input"]');
  }

  get litellmApiKeyInput() {
    return this.page.locator('[data-testid="litellm-api-key-input"]');
  }

  get litellmTestConnectionButton() {
    return this.page.locator('[data-testid="litellm-test-button"]');
  }

  get litellmModelSearch() {
    return this.page.locator('[data-testid="litellm-search-input"]');
  }

  get litellmUseModelButton() {
    return this.page.locator('[data-testid="litellm-save-button"]');
  }

  async selectLiteLLMPlatform() {
    await this.litellmPlatformButton.click();
  }

  get fetchModelsButton() {
    return this.page.getByRole('button', { name: /Fetch Models|Refresh/ });
  }

  get openrouterApiKeyInput() {
    return this.page.getByPlaceholder('sk-or-...');
  }

  get saveOpenrouterApiKeyButton() {
    return this.page.getByRole('button', { name: /Save API Key & Fetch Models/ });
  }

  async navigateToSettings() {
    // Click the settings button in sidebar to navigate
    await this.sidebarSettingsButton.click();
    // Wait for settings dialog to be visible
    await this.modelSelect.waitFor({ state: 'visible', timeout: TEST_TIMEOUTS.NAVIGATION });
  }

  async toggleDebugMode() {
    await this.debugModeToggle.click();
  }

  async selectModel(modelName: string) {
    await this.modelSelect.click();
    await this.page.getByText(modelName).click();
  }

  async addApiKey(provider: string, key: string) {
    await this.apiKeyInput.fill(key);
    await this.addApiKeyButton.click();
  }

  /**
   * Get a provider button by its name
   */
  getProviderButton(providerName: string) {
    return this.page.getByRole('button', { name: providerName, exact: true });
  }

  /**
   * Select a provider by clicking its button
   */
  async selectProvider(providerName: string) {
    const button = this.getProviderButton(providerName);
    await button.click();
  }

  /**
   * Check if a provider button is visible
   */
  async isProviderVisible(providerName: string) {
    const button = this.getProviderButton(providerName);
    return button.isVisible();
  }

  async selectBedrockProvider() {
    await this.bedrockProviderButton.click();
  }

  async selectBedrockAccessKeysTab() {
    await this.bedrockAccessKeysTab.click();
  }

  async selectBedrockProfileTab() {
    await this.bedrockProfileTab.click();
  }

  async selectProxyPlatformsTab() {
    await this.proxyPlatformsTab.click();
  }
}
