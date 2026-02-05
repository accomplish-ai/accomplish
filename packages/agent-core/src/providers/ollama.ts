import type { ToolSupportStatus } from '../common/types/providerSettings.js';

import { fetchWithTimeout } from '../utils/fetch.js';
import { testOllamaModelToolSupport } from './tool-support-testing.js';
import {
  type ConnectionResult,
  validateAndSanitizeUrl,
  handleConnectionError,
  createSuccessResult,
} from './provider-utils.js';

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
export type OllamaConnectionResult = ConnectionResult<OllamaModel>;

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
 */
export async function testOllamaConnection(url: string): Promise<OllamaConnectionResult> {
  const urlValidation = validateAndSanitizeUrl(url, 'Ollama');
  if (!urlValidation.valid) {
    return { success: false, error: urlValidation.error };
  }

  try {
    const response = await fetchWithTimeout(
      `${urlValidation.url}/api/tags`,
      { method: 'GET' },
      OLLAMA_API_TIMEOUT_MS
    );

    if (!response.ok) {
      throw new Error(`Ollama returned status ${response.status}`);
    }

    const data = (await response.json()) as OllamaTagsResponse;
    const rawModels = data.models || [];

    if (rawModels.length === 0) {
      return createSuccessResult([]);
    }

    const models: OllamaModel[] = [];
    for (const m of rawModels) {
      const toolSupport = await testOllamaModelToolSupport(urlValidation.url, m.name);
      models.push({
        id: m.name,
        displayName: m.name,
        size: m.size,
        toolSupport,
      });
    }

    return createSuccessResult(models);
  } catch (error) {
    return handleConnectionError(error, 'Ollama');
  }
}
