import type { IpcMainInvokeEvent } from 'electron';
import { validateApiKey, validateAzureFoundry, sanitizeString } from '@accomplish_ai/agent-core';
import {
  ALLOWED_API_KEY_PROVIDERS,
  STANDARD_VALIDATION_PROVIDERS,
} from '@accomplish_ai/agent-core';
import type { ZaiRegion } from '@accomplish_ai/agent-core';
import { storeApiKey, getApiKey, deleteApiKey, hasAnyApiKey } from '../../../store/secureStorage';
import { getStorage } from '../../../store/storage';
import { getLogCollector } from '../../../logging';
import { getOpenAiOauthStatus } from '@accomplish_ai/agent-core';
import { handle, API_KEY_VALIDATION_TIMEOUT_MS } from '../utils';

/**
 * Allowed shape of the `options` parameter for provider validation.
 * Extra fields are ignored; all fields are optional.
 */
export interface ProviderOptions {
  baseUrl?: string;
  zaiRegion?: ZaiRegion;
  /** Legacy alias — normalised to zaiRegion before use */
  region?: ZaiRegion;
  deploymentName?: string;
  authType?: string;
}

/** Normalise a raw options object coming from IPC into a typed ProviderOptions. */
export function normalizeProviderOptions(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  raw: Record<string, any> | undefined,
): ProviderOptions {
  if (!raw || typeof raw !== 'object') return {};
  const opts: ProviderOptions = {};
  if (typeof raw.baseUrl === 'string') opts.baseUrl = raw.baseUrl;
  // Support both field names; zaiRegion wins if both are present
  const regionValue = raw.zaiRegion ?? raw.region;
  if (typeof regionValue === 'string') opts.zaiRegion = regionValue as ZaiRegion;
  if (typeof raw.deploymentName === 'string') opts.deploymentName = raw.deploymentName;
  if (typeof raw.authType === 'string') opts.authType = raw.authType;
  return opts;
}

export function registerApiKeyValidationHandlers(): void {
  const storage = getStorage();

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
      rawOptions?: Record<string, any>,
    ) => {
      if (!ALLOWED_API_KEY_PROVIDERS.has(provider)) {
        return { valid: false, error: 'Unsupported provider' };
      }

      const options = normalizeProviderOptions(rawOptions);
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
              provider === 'openai'
                ? typeof options?.baseUrl === 'string'
                  ? options.baseUrl.trim() || undefined
                  : storage.getOpenAiBaseUrl().trim() || undefined
                : undefined,
            zaiRegion: provider === 'zai' ? options?.zaiRegion || 'international' : undefined,
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
          baseUrl: typeof options?.baseUrl === 'string' ? options.baseUrl : undefined,
          deploymentName: options?.deploymentName,
          authType: options?.authType as 'api-key' | 'entra-id' | undefined,
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
    const { isMockTaskEventsEnabled } = await import('../../../test-utils/mock-task-flow');
    if (isMockTaskEventsEnabled()) {
      return true;
    }
    const hasKey = await hasAnyApiKey();
    if (hasKey) return true;
    return getOpenAiOauthStatus().connected;
  });
}

// Re-export getAllApiKeys for use by other sub-modules
import { getAllApiKeys } from '../../../store/secureStorage';
export { getAllApiKeys };
