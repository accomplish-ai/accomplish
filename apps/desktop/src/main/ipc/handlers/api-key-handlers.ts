import type { IpcMainInvokeEvent } from 'electron';
import {
  validateApiKey,
  validateBedrockCredentials,
  fetchBedrockModels,
  fetchOpenRouterModels,
  fetchProviderModels,
  sanitizeString,
  getOpenAiOauthAccessToken,
  getOpenAiOauthStatus,
  validateAzureFoundry,
} from '@accomplish_ai/agent-core';
import type { BedrockCredentials } from '@accomplish_ai/agent-core';
import {
  DEFAULT_PROVIDERS,
  ALLOWED_API_KEY_PROVIDERS,
  STANDARD_VALIDATION_PROVIDERS,
  ZAI_ENDPOINTS,
} from '@accomplish_ai/agent-core';
import {
  storeApiKey,
  getApiKey,
  deleteApiKey,
  getAllApiKeys,
  hasAnyApiKey,
  getBedrockCredentials,
} from '../../store/secureStorage';
import { getStorage } from '../../store/storage';
import { normalizeIpcError } from '../../ipc/validation';
import { getLogCollector } from '../../logging';
import { handle, API_KEY_VALIDATION_TIMEOUT_MS } from './utils';

export function registerApiKeyHandlers(): void {
  const storage = getStorage();

  handle('settings:api-keys', async (_event: IpcMainInvokeEvent) => {
    const storedKeys = await getAllApiKeys();

    const keys = Object.entries(storedKeys)
      .filter(([_provider, apiKey]) => apiKey !== null)
      .map(([provider, apiKey]) => {
        let keyPrefix = '';
        if (provider === 'bedrock') {
          const bedrockCreds = getBedrockCredentials();
          if (bedrockCreds) {
            if (bedrockCreds.authType === 'accessKeys') {
              keyPrefix = `${bedrockCreds.accessKeyId?.substring(0, 8) || 'AKIA'}...`;
            } else if (bedrockCreds.authType === 'profile') {
              keyPrefix = `Profile: ${bedrockCreds.profileName || 'default'}`;
            } else {
              keyPrefix = 'AWS Credentials';
            }
          } else {
            keyPrefix = 'AWS Credentials';
          }
        } else if (provider === 'vertex') {
          try {
            const vertexCreds = apiKey ? JSON.parse(apiKey) : null;
            if (vertexCreds?.projectId) {
              keyPrefix = `${vertexCreds.projectId} (${vertexCreds.location || 'unknown'})`;
            } else {
              keyPrefix = 'GCP Credentials';
            }
          } catch {
            keyPrefix = 'GCP Credentials';
          }
        } else {
          keyPrefix = apiKey && apiKey.length > 0 ? `${apiKey.substring(0, 8)}...` : '';
        }

        const labelMap: Record<string, string> = {
          bedrock: 'AWS Credentials',
          vertex: 'GCP Credentials',
        };

        return {
          id: `local-${provider}`,
          provider,
          label: labelMap[provider] || 'Local API Key',
          keyPrefix,
          isActive: true,
          createdAt: new Date().toISOString(),
        };
      });

    const azureConfig = storage.getAzureFoundryConfig();
    const hasAzureKey = keys.some((k) => k.provider === 'azure-foundry');

    if (azureConfig && azureConfig.authType === 'entra-id' && !hasAzureKey) {
      keys.push({
        id: 'local-azure-foundry',
        provider: 'azure-foundry',
        label: 'Azure Foundry (Entra ID)',
        keyPrefix: 'Entra ID',
        isActive: azureConfig.enabled ?? true,
        createdAt: new Date().toISOString(),
      });
    }

    return keys;
  });

  handle(
    'settings:add-api-key',
    async (_event: IpcMainInvokeEvent, provider: string, key: string, label?: string) => {
      if (!ALLOWED_API_KEY_PROVIDERS.has(provider)) {
        throw new Error('Unsupported API key provider');
      }
      const sanitizedKey = sanitizeString(key, 'apiKey', 256);
      const sanitizedLabel = label ? sanitizeString(label, 'label', 128) : undefined;

      await storeApiKey(provider, sanitizedKey);

      return {
        id: `local-${provider}`,
        provider,
        label: sanitizedLabel || 'Local API Key',
        keyPrefix: sanitizedKey.substring(0, 8) + '...',
        isActive: true,
        createdAt: new Date().toISOString(),
      };
    },
  );

  handle('settings:remove-api-key', async (_event: IpcMainInvokeEvent, id: string) => {
    const sanitizedId = sanitizeString(id, 'id', 128);
    const provider = sanitizedId.replace('local-', '');
    await deleteApiKey(provider);
  });

  handle('api-key:exists', async (_event: IpcMainInvokeEvent) => {
    const apiKey = await getApiKey('anthropic');
    return Boolean(apiKey);
  });

  handle('api-key:set', async (_event: IpcMainInvokeEvent, key: string) => {
    const sanitizedKey = sanitizeString(key, 'apiKey', 256);
    await storeApiKey('anthropic', sanitizedKey);
  });

  handle('api-key:get', async (_event: IpcMainInvokeEvent) => {
    return getApiKey('anthropic');
  });

  handle('api-key:validate', async (_event: IpcMainInvokeEvent, key: string) => {
    const sanitizedKey = sanitizeString(key, 'apiKey', 256);
    const logger = getLogCollector();
    logger.logEnv('INFO', '[API Key] Validation requested for provider: anthropic');

    const result = await validateApiKey('anthropic', sanitizedKey, {
      timeout: API_KEY_VALIDATION_TIMEOUT_MS,
    });

    if (result.valid) {
      logger.logEnv('INFO', '[API Key] Validation succeeded');
    } else {
      logger.logEnv('WARN', '[API Key] Validation failed', { error: result.error });
    }

    return result;
  });

  handle(
    'api-key:validate-provider',
    async (
      _event: IpcMainInvokeEvent,
      provider: string,
      key: string,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      options?: Record<string, any>,
    ) => {
      if (!ALLOWED_API_KEY_PROVIDERS.has(provider)) {
        return { valid: false, error: 'Unsupported provider' };
      }

      const logger = getLogCollector();
      logger.logEnv('INFO', `[API Key] Validation requested for provider: ${provider}`);

      if (STANDARD_VALIDATION_PROVIDERS.has(provider)) {
        let sanitizedKey: string;
        try {
          sanitizedKey = sanitizeString(key, 'apiKey', 256);
        } catch (e) {
          return { valid: false, error: e instanceof Error ? e.message : 'Invalid API key' };
        }

        const result = await validateApiKey(
          provider as import('@accomplish_ai/agent-core').ProviderType,
          sanitizedKey,
          {
            timeout: API_KEY_VALIDATION_TIMEOUT_MS,
            baseUrl:
              provider === 'openai' ? storage.getOpenAiBaseUrl().trim() || undefined : undefined,
            zaiRegion:
              provider === 'zai'
                ? (options?.region as import('@accomplish_ai/agent-core').ZaiRegion) ||
                  'international'
                : undefined,
          },
        );

        if (result.valid) {
          logger.logEnv('INFO', `[API Key] Validation succeeded for ${provider}`);
        } else {
          logger.logEnv('WARN', `[API Key] Validation failed for ${provider}`, {
            error: result.error,
          });
        }

        return result;
      }

      if (provider === 'azure-foundry') {
        const config = storage.getAzureFoundryConfig();
        const result = await validateAzureFoundry(config, {
          apiKey: key,
          baseUrl: options?.baseUrl,
          deploymentName: options?.deploymentName,
          authType: options?.authType,
          timeout: API_KEY_VALIDATION_TIMEOUT_MS,
        });

        if (result.valid) {
          logger.logEnv('INFO', `[API Key] Validation succeeded for ${provider}`);
        } else {
          logger.logEnv('WARN', `[API Key] Validation failed for ${provider}`, {
            error: result.error,
          });
        }

        return result;
      }

      logger.logEnv(
        'INFO',
        `[API Key] Skipping validation for ${provider} (local/custom provider)`,
      );
      return { valid: true };
    },
  );

  handle('api-key:clear', async (_event: IpcMainInvokeEvent) => {
    await deleteApiKey('anthropic');
  });

  handle('api-keys:all', async (_event: IpcMainInvokeEvent) => {
    const keys = await getAllApiKeys();
    const masked: Record<string, { exists: boolean; prefix?: string }> = {};
    for (const [provider, key] of Object.entries(keys)) {
      masked[provider] = {
        exists: Boolean(key),
        prefix: key ? key.substring(0, 8) + '...' : undefined,
      };
    }
    return masked;
  });

  handle('api-keys:has-any', async (_event: IpcMainInvokeEvent) => {
    const { isMockTaskEventsEnabled } = await import('../../test-utils/mock-task-flow');
    if (isMockTaskEventsEnabled()) {
      return true;
    }
    const hasKey = await hasAnyApiKey();
    if (hasKey) return true;
    return getOpenAiOauthStatus().connected;
  });

  handle('bedrock:validate', async (_event: IpcMainInvokeEvent, credentials: string) => {
    getLogCollector().logEnv('INFO', '[Bedrock] Validation requested');
    return validateBedrockCredentials(credentials);
  });

  handle('bedrock:fetch-models', async (_event: IpcMainInvokeEvent, credentialsJson: string) => {
    try {
      const credentials = JSON.parse(credentialsJson) as BedrockCredentials;
      const result = await fetchBedrockModels(credentials);
      if (!result.success && result.error) {
        return { success: false, error: normalizeIpcError(result.error), models: [] };
      }
      return result;
    } catch (error) {
      getLogCollector().logEnv('ERROR', '[Bedrock] Failed to fetch models', {
        error: normalizeIpcError(error),
      });
      return { success: false, error: normalizeIpcError(error), models: [] };
    }
  });

  handle('bedrock:save', async (_event: IpcMainInvokeEvent, credentials: string) => {
    const parsed = JSON.parse(credentials);

    if (parsed.authType === 'apiKey') {
      if (!(typeof parsed.apiKey === 'string' && parsed.apiKey.length > 0)) {
        throw new Error('API Key is required');
      }
    } else if (parsed.authType === 'accessKeys') {
      if (
        !(typeof parsed.accessKeyId === 'string' && parsed.accessKeyId.length > 0) ||
        !(typeof parsed.secretAccessKey === 'string' && parsed.secretAccessKey.length > 0)
      ) {
        throw new Error('Access Key ID and Secret Access Key are required');
      }
    } else if (parsed.authType === 'profile') {
      if (!(typeof parsed.profileName === 'string' && parsed.profileName.length > 0)) {
        throw new Error('Profile name is required');
      }
    } else {
      throw new Error('Invalid authentication type');
    }

    storeApiKey('bedrock', credentials);

    let label: string;
    let keyPrefix: string;
    if (parsed.authType === 'apiKey') {
      label = 'Bedrock API Key';
      keyPrefix = `${parsed.apiKey.substring(0, 8)}...`;
    } else if (parsed.authType === 'accessKeys') {
      label = 'AWS Access Keys';
      keyPrefix = `${parsed.accessKeyId.substring(0, 8)}...`;
    } else {
      label = `AWS Profile: ${parsed.profileName}`;
      keyPrefix = parsed.profileName;
    }

    return {
      id: 'local-bedrock',
      provider: 'bedrock',
      label,
      keyPrefix,
      isActive: true,
      createdAt: new Date().toISOString(),
    };
  });

  handle('bedrock:get-credentials', async (_event: IpcMainInvokeEvent) => {
    const stored = getApiKey('bedrock');
    if (!stored) return null;
    try {
      return JSON.parse(stored);
    } catch {
      return null;
    }
  });

  handle('openrouter:fetch-models', async (_event: IpcMainInvokeEvent) => {
    const apiKey = getApiKey('openrouter');
    return fetchOpenRouterModels(apiKey || '', API_KEY_VALIDATION_TIMEOUT_MS);
  });

  handle(
    'provider:fetch-models',
    async (
      _event: IpcMainInvokeEvent,
      providerId: string,
      options?: { baseUrl?: string; zaiRegion?: string },
    ) => {
      const providerConfig = DEFAULT_PROVIDERS.find((p) => p.id === providerId);
      if (!providerConfig?.modelsEndpoint) {
        return { success: false, error: 'No models endpoint configured for this provider' };
      }

      const storedApiKey = getApiKey(providerId);
      const apiKey = storedApiKey || (providerId === 'openai' ? getOpenAiOauthAccessToken() : null);
      if (!apiKey) {
        return { success: false, error: 'No API key found for this provider' };
      }

      let urlOverride: string | undefined;
      let endpointConfig = providerConfig.modelsEndpoint;
      if (providerId === 'openai' && options?.baseUrl) {
        urlOverride = `${options.baseUrl.replace(/\/+$/, '')}/models`;
        endpointConfig = { ...endpointConfig, modelFilter: undefined };
      }
      if (providerId === 'zai' && options?.zaiRegion) {
        const region = options.zaiRegion as import('@accomplish_ai/agent-core').ZaiRegion;
        urlOverride = `${ZAI_ENDPOINTS[region]}/models`;
      }

      return fetchProviderModels({
        endpointConfig,
        apiKey,
        urlOverride,
        timeout: API_KEY_VALIDATION_TIMEOUT_MS,
      });
    },
  );
}
