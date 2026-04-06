/**
 * ElevenLabs API key validation and error response parsing.
 *
 * ESM module — use .js extensions on imports.
 */

import { fetchWithTimeout } from '../utils/fetch.js';

export const ELEVENLABS_API_TIMEOUT_MS = 30000;

/**
 * Validate an ElevenLabs API key by making a test request.
 */
export async function validateElevenLabsApiKey(
  key: string | null,
): Promise<{ valid: boolean; error?: string }> {
  if (!key || !key.trim()) {
    return { valid: false, error: 'API key is required' };
  }

  try {
    const response = await fetchWithTimeout(
      'https://api.elevenlabs.io/v1/models',
      {
        method: 'GET',
        headers: {
          'xi-api-key': key.trim(),
        },
      },
      ELEVENLABS_API_TIMEOUT_MS,
    );

    if (response.ok) {
      return { valid: true };
    }

    if (response.status === 401 || response.status === 403) {
      return {
        valid: false,
        error: 'Invalid API key. Please check your ElevenLabs API key.',
      };
    }

    const rawText = await response.text().catch(() => '');
    let errorData: Record<string, unknown> = {};
    try {
      errorData = JSON.parse(rawText);
    } catch {
      // Not JSON, use raw text below
    }
    const errorMessage =
      (errorData as { error?: { message?: string } })?.error?.message ||
      rawText ||
      `API returned status ${response.status}`;
    return { valid: false, error: `API error: ${errorMessage}` };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return {
        valid: false,
        error: 'Request timed out. Please check your internet connection.',
      };
    }
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { valid: false, error: `Network error: ${message}` };
  }
}

/**
 * Parse an ElevenLabs error response body into a human-readable message.
 */
export function parseElevenLabsErrorMessage(
  errorData: Record<string, unknown>,
  errorText: string,
  statusText: string,
): string {
  const detail = (errorData as { detail?: unknown })?.detail;

  if (typeof detail === 'string') {
    return detail;
  }

  if (detail && typeof detail === 'object') {
    const detailObj = detail as Record<string, unknown>;
    const detailMessage = detailObj.message ?? detailObj.status;
    if (typeof detailMessage === 'string') {
      return detailMessage;
    }
    if (detailMessage !== undefined) {
      return JSON.stringify(detailMessage);
    }
    return JSON.stringify(detail);
  }

  if ((errorData as { error?: { message?: unknown } })?.error?.message) {
    const nestedMessage = (errorData as { error: { message: unknown } }).error.message;
    return typeof nestedMessage === 'string' ? nestedMessage : JSON.stringify(nestedMessage);
  }

  if ((errorData as { message?: unknown })?.message) {
    const rootMessage = (errorData as { message: unknown }).message;
    return typeof rootMessage === 'string' ? rootMessage : JSON.stringify(rootMessage);
  }

  if (errorText) {
    return errorText.substring(0, 200);
  }

  return statusText || 'Unknown API error';
}
