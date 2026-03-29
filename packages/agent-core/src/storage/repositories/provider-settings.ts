import type {
  SelectedModel,
  OllamaConfig,
  LiteLLMConfig,
  AzureFoundryConfig,
  LMStudioConfig,
  HuggingFaceLocalConfig,
  NimConfig,
} from '../../common/types/provider.js';
import { getDatabase } from '../database.js';
import { safeParseJsonWithFallback } from '../../utils/json.js';

interface AppSettingsProviderRow {
  selected_model: string | null;
  ollama_config: string | null;
  litellm_config: string | null;
  azure_foundry_config: string | null;
  lmstudio_config: string | null;
  huggingface_local_config: string | null;
  openai_base_url: string | null;
  nim_config: string | null;
}

function getProviderRow(): AppSettingsProviderRow {
  const db = getDatabase();
  const row = db
    .prepare(
      'SELECT selected_model, ollama_config, litellm_config, azure_foundry_config, lmstudio_config, huggingface_local_config, openai_base_url, nim_config FROM app_settings WHERE id = 1',
    )
    .get() as AppSettingsProviderRow | undefined;
  if (!row) {
    throw new Error('app_settings row not found — database may not be initialized');
  }
  return row;
}

export function getSelectedModel(): SelectedModel | null {
  return safeParseJsonWithFallback<SelectedModel>(getProviderRow().selected_model);
}

export function setSelectedModel(model: SelectedModel): void {
  const db = getDatabase();
  db.prepare('UPDATE app_settings SET selected_model = ? WHERE id = 1').run(JSON.stringify(model));
}

export function getOllamaConfig(): OllamaConfig | null {
  return safeParseJsonWithFallback<OllamaConfig>(getProviderRow().ollama_config);
}

export function setOllamaConfig(config: OllamaConfig | null): void {
  const db = getDatabase();
  db.prepare('UPDATE app_settings SET ollama_config = ? WHERE id = 1').run(
    config ? JSON.stringify(config) : null,
  );
}

export function getLiteLLMConfig(): LiteLLMConfig | null {
  return safeParseJsonWithFallback<LiteLLMConfig>(getProviderRow().litellm_config);
}

export function setLiteLLMConfig(config: LiteLLMConfig | null): void {
  const db = getDatabase();
  db.prepare('UPDATE app_settings SET litellm_config = ? WHERE id = 1').run(
    config ? JSON.stringify(config) : null,
  );
}

export function getAzureFoundryConfig(): AzureFoundryConfig | null {
  return safeParseJsonWithFallback<AzureFoundryConfig>(getProviderRow().azure_foundry_config);
}

export function setAzureFoundryConfig(config: AzureFoundryConfig | null): void {
  const db = getDatabase();
  db.prepare('UPDATE app_settings SET azure_foundry_config = ? WHERE id = 1').run(
    config ? JSON.stringify(config) : null,
  );
}

export function getLMStudioConfig(): LMStudioConfig | null {
  return safeParseJsonWithFallback<LMStudioConfig>(getProviderRow().lmstudio_config);
}

export function setLMStudioConfig(config: LMStudioConfig | null): void {
  const db = getDatabase();
  db.prepare('UPDATE app_settings SET lmstudio_config = ? WHERE id = 1').run(
    config ? JSON.stringify(config) : null,
  );
}

export function getHuggingFaceLocalConfig(): HuggingFaceLocalConfig | null {
  return safeParseJsonWithFallback<HuggingFaceLocalConfig>(getProviderRow().huggingface_local_config);
}

export function setHuggingFaceLocalConfig(config: HuggingFaceLocalConfig | null): void {
  const db = getDatabase();
  db.prepare('UPDATE app_settings SET huggingface_local_config = ? WHERE id = 1').run(
    config ? JSON.stringify(config) : null,
  );
}

export function getNimConfig(): NimConfig | null {
  return safeParseJsonWithFallback<NimConfig>(getProviderRow().nim_config);
}

export function setNimConfig(config: NimConfig | null): void {
  const db = getDatabase();
  db.prepare('UPDATE app_settings SET nim_config = ? WHERE id = 1').run(
    config ? JSON.stringify(config) : null,
  );
}

export function getOpenAiBaseUrl(): string {
  const row = getProviderRow();
  return row.openai_base_url || '';
}

export function setOpenAiBaseUrl(baseUrl: string): void {
  const db = getDatabase();
  db.prepare('UPDATE app_settings SET openai_base_url = ? WHERE id = 1').run(baseUrl || '');
}
