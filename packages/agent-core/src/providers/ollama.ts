import type { ToolSupportStatus } from '../common/types/providerSettings.js';

import { fetchWithTimeout } from '../utils/fetch.js';
import { validateHttpUrl } from '../utils/url.js';
import { sanitizeString } from '../utils/sanitize.js';
import { testOllamaModelToolSupport } from './tool-support-testing.js';

/** Default timeout for Ollama API requests in milliseconds */
const OLLAMA_API_TIMEOUT_MS = 15000;

/**
 * Ollama model information with tool support status
 */
export interface OllamaModel {
  id: string;
  displayName: string;
  size: number;
  toolSupport?: ToolSupportStatus;
}

/**
 * Result of testing connection to an Ollama server
 */
export interface OllamaConnectionResult {
  success: boolean;
  error?: string;
  models?: OllamaModel[];
}

/** Response type from Ollama /api/tags endpoint */
interface OllamaTagsResponse {
  models?: Array<{ name: string; size: number }>;
}

/**
 * Tests connection to an Ollama server and retrieves available models.
 *
 * This function:
 * 1. Validates and sanitizes the provided URL
 * 2. Calls the Ollama /api/tags endpoint to list available models
 * 3. For each model, tests whether it supports tool calling
 *
 * @param url - The Ollama server URL (e.g., 'http://localhost:11434')
 * @returns Connection result with success status and available models
 */
export async function testOllamaConnection(url: string): Promise<OllamaConnectionResult> {
  const sanitizedUrl = sanitizeString(url, 'ollamaUrl', 256);

  try {
    validateHttpUrl(sanitizedUrl, 'Ollama URL');
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Invalid URL format' };
  }

  try {
    const response = await fetchWithTimeout(
      `${sanitizedUrl}/api/tags`,
      { method: 'GET' },
      OLLAMA_API_TIMEOUT_MS,
    );

    if (!response.ok) {
      throw new Error(`Ollama returned status ${response.status}`);
    }

    const data = (await response.json()) as OllamaTagsResponse;
    const rawModels = data.models || [];

    if (rawModels.length === 0) {
      return { success: true, models: [] };
    }

    const BATCH_SIZE = 5;
    const models: OllamaModel[] = [];

    for (let i = 0; i < rawModels.length; i += BATCH_SIZE) {
      const batch = rawModels.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(
        batch.map(async (m) => {
          const toolSupport = await testOllamaModelToolSupport(sanitizedUrl, m.name);
          return { id: m.name, displayName: m.name, size: m.size, toolSupport };
        }),
      );
      models.push(...results);
    }

    return { success: true, models };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Connection failed';

    if (error instanceof Error && error.name === 'AbortError') {
      return { success: false, error: 'Connection timed out. Make sure Ollama is running.' };
    }
    return { success: false, error: `Cannot connect to Ollama: ${message}` };
  }
}
