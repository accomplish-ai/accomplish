import type {
  SelectedModel,
  OllamaConfig,
  LiteLLMConfig,
  AzureFoundryConfig,
  LMStudioConfig,
} from '../../common/types/provider.js';
import type { ThemePreference, SafetyLevel, ProviderProfile } from '../../types/storage.js';
import { getDatabase } from '../database.js';
import { safeParseJsonWithFallback } from '../../utils/json.js';

interface AppSettingsRow {
  id: number;
  debug_mode: number;
  onboarding_complete: number;
  selected_model: string | null;
  ollama_config: string | null;
  litellm_config: string | null;
  azure_foundry_config: string | null;
  lmstudio_config: string | null;
  openai_base_url: string | null;
  theme: string;
  safety_level: string;
  dry_run_mode: number;
  provider_profile: string;
  auto_fallback: number;
}

export interface AppSettings {
  debugMode: boolean;
  onboardingComplete: boolean;
  selectedModel: SelectedModel | null;
  ollamaConfig: OllamaConfig | null;
  litellmConfig: LiteLLMConfig | null;
  azureFoundryConfig: AzureFoundryConfig | null;
  lmstudioConfig: LMStudioConfig | null;
  openaiBaseUrl: string;
  theme: ThemePreference;
  safetyLevel: SafetyLevel;
  dryRunMode: boolean;
  providerProfile: ProviderProfile;
  autoFallback: boolean;
}

function getRow(): AppSettingsRow {
  const db = getDatabase();
  return db.prepare('SELECT * FROM app_settings WHERE id = 1').get() as AppSettingsRow;
}

export function getDebugMode(): boolean {
  return getRow().debug_mode === 1;
}

export function setDebugMode(enabled: boolean): void {
  const db = getDatabase();
  db.prepare('UPDATE app_settings SET debug_mode = ? WHERE id = 1').run(enabled ? 1 : 0);
}

export function getOnboardingComplete(): boolean {
  return getRow().onboarding_complete === 1;
}

export function setOnboardingComplete(complete: boolean): void {
  const db = getDatabase();
  db.prepare('UPDATE app_settings SET onboarding_complete = ? WHERE id = 1').run(
    complete ? 1 : 0
  );
}

export function getSelectedModel(): SelectedModel | null {
  const row = getRow();
  if (!row.selected_model) return null;
  try {
    return JSON.parse(row.selected_model) as SelectedModel;
  } catch {
    return null;
  }
}

export function setSelectedModel(model: SelectedModel): void {
  const db = getDatabase();
  db.prepare('UPDATE app_settings SET selected_model = ? WHERE id = 1').run(
    JSON.stringify(model)
  );
}

export function getOllamaConfig(): OllamaConfig | null {
  const row = getRow();
  if (!row.ollama_config) return null;
  try {
    return JSON.parse(row.ollama_config) as OllamaConfig;
  } catch {
    return null;
  }
}

export function setOllamaConfig(config: OllamaConfig | null): void {
  const db = getDatabase();
  db.prepare('UPDATE app_settings SET ollama_config = ? WHERE id = 1').run(
    config ? JSON.stringify(config) : null
  );
}

export function getLiteLLMConfig(): LiteLLMConfig | null {
  const row = getRow();
  if (!row.litellm_config) return null;
  try {
    return JSON.parse(row.litellm_config) as LiteLLMConfig;
  } catch {
    return null;
  }
}

export function setLiteLLMConfig(config: LiteLLMConfig | null): void {
  const db = getDatabase();
  db.prepare('UPDATE app_settings SET litellm_config = ? WHERE id = 1').run(
    config ? JSON.stringify(config) : null
  );
}

export function getAzureFoundryConfig(): AzureFoundryConfig | null {
  const row = getRow();
  if (!row.azure_foundry_config) return null;
  try {
    return JSON.parse(row.azure_foundry_config) as AzureFoundryConfig;
  } catch {
    return null;
  }
}

export function setAzureFoundryConfig(config: AzureFoundryConfig | null): void {
  const db = getDatabase();
  db.prepare('UPDATE app_settings SET azure_foundry_config = ? WHERE id = 1').run(
    config ? JSON.stringify(config) : null
  );
}

export function getLMStudioConfig(): LMStudioConfig | null {
  const row = getRow();
  if (!row.lmstudio_config) return null;
  try {
    return JSON.parse(row.lmstudio_config) as LMStudioConfig;
  } catch {
    return null;
  }
}

export function setLMStudioConfig(config: LMStudioConfig | null): void {
  const db = getDatabase();
  db.prepare('UPDATE app_settings SET lmstudio_config = ? WHERE id = 1').run(
    config ? JSON.stringify(config) : null
  );
}

export function getOpenAiBaseUrl(): string {
  const row = getRow();
  return row.openai_base_url || '';
}

