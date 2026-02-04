import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import { PERMISSION_API_PORT, QUESTION_API_PORT } from '../permission-api';
import {
  getOllamaConfig,
  getLMStudioConfig,
  getProviderSettings,
  getActiveProviderModel,
  getConnectedProviderIds,
  ensureAzureFoundryProxy,
  ensureMoonshotProxy,
  generateConfig,
  ACCOMPLISH_AGENT_NAME,
} from '@accomplish/core';
import type { ProviderConfig, ProviderModelConfig } from '@accomplish/core';
import { getApiKey } from '../store/secureStorage';
import { getNodePath } from '../utils/bundled-node';
import { skillsManager } from '../skills';
import { ZAI_ENDPOINTS, DEFAULT_PROVIDERS, PROVIDER_ID_TO_OPENCODE } from '@accomplish/shared';
import type { BedrockCredentials, ProviderId, ZaiCredentials, AzureFoundryCredentials } from '@accomplish/shared';

export { ACCOMPLISH_AGENT_NAME };

export function getMcpToolsPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'mcp-tools');
  } else {
    return path.join(app.getAppPath(), '..', '..', 'packages', 'core', 'mcp-tools');
  }
}

export function getOpenCodeConfigDir(): string {
  if (app.isPackaged) {
    return process.resourcesPath;
  } else {
    return path.join(app.getAppPath(), '..', '..', 'packages', 'core');
  }
}

async function buildAzureFoundryProviderConfig(
  endpoint: string,
  deploymentName: string,
  authMethod: 'api-key' | 'entra-id',
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

async function buildProviderConfigs(azureFoundryToken?: string): Promise<{
  providerConfigs: ProviderConfig[];
  enabledProviders: string[];
  modelOverride?: { model: string; smallModel: string };
}> {
  const providerSettings = getProviderSettings();
  const connectedIds = getConnectedProviderIds();
  const activeModel = getActiveProviderModel();
  const providerConfigs: ProviderConfig[] = [];

  const baseProviders = ['anthropic', 'openai', 'openrouter', 'google', 'xai', 'deepseek', 'moonshot', 'zai-coding-plan', 'amazon-bedrock', 'minimax'];
  let enabledProviders = baseProviders;

  if (connectedIds.length > 0) {
    const mappedProviders = connectedIds.map(id => PROVIDER_ID_TO_OPENCODE[id]);
    enabledProviders = [...new Set([...baseProviders, ...mappedProviders])];
    console.log('[OpenCode Config] Using connected providers:', mappedProviders);
  } else {
    const ollamaConfig = getOllamaConfig();
    if (ollamaConfig?.enabled) {
      enabledProviders = [...baseProviders, 'ollama'];
    }
  }

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
      console.log('[OpenCode Config] Ollama configured:', modelId);
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
      console.log('[OpenCode Config] Ollama (legacy) configured:', Object.keys(models));
    }
  }

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
    console.log('[OpenCode Config] OpenRouter configured:', modelId);
  } else {
    const openrouterKey = getApiKey('openrouter');
    if (openrouterKey) {
      const { getSelectedModel } = await import('@accomplish/core');
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
        console.log('[OpenCode Config] OpenRouter (legacy) configured:', modelId);
      }
    }
  }

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
    console.log('[OpenCode Config] Moonshot configured:', modelId);
  }

  let modelOverride: { model: string; smallModel: string } | undefined;

  const bedrockProvider = providerSettings.connectedProviders.bedrock;
  if (bedrockProvider?.connectionStatus === 'connected' && bedrockProvider.credentials.type === 'bedrock') {
    const creds = bedrockProvider.credentials;
    const bedrockOptions: Record<string, string> = {
      region: creds.region || 'us-east-1',
    };
    if (creds.authMethod === 'profile' && creds.profileName) {
      bedrockOptions.profile = creds.profileName;
    }

    providerConfigs.push({
      id: 'amazon-bedrock',
      npm: '@ai-sdk/amazon-bedrock',
      name: 'Amazon Bedrock',
      options: bedrockOptions,
      models: {},
    });
    console.log('[OpenCode Config] Bedrock configured:', bedrockOptions);
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

        providerConfigs.push({
          id: 'amazon-bedrock',
          npm: '@ai-sdk/amazon-bedrock',
          name: 'Amazon Bedrock',
          options: bedrockOptions,
          models: {},
        });
        console.log('[OpenCode Config] Bedrock (legacy) configured:', bedrockOptions);
      } catch (e) {
        console.warn('[OpenCode Config] Failed to parse Bedrock credentials:', e);
      }
    }
  }

  if (activeModel?.provider === 'bedrock' && activeModel.model) {
    modelOverride = {
      model: activeModel.model,
      smallModel: activeModel.model,
    };
    console.log('[OpenCode Config] Bedrock model override:', modelOverride);
  }

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
    console.log('[OpenCode Config] LiteLLM configured:', litellmProvider.selectedModelId);
  }

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
    console.log(`[OpenCode Config] LM Studio configured: ${modelId} (tools: ${supportsTools})`);
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
      console.log('[OpenCode Config] LM Studio (legacy) configured:', Object.keys(models));
    }
  }

  const azureFoundryProvider = providerSettings.connectedProviders['azure-foundry'];
  if (azureFoundryProvider?.connectionStatus === 'connected' && azureFoundryProvider.credentials.type === 'azure-foundry') {
    const creds = azureFoundryProvider.credentials;
    const config = await buildAzureFoundryProviderConfig(
      creds.endpoint,
      creds.deploymentName,
      creds.authMethod,
      azureFoundryToken
    );
    if (config) {
      providerConfigs.push(config);
      if (!enabledProviders.includes('azure-foundry')) {
        enabledProviders.push('azure-foundry');
      }
      console.log('[OpenCode Config] Azure Foundry configured:', {
        deployment: creds.deploymentName,
        authMethod: creds.authMethod,
      });
    }
  } else {
    const { getAzureFoundryConfig } = await import('@accomplish/core');
    const azureFoundryConfig = getAzureFoundryConfig();
    if (azureFoundryConfig?.enabled && activeModel?.provider === 'azure-foundry') {
      const config = await buildAzureFoundryProviderConfig(
        azureFoundryConfig.baseUrl,
        azureFoundryConfig.deploymentName || 'default',
        azureFoundryConfig.authType,
        azureFoundryToken
      );
      if (config) {
        providerConfigs.push(config);
        if (!enabledProviders.includes('azure-foundry')) {
          enabledProviders.push('azure-foundry');
        }
        console.log('[OpenCode Config] Azure Foundry (legacy) configured:', {
          deployment: azureFoundryConfig.deploymentName,
          authType: azureFoundryConfig.authType,
        });
      }
    }
  }

  const zaiKey = getApiKey('zai');
  if (zaiKey) {
    const zaiCredentials = providerSettings.connectedProviders.zai?.credentials as ZaiCredentials | undefined;
    const zaiRegion = zaiCredentials?.region || 'international';
    const zaiEndpoint = ZAI_ENDPOINTS[zaiRegion];

    // Generate ZAI models from DEFAULT_PROVIDERS
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
    console.log('[OpenCode Config] Z.AI Coding Plan configured, region:', zaiRegion);
  }

  return { providerConfigs, enabledProviders, modelOverride };
}

