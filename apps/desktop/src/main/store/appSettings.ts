import Store from 'electron-store';
import type { SelectedModel, OllamaConfig, LiteLLMConfig, CustomSkillConfig } from '@accomplish/shared';

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
  /** Ollama server configuration */
  ollamaConfig: OllamaConfig | null;
  /** LiteLLM proxy configuration */
  litellmConfig: LiteLLMConfig | null;
  /** User-defined custom skills/MCP servers */
  customSkills: CustomSkillConfig[];
  /** Main window state (size, position) */
  windowState: {
    width: number;
    height: number;
    x?: number;
    y?: number;
    isMaximized: boolean;
  } | null;
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
    ollamaConfig: null,
    litellmConfig: null,
    customSkills: [],
    windowState: null,
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
 * Get Ollama configuration
 */
export function getOllamaConfig(): OllamaConfig | null {
  return appSettingsStore.get('ollamaConfig');
}

/**
 * Set Ollama configuration
 */
export function setOllamaConfig(config: OllamaConfig | null): void {
  appSettingsStore.set('ollamaConfig', config);
}

/**
 * Get LiteLLM configuration
 */
export function getLiteLLMConfig(): LiteLLMConfig | null {
  return appSettingsStore.get('litellmConfig');
}

/**
 * Set LiteLLM configuration
 */
export function setLiteLLMConfig(config: LiteLLMConfig | null): void {
  appSettingsStore.set('litellmConfig', config);
}

/**
 * Get custom skills configuration
 */
export function getCustomSkills(): CustomSkillConfig[] {
  return appSettingsStore.get('customSkills') || [];
}

/**
 * Set custom skills configuration
 */
export function setCustomSkills(skills: CustomSkillConfig[]): void {
  appSettingsStore.set('customSkills', skills);
}

/**
 * Get window state
 */
export function getWindowState(): AppSettingsSchema['windowState'] {
  return appSettingsStore.get('windowState');
}

/**
 * Set window state
 */
export function setWindowState(state: AppSettingsSchema['windowState']): void {
  appSettingsStore.set('windowState', state);
}

/**
 * Get all app settings
 */
export function getAppSettings(): AppSettingsSchema {
  return {
    debugMode: appSettingsStore.get('debugMode'),
    onboardingComplete: appSettingsStore.get('onboardingComplete'),
    selectedModel: appSettingsStore.get('selectedModel'),
    ollamaConfig: appSettingsStore.get('ollamaConfig') ?? null,
    litellmConfig: appSettingsStore.get('litellmConfig') ?? null,
    customSkills: appSettingsStore.get('customSkills') || [],
    windowState: appSettingsStore.get('windowState') || null,
  };
}

/**
 * Clear all app settings (reset to defaults)
 * Used during fresh install cleanup
 */
export function clearAppSettings(): void {
  appSettingsStore.clear();
}
