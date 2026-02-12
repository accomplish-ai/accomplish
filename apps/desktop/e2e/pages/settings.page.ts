import type { Page } from '@playwright/test';
import { TEST_TIMEOUTS } from '../config';

export class SettingsPage {
  constructor(private page: Page) {}

  // ===== Provider Grid =====

  get providerGrid() {
    return this.page.getByTestId('provider-grid');
  }

  get providerSearchInput() {
    return this.page.getByTestId('provider-search-input');
  }

  get showAllButton() {
    return this.page.getByRole('button', { name: 'Show All' });
  }

  get hideButton() {
    return this.page.getByRole('button', { name: 'Hide' });
  }

  getProviderCard(providerId: string) {
    return this.page.getByTestId(`provider-card-${providerId}`);
  }

  getProviderConnectedBadge(providerId: string) {
    return this.page.getByTestId(`provider-connected-badge-${providerId}`);
  }

  // ===== Connection Status =====

  get connectionStatus() {
    return this.page.getByTestId('connection-status');
  }

  get disconnectButton() {
    return this.page.getByTestId('disconnect-button');
  }

  get connectButton() {
    return this.page.getByRole('button', { name: 'Connect', exact: true });
  }

  // ===== Model Selection =====

  get modelSelector() {
    return this.page.getByTestId('model-selector');
  }

  get modelSelectorError() {
    return this.page.getByTestId('model-selector-error');
  }

  // ===== API Key Input =====

  get apiKeyInput() {
    return this.page.getByTestId('api-key-input');
  }

  get apiKeyHelpLink() {
    return this.page.getByRole('link', { name: 'How can I find it?' });
  }

  // ===== Bedrock Specific =====

  get bedrockApiKeyTab() {
    return this.page.getByTestId('bedrock-auth-tab-apikey');
  }

  get bedrockAccessKeyTab() {
    return this.page.getByTestId('bedrock-auth-tab-accesskey');
  }

  get bedrockAwsProfileTab() {
    return this.page.getByTestId('bedrock-auth-tab-profile');
  }

  get bedrockApiKeyInput() {
    return this.page.getByTestId('bedrock-api-key-input');
  }

  get bedrockAccessKeyIdInput() {
    return this.page.getByTestId('bedrock-access-key-id');
  }

  get bedrockSecretKeyInput() {
    return this.page.getByTestId('bedrock-secret-key');
  }

  get bedrockSessionTokenInput() {
    return this.page.getByTestId('bedrock-session-token');
  }

  get bedrockProfileNameInput() {
    return this.page.getByTestId('bedrock-profile-name');
  }

  get bedrockRegionSelect() {
    return this.page.getByTestId('bedrock-region-select');
  }

  // ===== Ollama Specific =====

  get ollamaServerUrlInput() {
    return this.page.getByTestId('ollama-server-url');
  }

  get ollamaConnectionError() {
    return this.page.getByTestId('ollama-connection-error');
  }

  // ===== LiteLLM Specific =====

  get litellmServerUrlInput() {
    return this.page.getByTestId('litellm-server-url');
  }

  get litellmApiKeyInput() {
    return this.page.getByTestId('litellm-api-key');
  }

  // ===== OpenRouter Specific =====

  get openrouterFetchModelsButton() {
    return this.page.getByRole('button', { name: /Fetch Models|Refresh/ });
  }

  // ===== Debug Mode =====

  get debugModeToggle() {
    return this.page.getByTestId('settings-debug-toggle');
  }

  // ===== Dialog =====

  get settingsDialog() {
    return this.page.getByTestId('settings-dialog');
  }

  get doneButton() {
    return this.page.getByTestId('settings-done-button');
  }

  get closeWarning() {
    return this.page.getByText('No provider ready');
  }

  get closeAnywayButton() {
    return this.page.getByRole('button', { name: 'Close Anyway' });
  }

  get sidebarSettingsButton() {
    return this.page.getByTestId('sidebar-settings-button');
  }

  // ===== Actions =====

  async navigateToSettings() {
    await this.sidebarSettingsButton.click();
    await this.settingsDialog.waitFor({ state: 'visible', timeout: TEST_TIMEOUTS.NAVIGATION });
  }

