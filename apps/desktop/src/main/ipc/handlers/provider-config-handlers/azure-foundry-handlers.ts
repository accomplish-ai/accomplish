import type { IpcMainInvokeEvent } from 'electron';
import { testAzureFoundryConnection, validateHttpUrl } from '@accomplish_ai/agent-core';
import type { AzureFoundryConfig } from '@accomplish_ai/agent-core';
import type { IpcHandler } from '../../types';
import { storeApiKey } from '../../../store/secureStorage';
import { getStorage } from '../../../store/storage';
import { API_KEY_VALIDATION_TIMEOUT_MS } from '../utils';

export function registerAzureFoundryHandlers(handle: IpcHandler): void {
  const storage = getStorage();

  handle('azure-foundry:get-config', async (_event: IpcMainInvokeEvent) => {
    return storage.getAzureFoundryConfig();
  });

  handle(
    'azure-foundry:set-config',
    async (_event: IpcMainInvokeEvent, config: AzureFoundryConfig | null) => {
      if (config !== null) {
        if (typeof config.baseUrl !== 'string' || !config.baseUrl.trim()) {
          throw new Error('Invalid Azure Foundry configuration: baseUrl is required');
        }
        if (typeof config.deploymentName !== 'string' || !config.deploymentName.trim()) {
          throw new Error('Invalid Azure Foundry configuration: deploymentName is required');
        }
        if (config.authType !== 'api-key' && config.authType !== 'entra-id') {
          throw new Error(
            'Invalid Azure Foundry configuration: authType must be api-key or entra-id',
          );
        }
        if (typeof config.enabled !== 'boolean') {
          throw new Error('Invalid Azure Foundry configuration: enabled must be a boolean');
        }
        try {
          validateHttpUrl(config.baseUrl, 'Azure Foundry base URL');
        } catch {
          throw new Error('Invalid Azure Foundry configuration: Invalid base URL format');
        }
      }
      storage.setAzureFoundryConfig(config);
    },
  );

  handle(
    'azure-foundry:test-connection',
    async (
      _event: IpcMainInvokeEvent,
      config: {
        endpoint: string;
        deploymentName: string;
        authType: 'api-key' | 'entra-id';
        apiKey?: string;
      },
    ) => {
      return testAzureFoundryConnection({
        endpoint: config.endpoint,
        deploymentName: config.deploymentName,
        authType: config.authType,
        apiKey: config.apiKey,
        timeout: API_KEY_VALIDATION_TIMEOUT_MS,
      });
    },
  );

  handle(
    'azure-foundry:save-config',
    async (
      _event: IpcMainInvokeEvent,
      config: {
        endpoint: string;
        deploymentName: string;
        authType: 'api-key' | 'entra-id';
        apiKey?: string;
      },
    ) => {
      const { endpoint, deploymentName, authType, apiKey } = config;

      // Validate the same fields as azure-foundry:set-config
      if (typeof endpoint !== 'string' || !endpoint.trim()) {
        throw new Error('Invalid Azure Foundry configuration: endpoint is required');
      }
      if (typeof deploymentName !== 'string' || !deploymentName.trim()) {
        throw new Error('Invalid Azure Foundry configuration: deploymentName is required');
      }
      if (authType !== 'api-key' && authType !== 'entra-id') {
        throw new Error(
          'Invalid Azure Foundry configuration: authType must be api-key or entra-id',
        );
      }
      try {
        validateHttpUrl(endpoint, 'Azure Foundry endpoint');
      } catch {
        throw new Error('Invalid Azure Foundry configuration: Invalid endpoint URL format');
      }

      if (authType === 'api-key' && apiKey) {
        storeApiKey('azure-foundry', apiKey);
      }

      const azureConfig: AzureFoundryConfig = {
        baseUrl: endpoint,
        deploymentName,
        authType,
        enabled: true,
        lastValidated: Date.now(),
      };
      storage.setAzureFoundryConfig(azureConfig);
    },
  );
}