export function setOpenAiBaseUrl(baseUrl: string): void {
  const db = getDatabase();
  db.prepare('UPDATE app_settings SET openai_base_url = ? WHERE id = 1').run(baseUrl || '');
}

const VALID_THEMES: ThemePreference[] = ['system', 'light', 'dark'];

export function getTheme(): ThemePreference {
  const row = getRow();
  const value = row.theme as ThemePreference;
  if (VALID_THEMES.includes(value)) {
    return value;
  }
  return 'system';
}

export function setTheme(theme: ThemePreference): void {
  if (!VALID_THEMES.includes(theme)) {
    throw new Error(`Invalid theme value: ${theme}`);
  }
  const db = getDatabase();
  db.prepare('UPDATE app_settings SET theme = ? WHERE id = 1').run(theme);
}

// Safety Level
const VALID_SAFETY_LEVELS: SafetyLevel[] = ['paranoid', 'normal', 'fast'];

export function getSafetyLevel(): SafetyLevel {
  const row = getRow();
  const value = row.safety_level as SafetyLevel;
  if (VALID_SAFETY_LEVELS.includes(value)) {
    return value;
  }
  return 'normal';
}

export function setSafetyLevel(level: SafetyLevel): void {
  if (!VALID_SAFETY_LEVELS.includes(level)) {
    throw new Error(`Invalid safety level: ${level}`);
  }
  const db = getDatabase();
  db.prepare('UPDATE app_settings SET safety_level = ? WHERE id = 1').run(level);
}

// Dry Run Mode
export function getDryRunMode(): boolean {
  return getRow().dry_run_mode === 1;
}

export function setDryRunMode(enabled: boolean): void {
  const db = getDatabase();
  db.prepare('UPDATE app_settings SET dry_run_mode = ? WHERE id = 1').run(enabled ? 1 : 0);
}

// Provider Profile
const VALID_PROVIDER_PROFILES: ProviderProfile[] = ['fast', 'balanced', 'quality', 'local'];

export function getProviderProfile(): ProviderProfile {
  const row = getRow();
  const value = row.provider_profile as ProviderProfile;
  if (VALID_PROVIDER_PROFILES.includes(value)) {
    return value;
  }
  return 'balanced';
}

export function setProviderProfile(profile: ProviderProfile): void {
  if (!VALID_PROVIDER_PROFILES.includes(profile)) {
    throw new Error(`Invalid provider profile: ${profile}`);
  }
  const db = getDatabase();
  db.prepare('UPDATE app_settings SET provider_profile = ? WHERE id = 1').run(profile);
}

// Auto Fallback
export function getAutoFallback(): boolean {
  return getRow().auto_fallback === 1;
}

export function setAutoFallback(enabled: boolean): void {
  const db = getDatabase();
  db.prepare('UPDATE app_settings SET auto_fallback = ? WHERE id = 1').run(enabled ? 1 : 0);
}

export function getAppSettings(): AppSettings {
  const row = getRow();
  return {
    debugMode: row.debug_mode === 1,
    onboardingComplete: row.onboarding_complete === 1,
    selectedModel: safeParseJsonWithFallback<SelectedModel>(row.selected_model),
    ollamaConfig: safeParseJsonWithFallback<OllamaConfig>(row.ollama_config),
    litellmConfig: safeParseJsonWithFallback<LiteLLMConfig>(row.litellm_config),
    azureFoundryConfig: safeParseJsonWithFallback<AzureFoundryConfig>(row.azure_foundry_config),
    lmstudioConfig: safeParseJsonWithFallback<LMStudioConfig>(row.lmstudio_config),
    openaiBaseUrl: row.openai_base_url || '',
    theme: VALID_THEMES.includes(row.theme as ThemePreference) ? (row.theme as ThemePreference) : 'system',
    safetyLevel: VALID_SAFETY_LEVELS.includes(row.safety_level as SafetyLevel) ? (row.safety_level as SafetyLevel) : 'normal',
    dryRunMode: row.dry_run_mode === 1,
    providerProfile: VALID_PROVIDER_PROFILES.includes(row.provider_profile as ProviderProfile) ? (row.provider_profile as ProviderProfile) : 'balanced',
    autoFallback: row.auto_fallback === 1,
  };
}

export function clearAppSettings(): void {
  const db = getDatabase();
  db.prepare(
    `UPDATE app_settings SET
      debug_mode = 0,
      onboarding_complete = 0,
      selected_model = NULL,
      ollama_config = NULL,
      litellm_config = NULL,
      azure_foundry_config = NULL,
      lmstudio_config = NULL,
      openai_base_url = '',
      theme = 'system',
      safety_level = 'normal',
      dry_run_mode = 0,
      provider_profile = 'balanced',
      auto_fallback = 1
    WHERE id = 1`
  ).run();
}
