import path from 'path';
import fs from 'fs';
import type { ProviderId, ZaiCredentials } from '../common/types/providerSettings.js';
import type { BedrockCredentials } from '../common/types/auth.js';
import type { ProviderSettings } from '../common/types/providerSettings.js';
import {
  ZAI_ENDPOINTS,
  DEFAULT_PROVIDERS,
  PROVIDER_ID_TO_OPENCODE,
} from '../common/index.js';
import type { ProviderConfig, ProviderModelConfig } from './config-generator.js';
import { ensureAzureFoundryProxy, ensureMoonshotProxy } from './proxies/index.js';
import {
  getOllamaConfig,
  getLMStudioConfig,
  getProviderSettings,
  getActiveProviderModel,
  getConnectedProviderIds,
  getAzureFoundryConfig,
  getSelectedModel,
} from '../storage/repositories/index.js';

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

async function buildAzureFoundryProviderConfig(
  endpoint: string,
  deploymentName: string,
  authMethod: 'api-key' | 'entra-id',
  getApiKey: (provider: string) => string | undefined | null,
  azureFoundryToken?: string
): Promise<ProviderConfig | null> {
  const baseUrl = endpoint.replace(/\/$/, '');
  const targetBaseUrl = `${baseUrl}/openai/v1`;
  const proxyInfo = await ensureAzureFoundryProxy(targetBaseUrl);

  const azureOptions: ProviderConfig['options'] = {
    baseURL: proxyInfo.baseURL,
  };

  if (authMethod === 'api-key') {
    const azureApiKey = getApiKey('azure-foundry');
    if (azureApiKey) {
      azureOptions.apiKey = azureApiKey;
    }
  } else if (authMethod === 'entra-id' && azureFoundryToken) {
    azureOptions.apiKey = '';
    azureOptions.headers = {
      'Authorization': `Bearer ${azureFoundryToken}`,
    };
  }

  return {
    id: 'azure-foundry',
    npm: '@ai-sdk/openai-compatible',
    name: 'Azure AI Foundry',
    options: azureOptions,
    models: {
      [deploymentName]: {
        name: `Azure Foundry (${deploymentName})`,
        tools: true,
        limit: {
          context: 128000,
          output: 16384,
        },
      },
    },
  };
}

/**
 * Builds provider configurations for OpenCode CLI.
 *
 * This function extracts the reusable provider config building logic from the desktop app.
 * Electron-specific path resolution (getMcpToolsPath using app.isPackaged, process.resourcesPath)
 * stays in the desktop app.
 *
 * @param options - Options for building provider configs
 * @returns Provider configurations, enabled providers list, and optional model override
 */
