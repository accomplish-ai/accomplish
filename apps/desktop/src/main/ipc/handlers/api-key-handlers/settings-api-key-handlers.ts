import type { IpcMainInvokeEvent } from 'electron';
import { sanitizeString } from '@accomplish_ai/agent-core';
import { ALLOWED_API_KEY_PROVIDERS } from '@accomplish_ai/agent-core';
import {
  storeApiKey,
  deleteApiKey,
  getAllApiKeys,
  getBedrockCredentials,
} from '../../../store/secureStorage';
import { getStorage } from '../../../store/storage';
import { handle } from '../utils';

// Cloud-browser providers store their keys in app_settings.cloud_browser_config,
// not in secure storage. Exclude them from the standard api-key flow.
const CLOUD_BROWSER_PROVIDERS = new Set(['aws-agentcore', 'browserbase', 'steel']);

export function registerSettingsApiKeyHandlers(): void {
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

        // Derive label to match bedrock:save / vertex:save output exactly
        let label: string;
        if (provider === 'bedrock') {
          const bedrockCreds = getBedrockCredentials();
          if (bedrockCreds?.authType === 'accessKeys') {
            label = 'AWS Access Keys';
          } else if (bedrockCreds?.authType === 'profile') {
            label = `AWS Profile: ${bedrockCreds.profileName || 'default'}`;
          } else if (bedrockCreds?.authType === 'apiKey') {
            label = 'Bedrock API Key';
          } else {
            label = 'AWS Credentials';
          }
        } else if (provider === 'vertex') {
          try {
            const vertexCreds = apiKey ? JSON.parse(apiKey) : null;
            label =
              vertexCreds?.authType === 'serviceAccount'
                ? 'Service Account'
                : 'Application Default Credentials';
          } catch {
            label = 'GCP Credentials';
          }
        } else {
          label = 'Local API Key';
        }

        return {
          id: `local-${provider}`,
          provider,
          label,
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

      // Cloud-browser providers (aws-agentcore, browserbase, steel) store their keys
      // in app_settings.cloud_browser_config — not in secure storage.
      if (CLOUD_BROWSER_PROVIDERS.has(provider)) {
        throw new Error(
          `Provider '${provider}' keys must be saved via the cloud browser settings panel`,
        );
      }

      // Vertex stores a JSON credential document that can exceed 256 chars.
      // Use a generous limit; the vertex:save handler validates structure separately.
      const maxKeyLength = provider === 'vertex' ? 8192 : 256;
      const sanitizedKey = sanitizeString(key, 'apiKey', maxKeyLength);
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

    // Config-backed entries (e.g. local-azure-foundry synthesized from AzureFoundryConfig)
    // are not stored in secure storage — routing them to deleteApiKey() would be a no-op
    // and the entry would reappear on next load. Instead, update the backing config.
    if (provider === 'azure-foundry') {
      const existingConfig = storage.getAzureFoundryConfig();
      if (existingConfig) {
        // Disable Entra ID auth by clearing the config entry
        storage.setAzureFoundryConfig({ ...existingConfig, enabled: false, authType: 'api-key' });
      }
      return;
    }

    await deleteApiKey(provider);
  });
}
