import { validateHttpUrl } from '../utils/url.js';
import { sanitizeString } from '../utils/sanitize.js';

// ============================================================================
// Constants
// ============================================================================

/** Maximum length for sanitized provider URLs */
const MAX_URL_LENGTH = 256;

// ============================================================================
// Generic Types
// ============================================================================

/**
 * Generic connection result for provider operations.
 * Used by NIM, LM Studio, LiteLLM, Ollama, etc.
 */
export interface ConnectionResult<TModel> {
  success: boolean;
  error?: string;
  models?: TModel[];
}

// ============================================================================
// URL Validation
// ============================================================================

/**
 * Result of URL validation and sanitization.
 */
export type UrlValidationResult =
  | { valid: true; url: string }
  | { valid: false; error: string };

/**
 * Validates and sanitizes a provider URL.
 *
 * @param url - The URL to validate
 * @param providerName - Provider name for error messages (e.g., 'NIM', 'LM Studio')
 * @returns Validation result with sanitized URL or error message
 */
export function validateAndSanitizeUrl(
  url: string,
  providerName: string
): UrlValidationResult {
  const fieldName = `${providerName.toLowerCase().replace(/\s+/g, '')}Url`;
  const sanitizedUrl = sanitizeString(url, fieldName, MAX_URL_LENGTH);

  try {
    validateHttpUrl(sanitizedUrl, `${providerName} URL`);
    return { valid: true, url: sanitizedUrl };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid URL format';
    return { valid: false, error: message };
  }
}

// ============================================================================
// Error Handling
// ============================================================================

/**
 * Extracts error message from an API error response.
 * Handles the common OpenAI-compatible error format.
 *
 * @param errorData - The parsed error response body
 * @param fallbackStatus - HTTP status code to use in fallback message
 * @returns Extracted or fallback error message
 */
export function extractApiErrorMessage(
  errorData: unknown,
  fallbackStatus: number
): string {
  const typedError = errorData as { error?: { message?: string } };
  return typedError?.error?.message || `API returned status ${fallbackStatus}`;
}

/**
 * Handles connection errors and returns a standardized error result.
 *
 * @param error - The caught error
 * @param providerName - Provider name for error messages
 * @param timeoutMessage - Custom message for timeout errors
 * @returns Connection result with appropriate error message
 */
export function handleConnectionError<TModel>(
  error: unknown,
  providerName: string,
  timeoutMessage?: string
): ConnectionResult<TModel> {
  const message = error instanceof Error ? error.message : 'Connection failed';
  const isTimeout = error instanceof Error && error.name === 'AbortError';

  if (isTimeout) {
    const defaultTimeoutMsg = `Connection timed out. Make sure ${providerName} is running.`;
    return { success: false, error: timeoutMessage || defaultTimeoutMsg };
  }

  return { success: false, error: `Cannot connect to ${providerName}: ${message}` };
}

/**
 * Handles fetch errors for model refresh operations.
 * Similar to handleConnectionError but with different default messages.
 *
 * @param error - The caught error
 * @param providerName - Provider name for error messages
 * @param timeoutMessage - Custom message for timeout errors
 * @returns Connection result with appropriate error message
 */
export function toConnectionError<TModel>(
  error: unknown,
  providerName: string,
  timeoutMessage?: string
): ConnectionResult<TModel> {
  const message = error instanceof Error ? error.message : 'Failed to fetch models';
  const isTimeout = error instanceof Error && error.name === 'AbortError';

  if (isTimeout) {
    const defaultTimeoutMsg = `Request timed out. Check your ${providerName} server.`;
    return { success: false, error: timeoutMessage || defaultTimeoutMsg };
  }

  return { success: false, error: `Failed to fetch models: ${message}` };
}

// ============================================================================
// Result Helpers
// ============================================================================

/**
 * Creates a failure result with an error message.
 */
export function createFailureResult<TModel>(error: string): ConnectionResult<TModel> {
  return { success: false, error };
}

/**
 * Creates a success result with models.
 */
export function createSuccessResult<TModel>(models: TModel[]): ConnectionResult<TModel> {
  return { success: true, models };
}
