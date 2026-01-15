import Store from 'electron-store';
import type { SelectedModel, LocalLlmConfig, DEFAULT_MODEL } from '@accomplish/shared';

/**
 * App settings schema
 */
interface AppSettingsSchema {
  /** Enable debug mode to show backend logs in UI */
  debugMode: boolean;
  /** Whether the user has completed the onboarding wizard */
  onboardingComplete: boolean;
  /** Selected AI model (provider/model format) */
  selectedModel: SelectedModel | null;
  /** Local OpenAI-compatible endpoint configuration */
  localLlm: LocalLlmConfig | null;
  /** OpenRouter configuration */
  openrouter: { model: string } | null;
  /** LiteLLM configuration */
  litellm: { baseUrl: string; model: string } | null;
}

const appSettingsStore = new Store<AppSettingsSchema>({
  name: 'app-settings',
  defaults: {
    debugMode: false,
    onboardingComplete: false,
    selectedModel: {
      provider: 'anthropic',
      model: 'anthropic/claude-opus-4-5',
    },
    localLlm: null,
    openrouter: null,
    litellm: null,
  },
});

/**
 * Get debug mode setting
 */
export function getDebugMode(): boolean {
  return appSettingsStore.get('debugMode');
}

/**
 * Set debug mode setting
 */
export function setDebugMode(enabled: boolean): void {
  appSettingsStore.set('debugMode', enabled);
}

/**
 * Get onboarding complete setting
 */
export function getOnboardingComplete(): boolean {
  return appSettingsStore.get('onboardingComplete');
}

/**
 * Set onboarding complete setting
 */
export function setOnboardingComplete(complete: boolean): void {
  appSettingsStore.set('onboardingComplete', complete);
}

/**
 * Get selected model
 */
export function getSelectedModel(): SelectedModel | null {
  return appSettingsStore.get('selectedModel');
}

/**
 * Set selected model
 */
export function setSelectedModel(model: SelectedModel): void {
  appSettingsStore.set('selectedModel', model);
}

/**
 * Get local LLM configuration
 */
export function getLocalLlmConfig(): LocalLlmConfig | null {
  return appSettingsStore.get('localLlm');
}

/**
 * Set local LLM configuration
 */
export function setLocalLlmConfig(config: LocalLlmConfig | null): void {
  appSettingsStore.set('localLlm', config);
}

/**
 * Get OpenRouter configuration
 */
export function getOpenRouterConfig(): { model: string } | null {
  return appSettingsStore.get('openrouter');
}

/**
 * Set OpenRouter configuration
 */
export function setOpenRouterConfig(config: { model: string } | null): void {
  appSettingsStore.set('openrouter', config);
}

/**
 * Get LiteLLM configuration
 */
export function getLiteLlmConfig(): { baseUrl: string; model: string } | null {
  return appSettingsStore.get('litellm');
}

/**
 * Set LiteLLM configuration
 */
export function setLiteLlmConfig(config: { baseUrl: string; model: string } | null): void {
  appSettingsStore.set('litellm', config);
}

/**
 * Get all app settings
 */
export function getAppSettings(): AppSettingsSchema {
  return {
    debugMode: appSettingsStore.get('debugMode'),
    onboardingComplete: appSettingsStore.get('onboardingComplete'),
    selectedModel: appSettingsStore.get('selectedModel'),
    localLlm: appSettingsStore.get('localLlm'),
    openrouter: appSettingsStore.get('openrouter'),
    litellm: appSettingsStore.get('litellm'),
  };
}

/**
 * Clear all app settings (reset to defaults)
 * Used during fresh install cleanup
 */
export function clearAppSettings(): void {
  appSettingsStore.clear();
}
