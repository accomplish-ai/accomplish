// apps/desktop/src/main/store/repositories/appSettings.ts

import type { SelectedModel, OllamaConfig, LiteLLMConfig } from '@accomplish/shared';
import { getDatabase } from '../db';

interface AppSettingsRow {
  id: number;
  debug_mode: number;
  onboarding_complete: number;
  selected_model: string | null;
  ollama_config: string | null;
  litellm_config: string | null;
}

interface AppSettings {
  debugMode: boolean;
  onboardingComplete: boolean;
  selectedModel: SelectedModel | null;
  ollamaConfig: OllamaConfig | null;
  litellmConfig: LiteLLMConfig | null;
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

export function getAppSettings(): AppSettings {
  const row = getRow();
  return {
    debugMode: row.debug_mode === 1,
    onboardingComplete: row.onboarding_complete === 1,
    selectedModel: row.selected_model ? JSON.parse(row.selected_model) : null,
    ollamaConfig: row.ollama_config ? JSON.parse(row.ollama_config) : null,
    litellmConfig: row.litellm_config ? JSON.parse(row.litellm_config) : null,
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
      litellm_config = NULL
    WHERE id = 1`
  ).run();
}
