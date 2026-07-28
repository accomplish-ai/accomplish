/**
 * LM Studio model discovery helpers.
 * Fetches available models from the LM Studio server and tests tool support.
 */

import { fetchWithTimeout } from '../utils/fetch.js';
import { testLMStudioModelToolSupport } from './tool-support-testing.js';
import { createConsoleLogger } from '../utils/logging.js';

const log = createConsoleLogger({ prefix: 'LMStudio' });

/** Default timeout for LM Studio API requests in milliseconds */
export const LMSTUDIO_REQUEST_TIMEOUT_MS = 15000;

interface RawLMStudioModel {
  id: string;
  displayName?: string;
}

/** Response type from the OpenAI-compatible LM Studio endpoint. */
interface LMStudioOpenAIModelsResponse {
  data?: Array<{
    id?: string;
  }>;
}

/** Response type from LM Studio's native v1 endpoint. */
interface LMStudioNativeModelsResponse {
  models?: Array<{
    type?: string;
    display_name?: string;
    loaded_instances?: Array<{
      id?: string;
    }>;
  }>;
}

import type { ToolSupportStatus } from '../common/types/providerSettings.js';

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
 */
export function formatModelDisplayName(modelId: string): string {
  return modelId.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '').replace(/\/(?:api\/)?v1$/i, '');
}

function parseModelResponse(data: unknown): RawLMStudioModel[] {
  if (!data || typeof data !== 'object') {
    return [];
  }

  const response = data as LMStudioOpenAIModelsResponse & LMStudioNativeModelsResponse;
  if (Array.isArray(response.data)) {
    return response.data.flatMap((model) => {
      if (typeof model.id !== 'string' || model.id.length === 0) {
        return [];
      }
      return [{ id: model.id }];
    });
  }

  if (!Array.isArray(response.models)) {
    return [];
  }

  return response.models.flatMap((model) => {
    // Embedding models cannot be used by the chat provider and should not be
    // sent through the tool-support probe.
    if (model.type && model.type !== 'llm') {
      return [];
    }

    return (model.loaded_instances || []).flatMap((instance) => {
      if (typeof instance.id !== 'string' || instance.id.length === 0) {
        return [];
      }
      return [{ id: instance.id, displayName: model.display_name }];
    });
  });
}

interface RawModelFetchResult {
  success: boolean;
  models: RawLMStudioModel[];
  error?: string;
}

async function fetchRawModels(url: string, timeoutMs: number): Promise<RawModelFetchResult> {
  const response = await fetchWithTimeout(url, { method: 'GET' }, timeoutMs);

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const errorMessage =
      (errorData as { error?: { message?: string } })?.error?.message ||
      `API returned status ${response.status}`;
    return { success: false, models: [], error: errorMessage };
  }

  return { success: true, models: parseModelResponse(await response.json()) };
}

/**
 * Fetch raw model list from LM Studio and enrich with tool support.
 *
 * LM Studio exposes two model-list APIs. Older and OpenAI-compatible servers
 * use `/v1/models` with a `data` array, while newer servers also expose the
 * native `/api/v1/models` endpoint with a `models` array. Keep the compatible
 * endpoint as the primary path and use the native endpoint when it returns no
 * usable models so both response formats work without requiring a live server
 * migration.
 */
export async function fetchAndEnrichModels(
  baseUrl: string,
  timeoutMs: number,
): Promise<LMStudioConnectionResult> {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  const openAIResult = await fetchRawModels(`${normalizedBaseUrl}/v1/models`, timeoutMs);
  let rawModels = openAIResult.models;

  if (rawModels.length === 0) {
    const nativeResult = await fetchRawModels(`${normalizedBaseUrl}/api/v1/models`, timeoutMs);
    if (nativeResult.models.length > 0) {
      rawModels = nativeResult.models;
    } else if (!openAIResult.success && !nativeResult.success) {
      return { success: false, error: openAIResult.error || nativeResult.error };
    }
  }

  const models: LMStudioModel[] = [];

  for (const m of rawModels) {
    const displayName = m.displayName || formatModelDisplayName(m.id);
    const toolSupport = await testLMStudioModelToolSupport(normalizedBaseUrl, m.id);

    models.push({
      id: m.id,
      name: displayName,
      toolSupport,
    });

    log.info(`[LM Studio] Model ${m.id}: toolSupport=${toolSupport}`);
  }

  return { success: true, models };
}

/**
 * Fetches available models from an LM Studio server.
 *
 * Intended for refreshing the model list when LM Studio is already configured.
 *
 * @param options - Options including base URL and optional timeout
 * @returns Result with models if successful
 */
export async function fetchLMStudioModels(
  options: LMStudioFetchModelsOptions,
): Promise<LMStudioConnectionResult> {
  const { baseUrl, timeoutMs = LMSTUDIO_REQUEST_TIMEOUT_MS } = options;

  try {
    return await fetchAndEnrichModels(baseUrl, timeoutMs);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch models';
    log.warn(`[LM Studio] Fetch failed: ${message}`);

    if (error instanceof Error && error.name === 'AbortError') {
      return {
        success: false,
        error: 'Request timed out. Check your LM Studio server.',
      };
    }
    return { success: false, error: `Failed to fetch models: ${message}` };
  }
}
