import type { ProviderSettings } from '../common/types/providerSettings.js';
import { PROVIDER_ID_TO_OPENCODE } from '../common/index.js';
import type { ProviderConfig } from './config-generator.js';
import {
  getProviderSettings,
  getActiveProviderModel,
  getConnectedProviderIds,
  getOllamaConfig,
} from '../storage/repositories/index.js';
import { OPENAI_COMPATIBLE_PROVIDER_IDS } from './config-auth-sync.js';
export { syncApiKeysToOpenCodeAuth } from './config-auth-sync.js';
import { buildOllamaConfig, buildLMStudioConfig } from './config-providers-local.js';
import { buildBedrockConfig } from './config-providers-bedrock.js';
import { buildVertexConfig, buildAzureFoundryConfig } from './config-providers-vertex-azure.js';
import { buildXaiConfig, buildGoogleConfig, buildZaiConfig } from './config-providers-ai-cloud.js';
import {
  buildOpenRouterConfig,
  buildMoonshotConfig,
  buildLiteLLMConfig,
  buildMinimaxConfig,
} from './config-providers-standard.js';
import {
  buildNimConfig,
  buildCustomConfig,
  buildOpenAICompatibleConfigs,
  buildCopilotConfig,
} from './config-providers-compat.js';

/**
 * Paths required for config generation (Electron-specific resolution stays in desktop)
 */
export interface ConfigPaths {
  mcpToolsPath: string;
  userDataPath: string;
  configDir: string;
}

/**
 * Result of building provider configurations
 */
export interface ProviderConfigResult {
  providerConfigs: ProviderConfig[];
  enabledProviders: string[];
  modelOverride?: { model: string; smallModel: string };
}

/**
 * Options for building provider configs
 */
export interface BuildProviderConfigsOptions {
  /**
   * Function to get an API key for a provider.
   * Returns string if found, undefined or null if not found.
   */
  getApiKey: (provider: string) => string | undefined | null;
  /**
   * Azure Foundry token for Entra ID authentication
   */
  azureFoundryToken?: string;
  /**
   * Optional provider settings override (defaults to calling getProviderSettings())
   */
  providerSettings?: ProviderSettings;
}

/**
 * Builds provider configurations for OpenCode CLI by delegating to per-provider builders.
 * Each builder returns configs + extra enabled IDs + optional model override.
 */
export async function buildProviderConfigs(
  options: BuildProviderConfigsOptions,
): Promise<ProviderConfigResult> {
  const { getApiKey, azureFoundryToken } = options;
  const providerSettings = options.providerSettings ?? getProviderSettings();
  const connectedIds = getConnectedProviderIds();
  const activeModel = getActiveProviderModel();
  const ctx = { providerSettings, getApiKey, azureFoundryToken, activeModel };

  const baseProviders = [
    'anthropic',
    'openai',
    'openrouter',
    'google',
    'xai',
    'deepseek',
    'moonshot',
    'zai-coding-plan',
    'amazon-bedrock',
    'vertex',
    'minimax',
    ...OPENAI_COMPATIBLE_PROVIDER_IDS,
  ];
  let enabledProviders = baseProviders;
  if (connectedIds.length > 0) {
    const mappedProviders = connectedIds.map((id) => PROVIDER_ID_TO_OPENCODE[id]);
    enabledProviders = [...new Set([...baseProviders, ...mappedProviders])];
  } else {
    const ollamaConfig = getOllamaConfig();
    if (ollamaConfig?.enabled) {
      enabledProviders = [...baseProviders, 'ollama'];
    }
  }

  const results = await Promise.all([
    buildOllamaConfig(ctx),
    buildLMStudioConfig(ctx),
    buildOpenRouterConfig(ctx),
    buildMoonshotConfig(ctx),
    buildLiteLLMConfig(ctx),
    buildMinimaxConfig(ctx),
    buildXaiConfig(ctx),
    buildGoogleConfig(ctx),
    buildZaiConfig(ctx),
    buildBedrockConfig(ctx),
    buildVertexConfig(ctx),
    buildAzureFoundryConfig(ctx),
    buildNimConfig(ctx),
    buildCustomConfig(ctx),
    buildOpenAICompatibleConfigs(ctx),
    buildCopilotConfig(ctx),
  ]);

  const providerConfigs: ProviderConfig[] = [];
  let modelOverride: { model: string; smallModel: string } | undefined;

  for (const result of results) {
    providerConfigs.push(...result.configs);
    for (const id of result.enableToAdd) {
      if (!enabledProviders.includes(id)) {
        enabledProviders.push(id);
      }
    }
    if (result.modelOverride) {
      modelOverride = result.modelOverride;
    }
  }

  return { providerConfigs, enabledProviders, modelOverride };
}
