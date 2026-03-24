import { fetchWithTimeout } from '../utils/fetch.js';

const DEFAULT_TIMEOUT_MS = 10000;

export interface OpenRouterModel {
  id: string;
  name: string;
  provider: string;
  contextLength: number;
}

export interface FetchModelsResult {
  success: boolean;
  models?: OpenRouterModel[];
  error?: string;
}

/**
 * Fetches available models from the OpenRouter API.
 *
 * @param apiKey - The OpenRouter API key
 * @param timeout - Request timeout in milliseconds (default: 10000)
 * @returns Result object with success status and models array or error message
 */
export async function fetchOpenRouterModels(
  apiKey: string,
  timeout: number = DEFAULT_TIMEOUT_MS,
): Promise<FetchModelsResult> {
  if (!apiKey) {
    return { success: false, error: 'No OpenRouter API key configured' };
  }

  try {
    const response = await fetchWithTimeout(
      'https://openrouter.ai/api/v1/models',
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      },
      timeout,
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage =
        (errorData as { error?: { message?: string } })?.error?.message ||
        `API returned status ${response.status}`;
      return { success: false, error: errorMessage };
    }

    const data = (await response.json()) as {
      data?: Array<{ id: string; name: string; context_length?: number }>;
    };
    const models = (data.data || []).map((m) => {
      const provider = m.id.split('/')[0] || 'unknown';
      return {
        id: m.id,
        name: m.name || m.id,
        provider,
        contextLength: m.context_length || 0,
      };
    });

    console.log(`[OpenRouter] Fetched ${models.length} models`);
    return { success: true, models };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch models';
    console.warn('[OpenRouter] Fetch failed:', message);

    if (error instanceof Error && error.name === 'AbortError') {
      return { success: false, error: 'Request timed out. Check your internet connection.' };
    }
    return { success: false, error: `Failed to fetch models: ${message}` };
  }
}
