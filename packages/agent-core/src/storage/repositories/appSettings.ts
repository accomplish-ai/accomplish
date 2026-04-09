import type { ThemePreference, LanguagePreference } from '../../types/storage.js';
import type { SandboxConfig } from '../../common/types/sandbox.js';
import type { CloudBrowserConfig } from '../../common/types/cloud-browser.js';
import type { MessagingConfig } from '../../common/types/messaging.js';
import type {
  SelectedModel,
  OllamaConfig,
  LiteLLMConfig,
  AzureFoundryConfig,
  LMStudioConfig,
  HuggingFaceLocalConfig,
} from '../../common/types/provider.js';
import { DEFAULT_SANDBOX_CONFIG } from '../../common/types/sandbox.js';
import { getDatabase } from '../database.js';
import { safeParseJsonWithFallback } from '../../utils/json.js';

// Provider setting getters/setters
export {
  getSelectedModel,
  setSelectedModel,
  getOllamaConfig,
  setOllamaConfig,
  getLiteLLMConfig,
  setLiteLLMConfig,
  getAzureFoundryConfig,
  setAzureFoundryConfig,
  getLMStudioConfig,
  setLMStudioConfig,
  getHuggingFaceLocalConfig,
  setHuggingFaceLocalConfig,
  getNimConfig,
  setNimConfig,
  getOpenAiBaseUrl,
  setOpenAiBaseUrl,
} from './provider-settings.js';

// UI setting getters/setters
export {
  getDebugMode,
  setDebugMode,
  getOnboardingComplete,
  setOnboardingComplete,
  getTheme,
  setTheme,
  getNotificationsEnabled,
  setNotificationsEnabled,
  getCloseBehavior,
  setCloseBehavior,
  getLanguage,
  setLanguage,
  VALID_THEMES,
  VALID_LANGUAGES,
} from './ui-settings.js';
import { getLanguage as _getLanguage } from './ui-settings.js';

export type { CloseBehavior } from './ui-settings.js';

interface AppSettingsRow {
  id: number;
  debug_mode: number;
  onboarding_complete: number;
  selected_model: string | null;
  ollama_config: string | null;
  litellm_config: string | null;
  azure_foundry_config: string | null;
  lmstudio_config: string | null;
  huggingface_local_config: string | null;
  openai_base_url: string | null;
  theme: string;
  sandbox_config: string;
  cloud_browser_config: string | null;
  messaging_config: string | null;
  notifications_enabled: number;
  nim_config: string | null;
}

export interface AppSettings {
  debugMode: boolean;
  onboardingComplete: boolean;
  selectedModel: SelectedModel | null;
  ollamaConfig: OllamaConfig | null;
  litellmConfig: LiteLLMConfig | null;
  azureFoundryConfig: AzureFoundryConfig | null;
  lmstudioConfig: LMStudioConfig | null;
  huggingfaceLocalConfig: HuggingFaceLocalConfig | null;
  openaiBaseUrl: string;
  theme: ThemePreference;
  language: LanguagePreference;
}

const VALID_THEMES_LOCAL: ThemePreference[] = ['system', 'light', 'dark'];

function getRow(): AppSettingsRow {
  const db = getDatabase();
  return db.prepare('SELECT * FROM app_settings WHERE id = 1').get() as AppSettingsRow;
}

export function getSandboxConfig(): SandboxConfig {
  const row = getRow();
  const parsed = safeParseJsonWithFallback<Partial<SandboxConfig>>(row.sandbox_config);
  // Validate required fields before merging — bare {} passes JSON.parse but
  // would return an incomplete config if spread directly.
  if (
    parsed &&
    (parsed.mode === 'disabled' || parsed.mode === 'native' || parsed.mode === 'docker') &&
    Array.isArray(parsed.allowedPaths) &&
    typeof parsed.networkRestricted === 'boolean' &&
    Array.isArray(parsed.allowedHosts)
  ) {
    return { ...DEFAULT_SANDBOX_CONFIG, ...parsed };
  }
  return { ...DEFAULT_SANDBOX_CONFIG };
}

export function setSandboxConfig(config: SandboxConfig): void {
  const db = getDatabase();
  db.prepare('UPDATE app_settings SET sandbox_config = ? WHERE id = 1').run(JSON.stringify(config));
}

export function getCloudBrowserConfig(): CloudBrowserConfig | null {
  const row = getRow();
  if (!row.cloud_browser_config) return null;
  try {
    return JSON.parse(row.cloud_browser_config) as CloudBrowserConfig;
  } catch {
    return null;
  }
}

export function setCloudBrowserConfig(config: CloudBrowserConfig | null): void {
  const db = getDatabase();
  db.prepare('UPDATE app_settings SET cloud_browser_config = ? WHERE id = 1').run(
    config ? JSON.stringify(config) : null,
  );
}

export function getMessagingConfig(): MessagingConfig | null {
  const row = getRow();
  if (!row.messaging_config) return null;
  try {
    return JSON.parse(row.messaging_config) as MessagingConfig;
  } catch {
    return null;
  }
}

export function setMessagingConfig(config: MessagingConfig | null): void {
  const db = getDatabase();
  db.prepare('UPDATE app_settings SET messaging_config = ? WHERE id = 1').run(
    config ? JSON.stringify(config) : null,
  );
}

export function getAppSettings(): AppSettings {
  const row = getRow();
  // Import getLanguage from ui-settings.js
  // (already imported above as getLanguage)
  return {
    debugMode: row.debug_mode === 1,
    onboardingComplete: row.onboarding_complete === 1,
    selectedModel: safeParseJsonWithFallback<SelectedModel>(row.selected_model),
    ollamaConfig: safeParseJsonWithFallback<OllamaConfig>(row.ollama_config),
    litellmConfig: safeParseJsonWithFallback<LiteLLMConfig>(row.litellm_config),
    azureFoundryConfig: safeParseJsonWithFallback<AzureFoundryConfig>(row.azure_foundry_config),
    lmstudioConfig: safeParseJsonWithFallback<LMStudioConfig>(row.lmstudio_config),
    huggingfaceLocalConfig: safeParseJsonWithFallback<HuggingFaceLocalConfig>(
      row.huggingface_local_config,
    ),
    openaiBaseUrl: row.openai_base_url || '',
    theme: VALID_THEMES_LOCAL.includes(row.theme as ThemePreference)
      ? (row.theme as ThemePreference)
      : 'system',
    language: _getLanguage(),
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
      huggingface_local_config = NULL,
      nim_config = NULL,
      openai_base_url = '',
      theme = 'system',
      sandbox_config = '${JSON.stringify(DEFAULT_SANDBOX_CONFIG)}',
      cloud_browser_config = NULL,
      messaging_config = NULL,
      notifications_enabled = 1
    WHERE id = 1`,
  ).run();
}
