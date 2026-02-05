import type { LiteLLMModel, LiteLLMConfig } from '../common/types/provider.js';
import { fetchWithTimeout } from '../utils/fetch.js';
import { sanitizeString } from '../utils/sanitize.js';
import {
  type ConnectionResult,
  validateAndSanitizeUrl,
  extractApiErrorMessage,
  handleConnectionError,
  toConnectionError,
  createFailureResult,
  createSuccessResult,
} from './provider-utils.js';

const DEFAULT_TIMEOUT_MS = 10000;

export type LiteLLMConnectionResult = ConnectionResult<LiteLLMModel>;

interface LiteLLMModelsResponse {
  data?: Array<{
    id: string;
    object: string;
    created?: number;
    owned_by?: string;
  }>;
}

/**
 * Tests connection to a LiteLLM proxy server and retrieves available models.
 * Makes an HTTP request to the OpenAI-compatible /v1/models endpoint.
 */
export async function testLiteLLMConnection(
  url: string,
  apiKey?: string
): Promise<LiteLLMConnectionResult> {
  const urlValidation = validateAndSanitizeUrl(url, 'LiteLLM');
  if (!urlValidation.valid) {
    return createFailureResult(urlValidation.error);
  }

  const sanitizedApiKey = apiKey ? sanitizeString(apiKey, 'apiKey', 256) : undefined;

  try {
    const headers: Record<string, string> = {};
    if (sanitizedApiKey) {
      headers['Authorization'] = `Bearer ${sanitizedApiKey}`;
    }

    const response = await fetchWithTimeout(
      `${urlValidation.url}/v1/models`,
      { method: 'GET', headers },
      DEFAULT_TIMEOUT_MS
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = extractApiErrorMessage(errorData, response.status);
      return createFailureResult(errorMessage);
    }

    const data = (await response.json()) as LiteLLMModelsResponse;
    const models: LiteLLMModel[] = (data.data || []).map((m) => {
      const provider = m.id.split('/')[0] || m.owned_by || 'unknown';
      return {
        id: m.id,
        name: m.id,
        provider,
        contextLength: 0,
      };
    });

    console.log(`[LiteLLM] Connection successful, found ${models.length} models`);
    return createSuccessResult(models);
  } catch (error) {
    console.warn('[LiteLLM] Connection failed:', error);
    return handleConnectionError(error, 'LiteLLM');
  }
}

export interface FetchLiteLLMModelsOptions {
  config: LiteLLMConfig | null;
  apiKey?: string;
}

/**
 * Fetches available models from a configured LiteLLM proxy.
 * Formats model names for display with provider prefixes.
 */
export async function fetchLiteLLMModels(
  options: FetchLiteLLMModelsOptions
): Promise<LiteLLMConnectionResult> {
  const { config, apiKey } = options;

  if (!config || !config.baseUrl) {
    return createFailureResult('No LiteLLM proxy configured');
  }

  try {
    const headers: Record<string, string> = {};
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const response = await fetchWithTimeout(
      `${config.baseUrl}/v1/models`,
      { method: 'GET', headers },
      DEFAULT_TIMEOUT_MS
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = extractApiErrorMessage(errorData, response.status);
      return createFailureResult(errorMessage);
    }

    const data = (await response.json()) as LiteLLMModelsResponse;
    const models: LiteLLMModel[] = (data.data || []).map((m) => {
      const parts = m.id.split('/');
      const provider =
        parts.length > 1
          ? parts[0]
          : (m.owned_by !== 'openai' ? m.owned_by : 'unknown') || 'unknown';

      const modelPart = parts.length > 1 ? parts.slice(1).join('/') : m.id;
      const providerDisplay = provider.charAt(0).toUpperCase() + provider.slice(1);
      const modelDisplay = modelPart
        .split('-')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
      const displayName = parts.length > 1 ? `${providerDisplay}: ${modelDisplay}` : modelDisplay;

      return {
        id: m.id,
        name: displayName,
        provider,
        contextLength: 0,
      };
    });

    console.log(`[LiteLLM] Fetched ${models.length} models`);
    return createSuccessResult(models);
  } catch (error) {
    console.warn('[LiteLLM] Fetch failed:', error);
    return toConnectionError(error, 'LiteLLM');
  }
}