  async selectProvider(providerId: string) {
    await this.getProviderCard(providerId).click();
    // Wait for provider settings panel to render
    await this.connectButton.or(this.connectionStatus).waitFor({ state: 'visible', timeout: 5000 });
  }

  async searchProvider(query: string) {
    await this.providerSearchInput.fill(query);
  }

  async clearSearch() {
    await this.providerSearchInput.clear();
  }

  async toggleShowAll() {
    const showAllVisible = await this.showAllButton.isVisible();
    if (showAllVisible) {
      await this.showAllButton.click();
    } else {
      await this.hideButton.click();
    }
  }

  async enterApiKey(key: string) {
    await this.apiKeyInput.fill(key);
  }

  async clickConnect() {
    await this.connectButton.click();
  }

  async waitForConnection(timeout = 30000) {
    await this.page.locator('[data-testid="connection-status"][data-status="connected"]')
      .waitFor({ state: 'visible', timeout });
  }

  async clickDisconnect() {
    await this.disconnectButton.click();
  }

  /**
   * Select a model by ID. Handles both native <select> and custom SearchableSelect.
   */
  async selectModel(modelId: string) {
    const tagName = await this.modelSelector.evaluate(el => el.tagName.toLowerCase());

    if (tagName === 'select') {
      // Native <select> element
      await this.modelSelector.selectOption(modelId);
    } else {
      // Custom SearchableSelect — click to open, then click the option
      await this.modelSelector.click();
      const option = this.page.locator(`[data-model-id="${modelId}"]`);
      await option.waitFor({ state: 'visible', timeout: 5000 });
      await option.click();
    }
  }

  /**
   * Select the first available model from a SearchableSelect dropdown.
   * Useful when you don't know which models are available.
   */
  async selectFirstModel() {
    const tagName = await this.modelSelector.evaluate(el => el.tagName.toLowerCase());

    if (tagName === 'select') {
      // Native select — pick the first non-empty option
      await this.modelSelector.evaluate((el) => {
        const select = el as HTMLSelectElement;
        if (select.options.length > 1) {
          select.selectedIndex = 1;
          select.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
    } else {
      // Custom SearchableSelect — click to open, then click first option
      await this.modelSelector.click();
      const firstOption = this.page.locator('[data-model-id]').first();
      await firstOption.waitFor({ state: 'visible', timeout: 5000 });
      await firstOption.click();
    }
  }

  async toggleDebugMode() {
    await this.debugModeToggle.click();
  }

  async closeDialog() {
    await this.doneButton.click();
    await this.settingsDialog.waitFor({ state: 'hidden', timeout: 5000 });
  }

  async pressEscapeToClose() {
    await this.page.keyboard.press('Escape');
  }

  // Bedrock specific actions
  async selectBedrockApiKeyTab() {
    await this.bedrockApiKeyTab.click();
  }

  async selectBedrockAccessKeyTab() {
    await this.bedrockAccessKeyTab.click();
  }

  async selectBedrockAwsProfileTab() {
    await this.bedrockAwsProfileTab.click();
  }

  async enterBedrockApiKey(apiKey: string) {
    await this.bedrockApiKeyInput.fill(apiKey);
  }

  async enterBedrockAccessKeyCredentials(accessKeyId: string, secretKey: string, sessionToken?: string) {
    await this.bedrockAccessKeyIdInput.fill(accessKeyId);
    await this.bedrockSecretKeyInput.fill(secretKey);
    if (sessionToken) {
      await this.bedrockSessionTokenInput.fill(sessionToken);
    }
  }

  async enterBedrockProfileCredentials(profileName: string) {
    await this.bedrockProfileNameInput.fill(profileName);
  }

  async selectBedrockRegion(region: string) {
    await this.bedrockRegionSelect.selectOption(region);
  }

  // Ollama specific actions
  async enterOllamaServerUrl(url: string) {
    await this.ollamaServerUrlInput.fill(url);
  }

  // LiteLLM specific actions
  async enterLiteLLMServerUrl(url: string) {
    await this.litellmServerUrlInput.fill(url);
  }

  async enterLiteLLMApiKey(key: string) {
    await this.litellmApiKeyInput.fill(key);
  }
}
