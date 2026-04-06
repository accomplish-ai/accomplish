/**
 * Azure Foundry authentication helpers
 *
 * Utilities for acquiring auth headers and tokens for Azure Foundry
 * (Azure OpenAI) API requests. Supports api-key and Entra ID auth types.
 * Also provides a retry helper for the max_tokens/max_completion_tokens
 * compatibility issue across Azure OpenAI deployment versions.
 */

import { getAzureEntraToken } from '../opencode/proxies/azure-token-manager.js';
import { sanitizeString } from '../utils/sanitize.js';
import { fetchWithTimeout } from '../utils/fetch.js';

export const DEFAULT_AZURE_TIMEOUT_MS = 15000;

/**
 * POST a minimal chat completion to Azure OpenAI.
 * Automatically retries with `max_tokens` if the deployment rejects `max_completion_tokens`.
 * Returns the final Response (ok or not) or throws on network error.
 */
export async function postAzureChatCompletionWithRetry(
  testUrl: string,
  headers: Record<string, string>,
  content: string,
  timeout: number,
): Promise<Response> {
  const baseBody = { messages: [{ role: 'user', content }] };

  const response = await fetchWithTimeout(
    testUrl,
    { method: 'POST', headers, body: JSON.stringify({ ...baseBody, max_completion_tokens: 5 }) },
    timeout,
  );

  if (response.ok) {
    return response;
  }

  // Some deployments don't support max_completion_tokens — retry with max_tokens
  const errorData = await response
    .clone()
    .json()
    .catch(() => ({}));
  const errorMessage = (errorData as { error?: { message?: string } })?.error?.message || '';

  if (errorMessage.includes('max_completion_tokens')) {
    return fetchWithTimeout(
      testUrl,
      { method: 'POST', headers, body: JSON.stringify({ ...baseBody, max_tokens: 5 }) },
      timeout,
    );
  }

  // Return original failed response so caller can handle the error
  return response;
}

export type AzureAuthType = 'api-key' | 'entra-id';

export interface AzureAuthHeaderResult {
  success: true;
  headers: Record<string, string>;
  authValue: string;
}

export interface AzureAuthHeaderError {
  success: false;
  error: string;
}

export type AzureAuthHeaderOutcome = AzureAuthHeaderResult | AzureAuthHeaderError;

/** Shared helper: fetch an Entra ID token and build the Authorization header. */
async function getEntraAuthHeader(): Promise<
  { success: false; error: string } | { success: true; authValue: string }
> {
  const tokenResult = await getAzureEntraToken();
  if (!tokenResult.success) {
    return { success: false, error: tokenResult.error };
  }
  return { success: true, authValue: `Bearer ${tokenResult.token}` };
}

/**
 * Build Authorization headers for an Azure Foundry API request.
 * Returns the headers dict and the raw auth value for reuse.
 */
export async function buildAzureAuthHeaders(
  authType: AzureAuthType,
  apiKey?: string,
): Promise<AzureAuthHeaderOutcome> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (authType === 'entra-id') {
    const entraResult = await getEntraAuthHeader();
    if (!entraResult.success) {
      return { success: false, error: entraResult.error };
    }
    headers['Authorization'] = entraResult.authValue;
    return { success: true, headers, authValue: entraResult.authValue };
  }

  if (!apiKey) {
    return { success: false, error: 'API key is required for api-key authentication' };
  }

  let sanitizedKey: string;
  try {
    sanitizedKey = sanitizeString(apiKey, 'apiKey', 256);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Invalid API key' };
  }

  headers['api-key'] = sanitizedKey;
  return { success: true, headers, authValue: sanitizedKey };
}

/**
 * Build auth headers for a connection test (raw api-key, no sanitization).
 * Used in testAzureFoundryConnection where the key comes directly from user input.
 */
export async function buildTestAuthHeaders(
  authType: AzureAuthType,
  apiKey?: string,
): Promise<{ success: false; error: string } | { success: true; headers: Record<string, string> }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (authType === 'api-key') {
    const trimmedKey = apiKey?.trim();
    if (!trimmedKey) {
      return { success: false, error: 'API key is required for API key authentication' };
    }
    headers['api-key'] = trimmedKey;
    return { success: true, headers };
  }

  const entraResult = await getEntraAuthHeader();
  if (!entraResult.success) {
    return { success: false, error: entraResult.error };
  }
  headers['Authorization'] = entraResult.authValue;
  return { success: true, headers };
}
