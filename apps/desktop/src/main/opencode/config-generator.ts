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
import type { BedrockCredentials, ProviderId, ZaiCredentials, AzureFoundryCredentials } from '@accomplish/shared';

// Re-export for external use
export { ACCOMPLISH_AGENT_NAME };

/**
 * Get the MCP tools directory path (contains MCP servers)
 * In dev: packages/core/mcp-tools (relative to repo root)
 * In packaged: resources/mcp-tools (unpacked from asar)
 */
export function getMcpToolsPath(): string {
  if (app.isPackaged) {
    // In packaged app, mcp-tools should be in resources folder (unpacked from asar)
    return path.join(process.resourcesPath, 'mcp-tools');
  } else {
    // In development, app.getAppPath() returns apps/desktop
    // MCP tools are now in packages/core/mcp-tools
    return path.join(app.getAppPath(), '..', '..', 'packages', 'core', 'mcp-tools');
  }
}

/**
 * Get the OpenCode config directory path (parent of mcp-tools/ for OPENCODE_CONFIG_DIR)
 * OpenCode looks for MCP tools at $OPENCODE_CONFIG_DIR/mcp-tools/<name>/
 */
export function getOpenCodeConfigDir(): string {
  if (app.isPackaged) {
    return process.resourcesPath;
  } else {
    // In development, MCP tools are at packages/core/mcp-tools
    // So the config dir is packages/core
    return path.join(app.getAppPath(), '..', '..', 'packages', 'core');
  }
}

/**
 * Map our provider IDs to OpenCode CLI provider names
 */
const PROVIDER_ID_TO_OPENCODE: Record<ProviderId, string> = {
  anthropic: 'anthropic',
  openai: 'openai',
  google: 'google',
  xai: 'xai',
  deepseek: 'deepseek',
  moonshot: 'moonshot',
  zai: 'zai-coding-plan',
  bedrock: 'amazon-bedrock',
  'azure-foundry': 'azure-foundry',
  ollama: 'ollama',
  openrouter: 'openrouter',
  litellm: 'litellm',
  minimax: 'minimax',
  lmstudio: 'lmstudio',
};


/**
 * Build Azure Foundry provider configuration for OpenCode CLI
 */