export async function generateOpenCodeConfig(azureFoundryToken?: string): Promise<string> {
  const mcpToolsPath = getMcpToolsPath();
  const userDataPath = app.getPath('userData');
  const nodePath = getNodePath();
  const bundledNodeBinPath = nodePath ? path.dirname(nodePath) : undefined;

  console.log('[OpenCode Config] MCP tools path:', mcpToolsPath);
  console.log('[OpenCode Config] User data path:', userDataPath);

  const { providerConfigs, enabledProviders, modelOverride } = await buildProviderConfigs(azureFoundryToken);

  const enabledSkills = await skillsManager.getEnabled();

  const result = generateConfig({
    platform: process.platform,
    mcpToolsPath,
    userDataPath,
    isPackaged: app.isPackaged,
    bundledNodeBinPath,
    skills: enabledSkills,
    providerConfigs,
    permissionApiPort: PERMISSION_API_PORT,
    questionApiPort: QUESTION_API_PORT,
    enabledProviders,
    model: modelOverride?.model,
    smallModel: modelOverride?.smallModel,
  });

  process.env.OPENCODE_CONFIG = result.configPath;
  process.env.OPENCODE_CONFIG_DIR = path.dirname(result.configPath);

  console.log('[OpenCode Config] Generated config at:', result.configPath);
  console.log('[OpenCode Config] OPENCODE_CONFIG env set to:', process.env.OPENCODE_CONFIG);
  console.log('[OpenCode Config] OPENCODE_CONFIG_DIR env set to:', process.env.OPENCODE_CONFIG_DIR);

  return result.configPath;
}

export function getOpenCodeConfigPath(): string {
  return path.join(app.getPath('userData'), 'opencode', 'opencode.json');
}

export function getOpenCodeAuthPath(): string {
  const homeDir = app.getPath('home');
  if (process.platform === 'win32') {
    return path.join(homeDir, 'AppData', 'Local', 'opencode', 'auth.json');
  }
  return path.join(homeDir, '.local', 'share', 'opencode', 'auth.json');
}

export async function syncApiKeysToOpenCodeAuth(): Promise<void> {
  const { getAllApiKeys } = await import('../store/secureStorage');
  const apiKeys = await getAllApiKeys();

  const authPath = getOpenCodeAuthPath();
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
