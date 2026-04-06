import type { AzureFoundryConfig } from '../common/types/provider.js';

import { validateHttpUrl } from '../utils/url.js';
import {
  buildAzureAuthHeaders,
  buildTestAuthHeaders,
  postAzureChatCompletionWithRetry,
  DEFAULT_AZURE_TIMEOUT_MS,
} from './azure-foundry-auth.js';
import type { ValidationResult } from './validation.js';
import { createConsoleLogger } from '../utils/logging.js';

const log = createConsoleLogger({ prefix: 'AzureFoundry' });

export interface AzureFoundryConnectionOptions {
  endpoint: string;
  deploymentName: string;
  authType: 'api-key' | 'entra-id';
  apiKey?: string;
  timeout?: number;
}

export interface AzureFoundryConnectionResult {
  success: boolean;
  error?: string;
}

/**
 * Tests connection to an Azure Foundry (Azure OpenAI) endpoint.
 */
export async function testAzureFoundryConnection(
  options: AzureFoundryConnectionOptions,
): Promise<AzureFoundryConnectionResult> {
  const {
    endpoint,
    deploymentName,
    authType,
    apiKey,
    timeout = DEFAULT_AZURE_TIMEOUT_MS,
  } = options;

  let baseUrl: string;
  try {
    validateHttpUrl(endpoint, 'Azure Foundry endpoint');
    baseUrl = endpoint.replace(/\/$/, '');
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : 'Invalid endpoint URL format',
    };
  }

  const authResult = await buildTestAuthHeaders(authType, apiKey);
  if (!authResult.success) {
    return { success: false, error: authResult.error };
  }

  const testUrl = `${baseUrl}/openai/deployments/${deploymentName}/chat/completions?api-version=2024-02-15-preview`;

  try {
    const response = await postAzureChatCompletionWithRetry(
      testUrl,
      authResult.headers,
      'Hi',
      timeout,
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage =
        (errorData as { error?: { message?: string } })?.error?.message ||
        `API returned status ${response.status}`;
      return { success: false, error: errorMessage };
    }

    log.info(`[Azure Foundry] Connection test successful for deployment: ${deploymentName}`);
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Connection failed';
    log.warn(`[Azure Foundry] Connection test failed: ${message}`);

    if (error instanceof Error && error.name === 'AbortError') {
      return {
        success: false,
        error: 'Request timed out. Check your endpoint URL and network connection.',
      };
    }
    return { success: false, error: message };
  }
}

export interface AzureFoundryValidationOptions {
  /** API key for api-key auth type */
  apiKey?: string;
  /** Base URL override (uses config if not provided) */
  baseUrl?: string;
  /** Deployment name override (uses config if not provided) */
  deploymentName?: string;
  /** Auth type override (uses config if not provided, defaults to 'api-key') */
  authType?: 'api-key' | 'entra-id';
  /** Request timeout in milliseconds */
  timeout?: number;
}

/**
 * Validates Azure Foundry (Azure OpenAI) credentials by making a test API call.
 */
export async function validateAzureFoundry(
  config: AzureFoundryConfig | null,
  options: AzureFoundryValidationOptions,
): Promise<ValidationResult> {
  const baseUrl = options.baseUrl || config?.baseUrl;
  const deploymentName = options.deploymentName || config?.deploymentName;
  const authType = options.authType || config?.authType || 'api-key';
  const timeout = options.timeout ?? DEFAULT_AZURE_TIMEOUT_MS;

  if (authType === 'entra-id' && (!options.baseUrl || !options.deploymentName)) {
    // For Entra ID, only validate if both baseUrl and deploymentName are provided
    return { valid: true };
  }

  const authResult = await buildAzureAuthHeaders(authType, options.apiKey);
  if (!authResult.success) {
    return { valid: false, error: authResult.error };
  }

  if (!baseUrl || !deploymentName) {
    log.info('[Azure Foundry] Skipping validation (missing config or options)');
    return { valid: true };
  }

  if (authType === 'entra-id' && !authResult.authValue) {
    return {
      valid: false,
      error: 'Missing Entra ID access token for Azure Foundry validation request',
    };
  }

  const cleanBaseUrl = baseUrl.replace(/\/+$/, '');
  const testUrl = `${cleanBaseUrl}/openai/deployments/${deploymentName}/chat/completions?api-version=2023-05-15`;

  try {
    const response = await postAzureChatCompletionWithRetry(
      testUrl,
      authResult.headers,
      'test',
      timeout,
    );

    if (response.ok) {
      log.info('[Azure Foundry] Validation succeeded');
      return { valid: true };
    }

    const errorData = await response.json().catch(() => ({}));
    const errorMessage =
      (errorData as { error?: { message?: string } })?.error?.message ||
      `API returned status ${response.status}`;
    log.warn('[Azure Foundry] Validation failed', { error: errorMessage });
    return { valid: false, error: errorMessage };
  } catch (error) {
    log.error('[Azure Foundry] Validation error', {
      error: error instanceof Error ? error.message : String(error),
    });
    if (error instanceof Error && error.name === 'AbortError') {
      return {
        valid: false,
        error: 'Request timed out. Please check your internet connection and try again.',
      };
    }
    return { valid: false, error: 'Failed to validate API key. Check your internet connection.' };
  }
}
