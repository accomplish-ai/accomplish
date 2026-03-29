/** Vertex AI and Azure Foundry provider config builders. */
import type { VertexProviderCredentials } from '../common/types/providerSettings.js';
import { getAzureFoundryConfig } from '../storage/repositories/index.js';
import { ensureAzureFoundryProxy } from './proxies/index.js';
import { createConsoleLogger } from '../utils/logging.js';
import type { ProviderConfig, ProviderModelConfig } from './config-generator.js';
import type { ProviderBuildContext, ProviderBuildResult } from './config-provider-context.js';

const log = createConsoleLogger({ prefix: 'OpenCodeConfigBuilder' });

async function buildAzureFoundryProviderConfig(
  endpoint: string,
  deploymentName: string,
  authMethod: 'api-key' | 'entra-id',
  getApiKey: (provider: string) => string | undefined | null,
  azureFoundryToken?: string,
): Promise<ProviderConfig | null> {
  const baseUrl = endpoint.replace(/\/$/, '');
  const targetBaseUrl = `${baseUrl}/openai/v1`;
  const proxyInfo = await ensureAzureFoundryProxy(targetBaseUrl);
  const azureOptions: ProviderConfig['options'] = { baseURL: proxyInfo.baseURL };
  if (authMethod === 'api-key') {
    const azureApiKey = getApiKey('azure-foundry');
    if (azureApiKey) {
      azureOptions.apiKey = azureApiKey;
    }
  } else if (authMethod === 'entra-id') {
    if (!azureFoundryToken) {
      return null;
    }
    azureOptions.apiKey = '';
    azureOptions.headers = { Authorization: `Bearer ${azureFoundryToken}` };
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
        limit: { context: 128000, output: 16384 },
      },
    },
  };
}

export async function buildVertexConfig(ctx: ProviderBuildContext): Promise<ProviderBuildResult> {
  const { providerSettings, activeModel } = ctx;
  const vertexProvider = providerSettings.connectedProviders.vertex;
  if (
    vertexProvider?.connectionStatus !== 'connected' ||
    vertexProvider.credentials.type !== 'vertex'
  ) {
    return { configs: [], enableToAdd: [] };
  }
  const creds = vertexProvider.credentials as VertexProviderCredentials;
  const vertexOptions: Record<string, string> = {
    project: creds.projectId,
    location: creds.location,
  };
  const vertexModels: Record<string, ProviderModelConfig> = {};
  if (activeModel?.provider === 'vertex' && activeModel.model) {
    // Normalize: strip any leading "vertex/" prefix (including "vertex/<segment>/")
    const modelId = activeModel.model.replace(/^vertex\/(?:[^/]+\/)?/, '');
    vertexModels[modelId] = { name: modelId, tools: true };
  }
  log.info('[OpenCode Config Builder] Vertex AI configured:', {
    options: vertexOptions,
    models: Object.keys(vertexModels),
  });
  let modelOverride: { model: string; smallModel: string } | undefined;
  if (activeModel?.provider === 'vertex' && activeModel.model) {
    const vertexModelId = activeModel.model.replace(/^vertex\/(?:[^/]+\/)?/, '');
    modelOverride = { model: `vertex/${vertexModelId}`, smallModel: `vertex/${vertexModelId}` };
  }
  return {
    configs: [
      {
        id: 'vertex',
        npm: '@ai-sdk/google-vertex',
        name: 'Google Vertex AI',
        options: vertexOptions,
        ...(Object.keys(vertexModels).length > 0 ? { models: vertexModels } : {}),
      },
    ],
    enableToAdd: [],
    modelOverride,
  };
}

export async function buildAzureFoundryConfig(
  ctx: ProviderBuildContext,
): Promise<ProviderBuildResult> {
  const { providerSettings, getApiKey, azureFoundryToken, activeModel } = ctx;
  const azureFoundryProvider = providerSettings.connectedProviders['azure-foundry'];
  if (
    azureFoundryProvider?.connectionStatus === 'connected' &&
    azureFoundryProvider.credentials.type === 'azure-foundry'
  ) {
    const creds = azureFoundryProvider.credentials;
    let config: ProviderConfig | null = null;
    try {
      config = await buildAzureFoundryProviderConfig(
        creds.endpoint,
        creds.deploymentName,
        creds.authMethod,
        getApiKey,
        azureFoundryToken,
      );
    } catch (error) {
      log.error('[OpenCode Config Builder] Azure Foundry config build failed:', {
        error: String(error),
      });
      return { configs: [], enableToAdd: [] };
    }
    if (config) {
      log.info('[OpenCode Config Builder] Azure Foundry configured:', {
        deployment: creds.deploymentName,
        authMethod: creds.authMethod,
      });
      return { configs: [config], enableToAdd: ['azure-foundry'] };
    }
    return { configs: [], enableToAdd: [] };
  }

  // Legacy path
  const azureFoundryConfig = getAzureFoundryConfig();
  if (azureFoundryConfig?.enabled && activeModel?.provider === 'azure-foundry') {
    let config: ProviderConfig | null = null;
    try {
      config = await buildAzureFoundryProviderConfig(
        azureFoundryConfig.baseUrl,
        azureFoundryConfig.deploymentName || 'default',
        azureFoundryConfig.authType,
        getApiKey,
        azureFoundryToken,
      );
    } catch (error) {
      log.error('[OpenCode Config Builder] Azure Foundry (legacy) config build failed:', {
        error: String(error),
      });
      return { configs: [], enableToAdd: [] };
    }
    if (config) {
      log.info('[OpenCode Config Builder] Azure Foundry (legacy) configured:', {
        deployment: azureFoundryConfig.deploymentName,
        authType: azureFoundryConfig.authType,
      });
      return { configs: [config], enableToAdd: ['azure-foundry'] };
    }
  }
  return { configs: [], enableToAdd: [] };
}
