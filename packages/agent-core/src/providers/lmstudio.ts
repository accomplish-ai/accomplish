import type { ToolSupportStatus } from '../common/types/providerSettings.js';
import type { LMStudioConfig } from '../common/types/provider.js';
import { fetchWithTimeout } from '../utils/fetch.js';
import { validateHttpUrl } from '../utils/url.js';
import { sanitizeString } from '../utils/sanitize.js';
import { testLMStudioModelToolSupport } from './tool-support-testing.js';

/** Default timeout for LM Studio API requests in milliseconds */
export const LMSTUDIO_REQUEST_TIMEOUT_MS = 15000;

/** Response type from LM Studio /v1/models endpoint */
interface LMStudioModelsResponse {
  data?: Array<{
    id: string;
    object: string;
    owned_by?: string;
  }>;
}

/** LM Studio model with tool support information */
export interface LMStudioModel {
  id: string;
  name: string;
  toolSupport: ToolSupportStatus;
}

/** Result of testing connection to LM Studio */
export interface LMStudioConnectionResult {
  success: boolean;
  error?: string;
  models?: LMStudioModel[];
}

/** Options for LM Studio connection test */
export interface LMStudioConnectionOptions {
  /** The LM Studio server URL */
  url: string;
  /** Request timeout in milliseconds (default: 15000) */
  timeoutMs?: number;
}

/** Options for fetching LM Studio models */
export interface LMStudioFetchModelsOptions {
  /** The LM Studio server base URL */
  baseUrl: string;
  /** Request timeout in milliseconds (default: 15000) */
  timeoutMs?: number;
}

/**
 * Converts a model ID to a human-readable display name.
 * Replaces hyphens with spaces and capitalizes words.
 *
 * @param modelId - The model ID to convert
 * @returns Human-readable display name
 */
function formatModelDisplayName(modelId: string): string {
  return modelId.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Tests connection to an LM Studio server and fetches available models.
 *
 * Makes a GET request to /v1/models to verify connectivity and retrieve
 * the list of loaded models. For each model, tests tool support capability.
 *
 * @param options - Connection test options
 * @returns Connection result with models if successful
 */
export async function testLMStudioConnection(
  options: LMStudioConnectionOptions,
): Promise<LMStudioConnectionResult> {
  const { url, timeoutMs = LMSTUDIO_REQUEST_TIMEOUT_MS } = options;

  // Sanitize and validate URL
  const sanitizedUrl = sanitizeString(url, 'lmstudioUrl', 256);

  try {
    validateHttpUrl(sanitizedUrl, 'LM Studio URL');
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : 'Invalid URL format',
    };
  }

  try {
    const response = await fetchWithTimeout(
      `${sanitizedUrl}/v1/models`,
      { method: 'GET' },
      timeoutMs,
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage =
        (errorData as { error?: { message?: string } })?.error?.message ||
        `API returned status ${response.status}`;
      return { success: false, error: errorMessage };
    }

    const data = (await response.json()) as LMStudioModelsResponse;
    const rawModels = data.data || [];

    if (rawModels.length === 0) {
      return {
        success: false,
        error: 'No models loaded in LM Studio. Please load a model first.',
      };
    }

    const models: LMStudioModel[] = [];

    for (const m of rawModels) {
      const displayName = formatModelDisplayName(m.id);
      const toolSupport = await testLMStudioModelToolSupport(sanitizedUrl, m.id);

      models.push({
        id: m.id,
        name: displayName,
        toolSupport,
      });

      console.log(`[LM Studio] Model ${m.id}: toolSupport=${toolSupport}`);
    }

    console.log(`[LM Studio] Connection successful, found ${models.length} models`);
    return { success: true, models };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Connection failed';
    console.warn('[LM Studio] Connection failed:', message);

    if (error instanceof Error && error.name === 'AbortError') {
      return {
        success: false,
        error: 'Connection timed out. Make sure LM Studio is running.',
      };
    }
    return { success: false, error: `Cannot connect to LM Studio: ${message}` };
  }
}

/**
 * Fetches available models from an LM Studio server.
 *
 * Similar to testLMStudioConnection but intended for refreshing the model list
 * when LM Studio is already configured.
 *
 * @param options - Options including base URL and optional timeout
 * @returns Result with models if successful
 */
export async function fetchLMStudioModels(
  options: LMStudioFetchModelsOptions,
): Promise<LMStudioConnectionResult> {
  const { baseUrl, timeoutMs = LMSTUDIO_REQUEST_TIMEOUT_MS } = options;

  try {
    const response = await fetchWithTimeout(`${baseUrl}/v1/models`, { method: 'GET' }, timeoutMs);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage =
        (errorData as { error?: { message?: string } })?.error?.message ||
        `API returned status ${response.status}`;
      return { success: false, error: errorMessage };
    }

    const data = (await response.json()) as LMStudioModelsResponse;
    const rawModels = data.data || [];

    const models: LMStudioModel[] = [];

    for (const m of rawModels) {
      const displayName = formatModelDisplayName(m.id);
      const toolSupport = await testLMStudioModelToolSupport(baseUrl, m.id);

      models.push({
        id: m.id,
        name: displayName,
        toolSupport,
      });
    }

    return { success: true, models };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch models';
    console.warn('[LM Studio] Fetch failed:', message);

    if (error instanceof Error && error.name === 'AbortError') {
      return {
        success: false,
        error: 'Request timed out. Check your LM Studio server.',
      };
    }
    return { success: false, error: `Failed to fetch models: ${message}` };
  }
}

/**
 * Validates LM Studio configuration object structure.
 *
 * @param config - Configuration to validate
 * @throws Error if configuration is invalid
 */
export function validateLMStudioConfig(config: LMStudioConfig): void {
  if (typeof config.baseUrl !== 'string' || typeof config.enabled !== 'boolean') {
    throw new Error('Invalid LM Studio configuration');
  }

  validateHttpUrl(config.baseUrl, 'LM Studio base URL');

  if (config.lastValidated !== undefined && typeof config.lastValidated !== 'number') {
    throw new Error('Invalid LM Studio configuration');
  }

  if (config.models !== undefined) {
    if (!Array.isArray(config.models)) {
      throw new Error('Invalid LM Studio configuration: models must be an array');
    }
    for (const model of config.models) {
      if (typeof model.id !== 'string' || typeof model.name !== 'string') {
        throw new Error('Invalid LM Studio configuration: invalid model format');
      }
    }
  }
}
