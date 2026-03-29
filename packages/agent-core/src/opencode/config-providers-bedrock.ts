/** Bedrock provider config builder. */
import type { BedrockCredentials } from '../common/types/auth.js';
import { createConsoleLogger } from '../utils/logging.js';
import type { ProviderModelConfig } from './config-generator.js';
import type { ProviderBuildContext, ProviderBuildResult } from './config-provider-context.js';

const log = createConsoleLogger({ prefix: 'OpenCodeConfigBuilder' });

export async function buildBedrockConfig(ctx: ProviderBuildContext): Promise<ProviderBuildResult> {
  const { providerSettings, getApiKey, activeModel } = ctx;
  const bedrockProvider = providerSettings.connectedProviders.bedrock;

  if (
    bedrockProvider?.connectionStatus === 'connected' &&
    bedrockProvider.credentials.type === 'bedrock'
  ) {
    const creds = bedrockProvider.credentials;
    const bedrockOptions: Record<string, string> = {
      region: creds.region || 'us-east-1',
    };
    if (creds.authMethod === 'profile' && creds.profileName) {
      bedrockOptions.profile = creds.profileName;
    }
    const bedrockModels: Record<string, ProviderModelConfig> = {};
    if (activeModel?.provider === 'bedrock' && activeModel.model) {
      const modelId = activeModel.model.replace(/^amazon-bedrock\//, '');
      bedrockModels[modelId] = { name: modelId, tools: true };
    }
    log.info('[OpenCode Config Builder] Bedrock configured:', {
      options: bedrockOptions,
      models: Object.keys(bedrockModels),
    });
    const modelOverride =
      activeModel?.provider === 'bedrock' && activeModel.model
        ? { model: activeModel.model, smallModel: activeModel.model }
        : undefined;
    return {
      configs: [
        {
          id: 'amazon-bedrock',
          options: bedrockOptions,
          ...(Object.keys(bedrockModels).length > 0 ? { models: bedrockModels } : {}),
        },
      ],
      enableToAdd: [],
      modelOverride,
    };
  }

  // Legacy path: API key stored as JSON
  const bedrockCredsJson = getApiKey('bedrock');
  if (!bedrockCredsJson) {
    return { configs: [], enableToAdd: [] };
  }
  try {
    const creds = JSON.parse(bedrockCredsJson) as BedrockCredentials;
    const bedrockOptions: Record<string, string> = {
      region: creds.region || 'us-east-1',
    };
    if (creds.authType === 'profile' && creds.profileName) {
      bedrockOptions.profile = creds.profileName;
    }
    const bedrockModels: Record<string, ProviderModelConfig> = {};
    if (activeModel?.provider === 'bedrock' && activeModel.model) {
      const modelId = activeModel.model.replace(/^amazon-bedrock\//, '');
      bedrockModels[modelId] = { name: modelId, tools: true };
    }
    log.info('[OpenCode Config Builder] Bedrock (legacy) configured:', {
      options: bedrockOptions,
      models: Object.keys(bedrockModels),
    });
    const modelOverride =
      activeModel?.provider === 'bedrock' && activeModel.model
        ? { model: activeModel.model, smallModel: activeModel.model }
        : undefined;
    return {
      configs: [
        {
          id: 'amazon-bedrock',
          options: bedrockOptions,
          ...(Object.keys(bedrockModels).length > 0 ? { models: bedrockModels } : {}),
        },
      ],
      enableToAdd: [],
      modelOverride,
    };
  } catch (e) {
    log.warn(`[OpenCode Config Builder] Failed to parse Bedrock credentials: ${e}`);
    return { configs: [], enableToAdd: [] };
  }
}
