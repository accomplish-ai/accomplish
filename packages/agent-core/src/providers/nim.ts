import type { NimModel, NimConfig } from '../common/types/provider.js';
import { fetchWithTimeout } from '../utils/fetch.js';
import { validateHttpUrl } from '../utils/url.js';
import { sanitizeString } from '../utils/sanitize.js';
import { createConsoleLogger } from '../utils/logging.js';

const log = createConsoleLogger({ prefix: 'NIM' });

const DEFAULT_TIMEOUT_MS = 10000;

export const NIM_DEFAULT_BASE_URL = 'https://integrate.api.nvidia.com/v1';

export interface NimConnectionResult {
  success: boolean;
  error?: string;
  models?: NimModel[];
}

interface NimModelsResponse {
  data?: Array<{
    id: string;
    object: string;
    created?: number;
    owned_by?: string;
  }>;
}

function mapNimModels(rawModels: NimModelsResponse['data']): NimModel[] {
  return (rawModels || []).map((m) => {
    const parts = m.id.split('/');
    const provider = parts.length > 1 ? parts[0] : m.owned_by || 'nvidia';
    const modelPart = parts.length > 1 ? parts.slice(1).join('/') : m.id;
    const providerDisplay = provider.charAt(0).toUpperCase() + provider.slice(1);
    const modelDisplay = modelPart
      .split(/[-_]/)
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
}

/**
 * Tests connection to an NVIDIA NIM endpoint and retrieves available models.
 * Makes an HTTP request to the OpenAI-compatible /models endpoint.
 *
 * @param url - The NIM base URL (default: https://integrate.api.nvidia.com/v1)
 * @param apiKey - NVIDIA API key (NGC)
 * @returns Connection result with available models on success
 */
export async function testNimConnection(url: string, apiKey: string): Promise<NimConnectionResult> {
  const sanitizedUrl = sanitizeString(url, 'nimUrl', 256);
  const sanitizedApiKey = sanitizeString(apiKey, 'apiKey', 256);

  try {
    validateHttpUrl(sanitizedUrl, 'NIM URL');
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Invalid URL format' };
  }

  if (!sanitizedApiKey) {
    return { success: false, error: 'API key is required for NVIDIA NIM' };
  }

  const normalizedUrl = sanitizedUrl.replace(/\/$/, '');

  try {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${sanitizedApiKey}`,
    };

    const response = await fetchWithTimeout(
      `${normalizedUrl}/models`,
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

    const data = (await response.json()) as NimModelsResponse;
    const models = mapNimModels(data.data);

    log.info(`Connection successful, found ${models.length} models`);
    return { success: true, models };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Connection failed';
    log.warn(`Connection failed: ${message}`);

    if (error instanceof Error && error.name === 'AbortError') {
      return { success: false, error: 'Connection timed out. Check your NVIDIA NIM endpoint.' };
    }
    return { success: false, error: `Cannot connect to NVIDIA NIM: ${message}` };
  }
}

export interface FetchNimModelsOptions {
  config: NimConfig | null;
  apiKey?: string;
}

/**
 * Fetches available models from a configured NVIDIA NIM endpoint.
 *
 * @param options - Configuration and API key
 * @returns Result with formatted models on success
 */
export async function fetchNimModels(options: FetchNimModelsOptions): Promise<NimConnectionResult> {
  const { config, apiKey } = options;

  if (!config || !config.baseUrl) {
    return { success: false, error: 'No NVIDIA NIM endpoint configured' };
  }

  if (!apiKey) {
    return { success: false, error: 'API key is required for NVIDIA NIM' };
  }

  const sanitizedUrl = sanitizeString(config.baseUrl, 'nimUrl', 256).replace(/\/$/, '');

  try {
    validateHttpUrl(sanitizedUrl, 'NIM URL');
  } catch (_e) {
    return { success: false, error: 'Invalid NVIDIA NIM endpoint URL' };
  }

  const sanitizedApiKey = sanitizeString(apiKey, 'apiKey', 256);

  try {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${sanitizedApiKey}`,
    };

    const response = await fetchWithTimeout(
      `${sanitizedUrl}/models`,
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

    const data = (await response.json()) as NimModelsResponse;
    const models = mapNimModels(data.data);

    log.info(`Fetched ${models.length} models`);
    return { success: true, models };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch models';
    log.warn(`Fetch failed: ${message}`);

    if (error instanceof Error && error.name === 'AbortError') {
      return { success: false, error: 'Request timed out. Check your NVIDIA NIM endpoint.' };
    }
    return { success: false, error: `Failed to fetch models: ${message}` };
  }
}
