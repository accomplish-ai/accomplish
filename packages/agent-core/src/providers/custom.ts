import { fetchWithTimeout } from '../utils/fetch.js';
import { validateHttpUrl } from '../utils/url.js';
import { sanitizeString } from '../utils/sanitize.js';

const DEFAULT_TIMEOUT_MS = 10000;

export interface CustomConnectionResult {
  success: boolean;
  error?: string;
}

/**
 * Tests connection to a custom OpenAI-compatible endpoint.
 *
 * Attempts to reach the /models endpoint to verify connectivity.
 * The connection is considered successful if we can reach the server,
 * even if /models returns an error (many endpoints don't implement it).
 *
 * @param baseUrl - The base URL of the OpenAI-compatible endpoint (e.g., https://api.example.com/v1)
 * @param apiKey - Optional API key for authentication
 * @returns Connection result indicating success or failure
 */
export async function testCustomConnection(
  baseUrl: string,
  apiKey?: string
): Promise<CustomConnectionResult> {
  const sanitizedUrl = sanitizeString(baseUrl, 'customUrl', 256);
  const sanitizedApiKey = apiKey ? sanitizeString(apiKey, 'apiKey', 256) : undefined;

  try {
    validateHttpUrl(sanitizedUrl, 'Custom endpoint URL');
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Invalid URL format' };
  }

  // Normalize URL - remove trailing slash
  const normalizedUrl = sanitizedUrl.replace(/\/+$/, '');

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (sanitizedApiKey) {
      headers['Authorization'] = `Bearer ${sanitizedApiKey}`;
    }

    // Try to reach the /models endpoint (standard OpenAI-compatible endpoint)
    // We consider it a success if we can reach the server, even if /models fails
    const modelsUrl = normalizedUrl.endsWith('/v1')
      ? `${normalizedUrl}/models`
      : `${normalizedUrl}/v1/models`;

    const response = await fetchWithTimeout(
      modelsUrl,
      { method: 'GET', headers },
      DEFAULT_TIMEOUT_MS
    );

    // Any response from the server indicates the endpoint is reachable
    if (response.ok) {
      console.log('[Custom] Connection successful, /models endpoint responded');
      return { success: true };
    }

    // Even if we get an error response, we know the server is reachable
    // This is important for endpoints that don't implement /models
    const status = response.status;

    if (status === 401 || status === 403) {
      // Authentication error - but the server is reachable
      // For custom endpoints without API keys, prompt for one
      if (!sanitizedApiKey) {
        return { success: false, error: 'Authentication required. Please provide an API key.' };
      }
      // If user provided an API key but /models returns 401/403, the endpoint
      // might not support /models at all. Trust the user and allow connection.
      // The real validation happens when they make an actual request.
      console.log('[Custom] Connection successful (server reachable, /models may not be supported)');
      return { success: true };
    }

    if (status === 404) {
      // The /models endpoint doesn't exist, but the server is reachable
      // This is acceptable for custom endpoints that might not implement /models
      console.log('[Custom] Connection successful (server reachable, /models not implemented)');
      return { success: true };
    }

    // For other error codes, try to get error details
    const errorData = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    const errorMessage = errorData?.error?.message || `Server returned status ${status}`;
    // Still allow connection for most errors - the server is reachable
    console.log(`[Custom] Server returned ${status}, but connection is reachable`);
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Connection failed';
    console.warn('[Custom] Connection failed:', message);

    if (error instanceof Error && error.name === 'AbortError') {
      return { success: false, error: 'Connection timed out. Make sure the endpoint is accessible.' };
    }

    return { success: false, error: `Cannot connect to endpoint: ${message}` };
  }
}
