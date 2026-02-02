/**
 * Azure Foundry provider configuration builder
 *
 * Generates Azure AI Foundry provider configuration for OpenCode CLI.
 * Uses a local proxy to strip unsupported parameters before forwarding to Azure.
 */

import type { ConnectedProvider, AzureFoundryCredentials } from '@accomplish/shared';
import { getApiKey } from '../../../store/secureStorage';
import { ensureAzureFoundryProxy } from '../../azure-foundry-proxy';

/**
 * Model configuration for Azure Foundry
 */
interface AzureFoundryModelConfig {
  name: string;
  tools: boolean;
  limit: {
    context: number;
    output: number;
  };
}

/**
 * Azure Foundry provider configuration structure
 */
export interface AzureFoundryProviderConfig {
  npm: string;
  name: string;
  options: {
    baseURL: string;
    apiKey?: string;
    headers?: Record<string, string>;
  };
  models: Record<string, AzureFoundryModelConfig>;
}

/**
 * Build Azure AI Foundry provider configuration for OpenCode CLI
 *
 * @param provider - Connected provider settings (optional)
 * @param azureFoundryToken - Optional Entra ID token for authentication
 * @returns Azure Foundry provider config or null if not configured
 */
export async function buildAzureFoundryProviderConfig(
  provider?: ConnectedProvider,
  azureFoundryToken?: string
): Promise<AzureFoundryProviderConfig | null> {
  // Check connection status
  if (!provider || provider.connectionStatus !== 'connected') {
    return null;
  }

  // Validate credentials type
  if (provider.credentials.type !== 'azure-foundry') {
    return null;
  }

  const creds = provider.credentials as AzureFoundryCredentials;

  // For Entra ID auth, require token
  if (creds.authMethod === 'entra-id' && !azureFoundryToken) {
    return null;
  }

  // Strip trailing slash from endpoint and build target URL
  const baseUrl = creds.endpoint.replace(/\/$/, '');
  const targetBaseUrl = `${baseUrl}/openai/v1`;

  // Start/reuse proxy server
  const proxyInfo = await ensureAzureFoundryProxy(targetBaseUrl);

  // Build options for @ai-sdk/openai-compatible provider
  const azureOptions: AzureFoundryProviderConfig['options'] = {
    baseURL: proxyInfo.baseURL,
  };

  // Set authentication
  if (creds.authMethod === 'api-key') {
    const azureApiKey = getApiKey('azure-foundry');
    if (azureApiKey) {
      azureOptions.apiKey = azureApiKey;
    }
  } else if (creds.authMethod === 'entra-id' && azureFoundryToken) {
    // For Entra ID, set empty apiKey (required by SDK) and use Authorization header
    azureOptions.apiKey = '';
    azureOptions.headers = {
      Authorization: `Bearer ${azureFoundryToken}`,
    };
  }

  return {
    npm: '@ai-sdk/openai-compatible',
    name: 'Azure AI Foundry',
    options: azureOptions,
    models: {
      [creds.deploymentName]: {
        name: `Azure Foundry (${creds.deploymentName})`,
        tools: true,
        // Conservative output token limit - can be overridden per-deployment
        // Prevents errors from models with lower limits (e.g., 16384 for some GPT-5 deployments)
        limit: {
          context: 128000,
          output: 16384,
        },
      },
    },
  };
}