async function buildAzureFoundryProviderConfig(
  endpoint: string,
  deploymentName: string,
  authMethod: 'api-key' | 'entra-id',
  azureFoundryToken?: string
): Promise<ProviderConfig | null> {
  const baseUrl = endpoint.replace(/\/$/, '');
  const targetBaseUrl = `${baseUrl}/openai/v1`;
  const proxyInfo = await ensureAzureFoundryProxy(targetBaseUrl);

  // Build options for @ai-sdk/openai-compatible provider
  const azureOptions: ProviderConfig['options'] = {
    baseURL: proxyInfo.baseURL,
  };

  // Set API key or Entra ID token
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
 * Build all provider configurations from Electron secure storage
 */
async function buildProviderConfigs(azureFoundryToken?: string): Promise<{
  providerConfigs: ProviderConfig[];
  enabledProviders: string[];
  modelOverride?: { model: string; smallModel: string };
}> {
  const providerSettings = getProviderSettings();
  const connectedIds = getConnectedProviderIds();
  const activeModel = getActiveProviderModel();
  const providerConfigs: ProviderConfig[] = [];

  // Build enabled providers list
  const baseProviders = ['anthropic', 'openai', 'openrouter', 'google', 'xai', 'deepseek', 'moonshot', 'zai-coding-plan', 'amazon-bedrock', 'minimax'];
  let enabledProviders = baseProviders;

  if (connectedIds.length > 0) {
    const mappedProviders = connectedIds.map(id => PROVIDER_ID_TO_OPENCODE[id]);
    enabledProviders = [...new Set([...baseProviders, ...mappedProviders])];
    console.log('[OpenCode Config] Using connected providers:', mappedProviders);
  } else {
    // Legacy fallback: add ollama if configured
    const ollamaConfig = getOllamaConfig();
    if (ollamaConfig?.enabled) {
      enabledProviders = [...baseProviders, 'ollama'];
    }
  }

  // Configure Ollama
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
    // Legacy fallback
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

  // Configure OpenRouter
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
    // Legacy fallback
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

  // Configure Moonshot
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

  // Configure Bedrock - uses @ai-sdk/amazon-bedrock provider with region/profile options
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

    // Add Bedrock as a provider config so OpenCode CLI can use it
    providerConfigs.push({
      id: 'amazon-bedrock',
      npm: '@ai-sdk/amazon-bedrock',
      name: 'Amazon Bedrock',
      options: bedrockOptions,
      models: {},
    });
    console.log('[OpenCode Config] Bedrock configured:', bedrockOptions);
  } else {
    // Legacy fallback
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

  // For Bedrock, set model overrides so both model and small_model use the same value
  if (activeModel?.provider === 'bedrock' && activeModel.model) {
    modelOverride = {
      model: activeModel.model,
      smallModel: activeModel.model,
    };
    console.log('[OpenCode Config] Bedrock model override:', modelOverride);
  }

  // Configure LiteLLM
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

  // Configure LM Studio
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
    // Legacy fallback
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

  // Configure Azure Foundry
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
    // Legacy fallback
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

  // Configure Z.AI Coding Plan
  const zaiKey = getApiKey('zai');
  if (zaiKey) {
    const zaiCredentials = providerSettings.connectedProviders.zai?.credentials as ZaiCredentials | undefined;
    const zaiRegion = zaiCredentials?.region || 'international';
    const zaiEndpoint = zaiRegion === 'china'
      ? 'https://open.bigmodel.cn/api/paas/v4'
      : 'https://api.z.ai/api/coding/paas/v4';

    providerConfigs.push({
      id: 'zai-coding-plan',
      npm: '@ai-sdk/openai-compatible',
      name: 'Z.AI Coding Plan',
      options: { baseURL: zaiEndpoint },
      models: {
        'glm-4.7-flashx': { name: 'GLM-4.7 FlashX (Latest)', tools: true },
        'glm-4.7': { name: 'GLM-4.7', tools: true },
        'glm-4.7-flash': { name: 'GLM-4.7 Flash', tools: true },
        'glm-4.6': { name: 'GLM-4.6', tools: true },
        'glm-4.5-flash': { name: 'GLM-4.5 Flash', tools: true },
      },
    });
    console.log('[OpenCode Config] Z.AI Coding Plan configured, region:', zaiRegion);
  }

  return { providerConfigs, enabledProviders, modelOverride };
}

/**
 * Generate OpenCode configuration file
 * Delegates to core's generateConfig() while providing Electron-specific data
 * @param azureFoundryToken - Optional Entra ID token for Azure Foundry authentication
 */
export async function generateOpenCodeConfig(azureFoundryToken?: string): Promise<string> {
  // Collect Electron-specific paths
  const mcpToolsPath = getMcpToolsPath();
  const userDataPath = app.getPath('userData');
  const nodePath = getNodePath();
  const bundledNodeBinPath = nodePath ? path.dirname(nodePath) : undefined;

  console.log('[OpenCode Config] MCP tools path:', mcpToolsPath);
  console.log('[OpenCode Config] User data path:', userDataPath);

  // Build provider configurations from secure storage
  const { providerConfigs, enabledProviders, modelOverride } = await buildProviderConfigs(azureFoundryToken);

  // Get enabled skills
  const enabledSkills = await skillsManager.getEnabled();

  // Call core's generateConfig with all the collected data
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

  // Set environment variables
  process.env.OPENCODE_CONFIG = result.configPath;
  process.env.OPENCODE_CONFIG_DIR = path.dirname(result.configPath);

  console.log('[OpenCode Config] Generated config at:', result.configPath);
  console.log('[OpenCode Config] OPENCODE_CONFIG env set to:', process.env.OPENCODE_CONFIG);
  console.log('[OpenCode Config] OPENCODE_CONFIG_DIR env set to:', process.env.OPENCODE_CONFIG_DIR);

  return result.configPath;
}

/**
 * Get the path where OpenCode config is stored
 */
export function getOpenCodeConfigPath(): string {
  return path.join(app.getPath('userData'), 'opencode', 'opencode.json');
}

/**
 * Get the path to OpenCode CLI's auth.json
 * OpenCode stores credentials in ~/.local/share/opencode/auth.json
 */
export function getOpenCodeAuthPath(): string {
  const homeDir = app.getPath('home');
  if (process.platform === 'win32') {
    return path.join(homeDir, 'AppData', 'Local', 'opencode', 'auth.json');
  }
  return path.join(homeDir, '.local', 'share', 'opencode', 'auth.json');
}

/**
 * Sync API keys from Accomplish's secure storage to OpenCode CLI's auth.json
 * This allows OpenCode CLI to recognize DeepSeek and Z.AI providers
 */
export async function syncApiKeysToOpenCodeAuth(): Promise<void> {
  const { getAllApiKeys } = await import('../store/secureStorage');
  const apiKeys = await getAllApiKeys();

  const authPath = getOpenCodeAuthPath();
  const authDir = path.dirname(authPath);

  // Ensure directory exists
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
  }

  // Read existing auth.json or create empty object
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

  // Sync DeepSeek API key
  if (apiKeys.deepseek) {
    if (!auth['deepseek'] || auth['deepseek'].key !== apiKeys.deepseek) {
      auth['deepseek'] = { type: 'api', key: apiKeys.deepseek };
      updated = true;
      console.log('[OpenCode Auth] Synced DeepSeek API key');
    }
  }

  // Sync Z.AI Coding Plan API key
  if (apiKeys.zai) {
    if (!auth['zai-coding-plan'] || auth['zai-coding-plan'].key !== apiKeys.zai) {
      auth['zai-coding-plan'] = { type: 'api', key: apiKeys.zai };
      updated = true;
      console.log('[OpenCode Auth] Synced Z.AI Coding Plan API key');
    }
  }

  // Sync MiniMax API key
  if (apiKeys.minimax) {
    if (!auth.minimax || auth.minimax.key !== apiKeys.minimax) {
      auth.minimax = { type: 'api', key: apiKeys.minimax };
      updated = true;
      console.log('[OpenCode Auth] Synced MiniMax API key');
    }
  }

  // Write updated auth.json
  if (updated) {
    fs.writeFileSync(authPath, JSON.stringify(auth, null, 2));
    console.log('[OpenCode Auth] Updated auth.json at:', authPath);
  }
}
