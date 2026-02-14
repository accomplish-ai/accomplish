import { fetchWithTimeout } from '../utils/fetch.js';

export interface BrowserbaseValidationResult {
  valid: boolean;
  error?: string;
}

const BROWSERBASE_API_BASE = 'https://api.browserbase.com/v1';
const DEFAULT_TIMEOUT_MS = 10000;

export async function validateBrowserbaseCredentials(
  apiKey: string,
  projectId: string,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<BrowserbaseValidationResult> {
  try {
    const response = await fetchWithTimeout(
      `${BROWSERBASE_API_BASE}/projects/${projectId}`,
      {
        method: 'GET',
        headers: {
          'x-bb-api-key': apiKey,
        },
      },
      timeoutMs
    );

    if (response.ok) {
      return { valid: true };
    }

    const errorData = await response.json().catch(() => ({}));
    const errorMessage =
      (errorData as { message?: string })?.message ||
      `API returned status ${response.status}`;

    if (response.status === 401) {
      return { valid: false, error: 'Invalid API key' };
    }

    if (response.status === 404) {
      return { valid: false, error: 'Project not found' };
    }

    return { valid: false, error: errorMessage };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return {
        valid: false,
        error: 'Request timed out. Please check your internet connection and try again.',
      };
    }
    return {
      valid: false,
      error: 'Failed to validate credentials. Check your internet connection.',
    };
  }
}
