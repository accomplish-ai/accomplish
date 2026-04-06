import type { ProviderType } from '../common/types/provider.js';
import type { ZaiRegion } from '../common/types/providerSettings.js';

import { fetchValidationResponse } from './validation-providers.js';

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export interface ValidationOptions {
  baseUrl?: string;
  timeout?: number;
  zaiRegion?: ZaiRegion;
}

const DEFAULT_TIMEOUT_MS = 10000;

export async function validateApiKey(
  provider: ProviderType,
  apiKey: string,
  options?: ValidationOptions,
): Promise<ValidationResult> {
  const timeout = options?.timeout ?? DEFAULT_TIMEOUT_MS;

  try {
    const response = await fetchValidationResponse(provider, apiKey, options ?? {}, timeout);

    // null means the provider skips validation (always valid)
    if (response === null) {
      return { valid: true };
    }

    if (response.ok) {
      return { valid: true };
    }

    const errorData = await response.json().catch(() => ({}));
    const errorMessage =
      (errorData as { error?: { message?: string } })?.error?.message ||
      `API returned status ${response.status}`;

    if (response.status === 401) {
      return { valid: false, error: 'Invalid API key' };
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
      error: 'Failed to validate API key. Check your internet connection.',
    };
  }
}