export async function buildProviderConfigs(
  options: BuildProviderConfigsOptions
): Promise<ProviderConfigResult> {
  const { getApiKey, azureFoundryToken } = options;
  const providerSettings = options.providerSettings ?? getProviderSettings();
  const connectedIds = getConnectedProviderIds();
  const activeModel = getActiveProviderModel();
  const providerConfigs: ProviderConfig[] = [];

  const baseProviders = ['anthropic', 'openai', 'openrouter', 'google', 'xai', 'deepseek', 'moonshot', 'zai-coding-plan', 'amazon-bedrock', 'minimax'];
  let enabledProviders = baseProviders;

  if (connectedIds.length > 0) {
    const mappedProviders = connectedIds.map(id => PROVIDER_ID_TO_OPENCODE[id]);
    enabledProviders = [...new Set([...baseProviders, ...mappedProviders])];
    console.log('[OpenCode Config Builder] Using connected providers:', mappedProviders);
  } else {
    const ollamaConfig = getOllamaConfig();
    if (ollamaConfig?.enabled) {
      enabledProviders = [...baseProviders, 'ollama'];
    }
  }

  // Ollama provider
  const ollamaProvider = providerSettings.connectedProviders.ollama;
  if (ollamaProvider?.connectionStatus === 'connected' && ollamaProvider.credentials.type === 'ollama') {
    if (ollamaProvider.selectedModelId) {
      const modelId = ollamaProvider.selectedModelId.replace(/^ollama\//, '');
      providerConfigs.push({
        id: 'ollama',
        npm: '@ai-sdk/openai-compatible',
        name: 'Ollama (local)',
        options: {
          baseURL: `${ollamaProvider.credentials.serverUrl}/v1`,
        },
        models: {
          [modelId]: { name: modelId, tools: true },
        },
      });
      console.log('[OpenCode Config Builder] Ollama configured:', modelId);
    }
  } else {
    const ollamaConfig = getOllamaConfig();
    const ollamaModels = ollamaConfig?.models;
    if (ollamaConfig?.enabled && ollamaModels && ollamaModels.length > 0) {
      const models: Record<string, ProviderModelConfig> = {};
      for (const model of ollamaModels) {
        models[model.id] = { name: model.displayName, tools: true };
      }
      providerConfigs.push({
        id: 'ollama',
        npm: '@ai-sdk/openai-compatible',
        name: 'Ollama (local)',
        options: { baseURL: `${ollamaConfig.baseUrl}/v1` },
        models,
      });
      console.log('[OpenCode Config Builder] Ollama (legacy) configured:', Object.keys(models));
    }
  }

  // OpenRouter provider
  const openrouterProvider = providerSettings.connectedProviders.openrouter;
  if (openrouterProvider?.connectionStatus === 'connected' && activeModel?.provider === 'openrouter') {
    const modelId = activeModel.model.replace('openrouter/', '');
    providerConfigs.push({
      id: 'openrouter',
      npm: '@ai-sdk/openai-compatible',
      name: 'OpenRouter',
      options: { baseURL: 'https://openrouter.ai/api/v1' },
      models: {
        [modelId]: { name: modelId, tools: true },
      },
    });
    console.log('[OpenCode Config Builder] OpenRouter configured:', modelId);
  } else {
    const openrouterKey = getApiKey('openrouter');
    if (openrouterKey) {
      const selectedModel = getSelectedModel();
      if (selectedModel?.provider === 'openrouter' && selectedModel.model) {
        const modelId = selectedModel.model.replace('openrouter/', '');
        providerConfigs.push({
          id: 'openrouter',
          npm: '@ai-sdk/openai-compatible',
          name: 'OpenRouter',
          options: { baseURL: 'https://openrouter.ai/api/v1' },
          models: {
            [modelId]: { name: modelId, tools: true },
          },
        });
        console.log('[OpenCode Config Builder] OpenRouter (legacy) configured:', modelId);
      }
    }
  }

  // Moonshot provider
  const moonshotProvider = providerSettings.connectedProviders.moonshot;
  if (moonshotProvider?.connectionStatus === 'connected' && moonshotProvider.selectedModelId) {
    const modelId = moonshotProvider.selectedModelId.replace(/^moonshot\//, '');
    const moonshotApiKey = getApiKey('moonshot');
    const proxyInfo = await ensureMoonshotProxy('https://api.moonshot.ai/v1');
    providerConfigs.push({
      id: 'moonshot',
      npm: '@ai-sdk/openai-compatible',
      name: 'Moonshot AI',
      options: {
        baseURL: proxyInfo.baseURL,
        ...(moonshotApiKey ? { apiKey: moonshotApiKey } : {}),
      },
      models: {
        [modelId]: { name: modelId, tools: true },
      },
    });
    console.log('[OpenCode Config Builder] Moonshot configured:', modelId);
  }

  let modelOverride: { model: string; smallModel: string } | undefined;

  // Bedrock provider
  const bedrockProvider = providerSettings.connectedProviders.bedrock;
  if (bedrockProvider?.connectionStatus === 'connected' && bedrockProvider.credentials.type === 'bedrock') {
    const creds = bedrockProvider.credentials;
    const bedrockOptions: Record<string, string> = {
      region: creds.region || 'us-east-1',
    };
    if (creds.authMethod === 'profile' && creds.profileName) {
      bedrockOptions.profile = creds.profileName;
    }

    // For Bedrock, we need to register the selected model in the models field
    // so OpenCode can find it (otherwise it looks in built-in models which have region prefixes)
    const bedrockModels: Record<string, ProviderModelConfig> = {};
    if (activeModel?.provider === 'bedrock' && activeModel.model) {
      // Extract model ID without provider prefix (e.g., "anthropic.claude-opus..." from "amazon-bedrock/anthropic.claude-opus...")
      const modelId = activeModel.model.replace(/^amazon-bedrock\//, '');
      bedrockModels[modelId] = { name: modelId, tools: true };
    }

    providerConfigs.push({
      id: 'amazon-bedrock',
      options: bedrockOptions,
      ...(Object.keys(bedrockModels).length > 0 ? { models: bedrockModels } : {}),
    });
    console.log('[OpenCode Config Builder] Bedrock configured:', bedrockOptions, 'models:', Object.keys(bedrockModels));
  } else {
    const bedrockCredsJson = getApiKey('bedrock');
    if (bedrockCredsJson) {
      try {
        const creds = JSON.parse(bedrockCredsJson) as BedrockCredentials;
        const bedrockOptions: Record<string, string> = {
          region: creds.region || 'us-east-1',
        };
        if (creds.authType === 'profile' && creds.profileName) {
          bedrockOptions.profile = creds.profileName;
        }

        // For Bedrock, register the selected model so OpenCode can find it
        const bedrockModels: Record<string, ProviderModelConfig> = {};
        if (activeModel?.provider === 'bedrock' && activeModel.model) {
          const modelId = activeModel.model.replace(/^amazon-bedrock\//, '');
          bedrockModels[modelId] = { name: modelId, tools: true };
        }

        providerConfigs.push({
          id: 'amazon-bedrock',
          options: bedrockOptions,
          ...(Object.keys(bedrockModels).length > 0 ? { models: bedrockModels } : {}),
        });
        console.log('[OpenCode Config Builder] Bedrock (legacy) configured:', bedrockOptions, 'models:', Object.keys(bedrockModels));
      } catch (e) {
        console.warn('[OpenCode Config Builder] Failed to parse Bedrock credentials:', e);
      }
    }
  }

  if (activeModel?.provider === 'bedrock' && activeModel.model) {
    modelOverride = {
      model: activeModel.model,
      smallModel: activeModel.model,
    };
    console.log('[OpenCode Config Builder] Bedrock model override:', modelOverride);
  }

  // LiteLLM provider
  const litellmProvider = providerSettings.connectedProviders.litellm;
  if (litellmProvider?.connectionStatus === 'connected' && litellmProvider.credentials.type === 'litellm' && litellmProvider.selectedModelId) {
    const litellmApiKey = getApiKey('litellm');
    providerConfigs.push({
      id: 'litellm',
      npm: '@ai-sdk/openai-compatible',
      name: 'LiteLLM',
      options: {
        baseURL: `${litellmProvider.credentials.serverUrl}/v1`,
        ...(litellmApiKey ? { apiKey: litellmApiKey } : {}),
      },
      models: {
        [litellmProvider.selectedModelId]: { name: litellmProvider.selectedModelId, tools: true },
      },
    });
    console.log('[OpenCode Config Builder] LiteLLM configured:', litellmProvider.selectedModelId);
  }

  // LM Studio provider
  const lmstudioProvider = providerSettings.connectedProviders.lmstudio;
  if (lmstudioProvider?.connectionStatus === 'connected' && lmstudioProvider.credentials.type === 'lmstudio' && lmstudioProvider.selectedModelId) {
    const modelId = lmstudioProvider.selectedModelId.replace(/^lmstudio\//, '');
    const modelInfo = lmstudioProvider.availableModels?.find(
      m => m.id === lmstudioProvider.selectedModelId || m.id === modelId
    );
    const supportsTools = (modelInfo as { toolSupport?: string })?.toolSupport === 'supported';
    providerConfigs.push({
      id: 'lmstudio',
      npm: '@ai-sdk/openai-compatible',
      name: 'LM Studio',
      options: {
        baseURL: `${lmstudioProvider.credentials.serverUrl}/v1`,
      },
      models: {
        [modelId]: { name: modelId, tools: supportsTools },
      },
    });
    console.log(`[OpenCode Config Builder] LM Studio configured: ${modelId} (tools: ${supportsTools})`);
  } else {
    const lmstudioConfig = getLMStudioConfig();
    const lmstudioModels = lmstudioConfig?.models;
    if (lmstudioConfig?.enabled && lmstudioModels && lmstudioModels.length > 0) {
      const models: Record<string, ProviderModelConfig> = {};
      for (const model of lmstudioModels) {
        models[model.id] = { name: model.name, tools: model.toolSupport === 'supported' };
      }
      providerConfigs.push({
        id: 'lmstudio',
        npm: '@ai-sdk/openai-compatible',
        name: 'LM Studio',
        options: { baseURL: `${lmstudioConfig.baseUrl}/v1` },
        models,
      });
      console.log('[OpenCode Config Builder] LM Studio (legacy) configured:', Object.keys(models));
    }
  }

  // Azure Foundry provider
  const azureFoundryProvider = providerSettings.connectedProviders['azure-foundry'];
  if (azureFoundryProvider?.connectionStatus === 'connected' && azureFoundryProvider.credentials.type === 'azure-foundry') {
    const creds = azureFoundryProvider.credentials;
    const config = await buildAzureFoundryProviderConfig(
      creds.endpoint,
      creds.deploymentName,
      creds.authMethod,
      getApiKey,
      azureFoundryToken
    );
    if (config) {
      providerConfigs.push(config);
      if (!enabledProviders.includes('azure-foundry')) {
        enabledProviders.push('azure-foundry');
      }
      console.log('[OpenCode Config Builder] Azure Foundry configured:', {
        deployment: creds.deploymentName,
        authMethod: creds.authMethod,
      });
    }
  } else {
    const azureFoundryConfig = getAzureFoundryConfig();
    if (azureFoundryConfig?.enabled && activeModel?.provider === 'azure-foundry') {
      const config = await buildAzureFoundryProviderConfig(
        azureFoundryConfig.baseUrl,
        azureFoundryConfig.deploymentName || 'default',
        azureFoundryConfig.authType,
        getApiKey,
        azureFoundryToken
      );
      if (config) {
        providerConfigs.push(config);
        if (!enabledProviders.includes('azure-foundry')) {
          enabledProviders.push('azure-foundry');
        }
        console.log('[OpenCode Config Builder] Azure Foundry (legacy) configured:', {
          deployment: azureFoundryConfig.deploymentName,
          authType: azureFoundryConfig.authType,
        });
      }
    }
  }

  // Z.AI provider
  const zaiKey = getApiKey('zai');
  if (zaiKey) {
    const zaiCredentials = providerSettings.connectedProviders.zai?.credentials as ZaiCredentials | undefined;
    const zaiRegion = zaiCredentials?.region || 'international';
    const zaiEndpoint = ZAI_ENDPOINTS[zaiRegion];

    const zaiProviderConfig = DEFAULT_PROVIDERS.find(p => p.id === 'zai');
    const zaiModels: Record<string, ProviderModelConfig> = {};
    if (zaiProviderConfig) {
      for (const model of zaiProviderConfig.models) {
        zaiModels[model.id] = { name: model.displayName, tools: true };
      }
    }

    providerConfigs.push({
      id: 'zai-coding-plan',
      npm: '@ai-sdk/openai-compatible',
      name: 'Z.AI Coding Plan',
      options: { baseURL: zaiEndpoint },
      models: zaiModels,
    });
    console.log('[OpenCode Config Builder] Z.AI Coding Plan configured, region:', zaiRegion);
  }

  return { providerConfigs, enabledProviders, modelOverride };
}

/**
 * API key mapping from internal provider IDs to OpenCode auth.json format.
 * Only providers that need special key mapping in auth.json are included here.
 */
const AUTH_KEY_MAPPING: Record<string, string> = {
  deepseek: 'deepseek',
  zai: 'zai-coding-plan',
  minimax: 'minimax',
};

/**
 * Syncs API keys to OpenCode auth.json file.
 *
 * This function writes API keys to the OpenCode auth.json file so that the CLI
 * can access them. Only specific providers (deepseek, zai, minimax) are synced.
 *
 * @param authPath - Path to the auth.json file
 * @param apiKeys - Record of provider IDs to API keys (null values are ignored)
 */
export async function syncApiKeysToOpenCodeAuth(
  authPath: string,
  apiKeys: Record<string, string | null | undefined>
): Promise<void> {
  const authDir = path.dirname(authPath);

  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
  }

  let auth: Record<string, { type: string; key: string }> = {};
  if (fs.existsSync(authPath)) {
    try {
      auth = JSON.parse(fs.readFileSync(authPath, 'utf-8'));
    } catch (e) {
      console.warn('[OpenCode Auth] Failed to parse existing auth.json, creating new one');
      auth = {};
    }
  }

  let updated = false;

  if (apiKeys.deepseek) {
    if (!auth['deepseek'] || auth['deepseek'].key !== apiKeys.deepseek) {
      auth['deepseek'] = { type: 'api', key: apiKeys.deepseek };
      updated = true;
      console.log('[OpenCode Auth] Synced DeepSeek API key');
    }
  }

  if (apiKeys.zai) {
    if (!auth['zai-coding-plan'] || auth['zai-coding-plan'].key !== apiKeys.zai) {
      auth['zai-coding-plan'] = { type: 'api', key: apiKeys.zai };
      updated = true;
      console.log('[OpenCode Auth] Synced Z.AI Coding Plan API key');
    }
  }

  if (apiKeys.minimax) {
    if (!auth.minimax || auth.minimax.key !== apiKeys.minimax) {
      auth.minimax = { type: 'api', key: apiKeys.minimax };
      updated = true;
      console.log('[OpenCode Auth] Synced MiniMax API key');
    }
  }

  if (updated) {
    fs.writeFileSync(authPath, JSON.stringify(auth, null, 2));
    console.log('[OpenCode Auth] Updated auth.json at:', authPath);
  }
}
