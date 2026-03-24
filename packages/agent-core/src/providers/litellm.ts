import type { LiteLLMModel, LiteLLMConfig } from '../common/types/provider.js';
import { fetchWithTimeout } from '../utils/fetch.js';
import { validateHttpUrl } from '../utils/url.js';
import { sanitizeString } from '../utils/sanitize.js';

const DEFAULT_TIMEOUT_MS = 10000;

export interface LiteLLMConnectionResult {
  success: boolean;
  error?: string;
  models?: LiteLLMModel[];
}

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
 *
 * @param url - The LiteLLM proxy base URL
 * @param apiKey - Optional API key for authentication
 * @returns Connection result with available models on success
 */
export async function testLiteLLMConnection(
  url: string,
  apiKey?: string,
): Promise<LiteLLMConnectionResult> {
  const sanitizedUrl = sanitizeString(url, 'litellmUrl', 256);
  const sanitizedApiKey = apiKey ? sanitizeString(apiKey, 'apiKey', 256) : undefined;

  try {
    validateHttpUrl(sanitizedUrl, 'LiteLLM URL');
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Invalid URL format' };
  }

  try {
    const headers: Record<string, string> = {};
    if (sanitizedApiKey) {
      headers['Authorization'] = `Bearer ${sanitizedApiKey}`;
    }

    const response = await fetchWithTimeout(
      `${sanitizedUrl}/v1/models`,
      { method: 'GET', headers },
      DEFAULT_TIMEOUT_MS,
    );

    if (!response.ok) {
      const errorData = (await response.json().catch(() => ({}))) as {
        error?: { message?: string };
      };
      const errorMessage = errorData?.error?.message || `API returned status ${response.status}`;
      return { success: false, error: errorMessage };
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
    return { success: true, models };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Connection failed';
    console.warn('[LiteLLM] Connection failed:', message);

    if (error instanceof Error && error.name === 'AbortError') {
      return { success: false, error: 'Connection timed out. Make sure LiteLLM proxy is running.' };
    }
    return { success: false, error: `Cannot connect to LiteLLM: ${message}` };
  }
}

export interface FetchLiteLLMModelsOptions {
  config: LiteLLMConfig | null;
  apiKey?: string;
}

/**
 * Fetches available models from a configured LiteLLM proxy.
 * Formats model names for display with provider prefixes.
 *
 * @param options - Configuration and optional API key
 * @returns Result with formatted models on success
 */
export async function fetchLiteLLMModels(
  options: FetchLiteLLMModelsOptions,
): Promise<LiteLLMConnectionResult> {
  const { config, apiKey } = options;

  if (!config || !config.baseUrl) {
    return { success: false, error: 'No LiteLLM proxy configured' };
  }

  try {
    const headers: Record<string, string> = {};
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const response = await fetchWithTimeout(
      `${config.baseUrl}/v1/models`,
      { method: 'GET', headers },
      DEFAULT_TIMEOUT_MS,
    );

    if (!response.ok) {
      const errorData = (await response.json().catch(() => ({}))) as {
        error?: { message?: string };
      };
      const errorMessage = errorData?.error?.message || `API returned status ${response.status}`;
      return { success: false, error: errorMessage };
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
    return { success: true, models };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch models';
    console.warn('[LiteLLM] Fetch failed:', message);

    if (error instanceof Error && error.name === 'AbortError') {
      return { success: false, error: 'Request timed out. Check your LiteLLM proxy.' };
    }
    return { success: false, error: `Failed to fetch models: ${message}` };
  }
}
