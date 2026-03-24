import type { AzureFoundryConfig } from '../common/types/provider.js';

import { fetchWithTimeout } from '../utils/fetch.js';
import { sanitizeString } from '../utils/sanitize.js';
import { validateHttpUrl } from '../utils/url.js';
import { getAzureEntraToken } from '../opencode/proxies/azure-token-manager.js';
import type { ValidationResult } from './validation.js';

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
 *
 * This is used to test user-provided configuration before saving.
 * For validating stored configuration, use validateAzureFoundry instead.
 *
 * @param options - Connection options including endpoint, deployment, and auth
 * @returns Connection result indicating success or failure with error message
 */
export async function testAzureFoundryConnection(
  options: AzureFoundryConnectionOptions,
): Promise<AzureFoundryConnectionResult> {
  const { endpoint, deploymentName, authType, apiKey, timeout = DEFAULT_TIMEOUT_MS } = options;

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

  try {
    let authHeader: string;

    if (authType === 'api-key') {
      if (!apiKey) {
        return { success: false, error: 'API key is required for API key authentication' };
      }
      authHeader = apiKey;
    } else {
      const tokenResult = await getAzureEntraToken();
      if (!tokenResult.success) {
        return { success: false, error: tokenResult.error };
      }
      authHeader = `Bearer ${tokenResult.token}`;
    }

    const testUrl = `${baseUrl}/openai/deployments/${deploymentName}/chat/completions?api-version=2024-02-15-preview`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (authType === 'api-key') {
      headers['api-key'] = authHeader;
    } else {
      headers['Authorization'] = authHeader;
    }

    const response = await fetchWithTimeout(
      testUrl,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'Hi' }],
          max_completion_tokens: 5,
        }),
      },
      timeout,
    );

    if (!response.ok) {
      // Retry with max_tokens for deployments that don't support max_completion_tokens
      const retryResponse = await fetchWithTimeout(
        testUrl,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            messages: [{ role: 'user', content: 'Hi' }],
            max_tokens: 5,
          }),
        },
        timeout,
      );

      if (!retryResponse.ok) {
        const errorData = await retryResponse.json().catch(() => ({}));
        const errorMessage =
          (errorData as { error?: { message?: string } })?.error?.message ||
          `API returned status ${retryResponse.status}`;
        return { success: false, error: errorMessage };
      }
    }

    console.log('[Azure Foundry] Connection test successful for deployment:', deploymentName);
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Connection failed';
    console.warn('[Azure Foundry] Connection test failed:', message);

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

const DEFAULT_TIMEOUT_MS = 15000;

/**
 * Validates Azure Foundry (Azure OpenAI) credentials by making a test API call.
 *
 * Supports two authentication types:
 * - API Key: Uses the api-key header
 * - Entra ID: Acquires an Azure AD token via OAuth flow and uses Bearer token
 *
 * @param config - The stored Azure Foundry configuration (can be null if not configured)
 * @param options - Validation options including API key and overrides
 * @returns Validation result indicating success or failure with error message
 */
export async function validateAzureFoundry(
  config: AzureFoundryConfig | null,
  options: AzureFoundryValidationOptions,
): Promise<ValidationResult> {
  const baseUrl = options.baseUrl || config?.baseUrl;
  const deploymentName = options.deploymentName || config?.deploymentName;
  const authType = options.authType || config?.authType || 'api-key';
  const timeout = options.timeout ?? DEFAULT_TIMEOUT_MS;

  let entraToken = '';
  let sanitizedKey = '';

  if (authType === 'entra-id') {
    // For Entra ID, we only validate if both baseUrl and deploymentName are provided
    if (options.baseUrl && options.deploymentName) {
      const tokenResult = await getAzureEntraToken();
      if (!tokenResult.success) {
        return { valid: false, error: tokenResult.error };
      }
      entraToken = tokenResult.token;
    } else {
      // Skip validation if we don't have the required config yet
      return { valid: true };
    }
  } else {
    // For API key auth, validate and sanitize the key
    if (!options.apiKey) {
      return { valid: false, error: 'API key is required for api-key authentication' };
    }
    try {
      sanitizedKey = sanitizeString(options.apiKey, 'apiKey', 256);
    } catch (e) {
      return { valid: false, error: e instanceof Error ? e.message : 'Invalid API key' };
    }
  }

  // Skip validation if missing required config
  if (!baseUrl || !deploymentName) {
    console.log('[Azure Foundry] Skipping validation (missing config or options)');
    return { valid: true };
  }

  const cleanBaseUrl = baseUrl.replace(/\/+$/, '');
  const testUrl = `${cleanBaseUrl}/openai/deployments/${deploymentName}/chat/completions?api-version=2023-05-15`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (authType === 'entra-id') {
    if (!entraToken) {
      return {
        valid: false,
        error: 'Missing Entra ID access token for Azure Foundry validation request',
      };
    }
    headers['Authorization'] = `Bearer ${entraToken}`;
  } else {
    headers['api-key'] = sanitizedKey;
  }

  try {
    let response = await fetchWithTimeout(
      testUrl,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'test' }],
          max_completion_tokens: 5,
        }),
      },
      timeout,
    );

    if (!response.ok) {
      const firstErrorData = await response.json().catch(() => ({}));
      const firstErrorMessage =
        (firstErrorData as { error?: { message?: string } })?.error?.message || '';

      // Some Azure OpenAI deployments don't support max_completion_tokens, retry with max_tokens
      if (firstErrorMessage.includes('max_completion_tokens')) {
        response = await fetchWithTimeout(
          testUrl,
          {
            method: 'POST',
            headers,
            body: JSON.stringify({
              messages: [{ role: 'user', content: 'test' }],
              max_tokens: 5,
            }),
          },
          timeout,
        );
      } else {
        return {
          valid: false,
          error: firstErrorMessage || `API returned status ${response.status}`,
        };
      }
    }

    if (response.ok) {
      console.log('[Azure Foundry] Validation succeeded');
      return { valid: true };
    }

    const errorData = await response.json().catch(() => ({}));
    const errorMessage =
      (errorData as { error?: { message?: string } })?.error?.message ||
      `API returned status ${response.status}`;
    console.warn('[Azure Foundry] Validation failed', { error: errorMessage });
    return { valid: false, error: errorMessage };
  } catch (error) {
    console.error('[Azure Foundry] Validation error', {
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
