/**
 * API Key Validators
 *
 * Provides provider-specific API key validation using the Strategy pattern.
 * Each provider has its own validation logic to avoid hardcoding specific models
 * that may be deprecated.
 *
 * @module main/utils/api-key-validators
 */

/**
 * Result of API key validation
 */
export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Base interface for API key validators
 */
export interface ApiKeyValidator {
  validate(apiKey: string, timeoutMs: number): Promise<ValidationResult>;
}

/**
 * Fetch with timeout using AbortController
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Handle common fetch errors
 */
function handleFetchError(error: unknown): ValidationResult {
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

/**
 * Anthropic API key validator
 * Uses /v1/messages endpoint with a minimal request
 * Falls back through multiple models to handle deprecation
 */
export class AnthropicValidator implements ApiKeyValidator {
  // Models to try in order of preference (newest first)
  private static readonly FALLBACK_MODELS = [
    'claude-3-5-haiku-latest',
    'claude-3-haiku-20240307',
    'claude-3-sonnet-20240229',
  ];

  async validate(apiKey: string, timeoutMs: number): Promise<ValidationResult> {
    // Try each model until one works
    for (const model of AnthropicValidator.FALLBACK_MODELS) {
      try {
        const response = await fetchWithTimeout(
          'https://api.anthropic.com/v1/messages',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': apiKey,
              'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
              model,
              max_tokens: 1,
              messages: [{ role: 'user', content: 'hi' }],
            }),
          },
          timeoutMs
        );

        if (response.ok) {
          console.log(`[AnthropicValidator] Validation succeeded with model: ${model}`);
          return { valid: true };
        }

        // Check for model-specific errors vs authentication errors
        const errorData = await response.json().catch(() => ({})) as Record<string, unknown>;
        const errorType = (errorData.error as Record<string, unknown>)?.type;
        const errorMessage = (errorData.error as Record<string, unknown>)?.message as string;

        // If it's an authentication error, don't try other models
        if (response.status === 401 || errorType === 'authentication_error') {
          return {
            valid: false,
            error: errorMessage || 'Invalid API key',
          };
        }

        // If it's a model not found error, try next model
        if (response.status === 404 || errorType === 'not_found_error') {
          console.log(`[AnthropicValidator] Model ${model} not available, trying next`);
          continue;
        }

        // For other errors, return the error
        return {
          valid: false,
          error: errorMessage || `API returned status ${response.status}`,
        };
      } catch (error) {
        return handleFetchError(error);
      }
    }

    return {
      valid: false,
      error: 'Unable to validate API key - no available models',
    };
  }
}

/**
 * OpenAI API key validator
 * Uses /v1/models endpoint which is more stable than chat completions
 */
export class OpenAIValidator implements ApiKeyValidator {
  async validate(apiKey: string, timeoutMs: number): Promise<ValidationResult> {
    try {
      const response = await fetchWithTimeout(
        'https://api.openai.com/v1/models',
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
        },
        timeoutMs
      );

      if (response.ok) {
        return { valid: true };
      }

      const errorData = await response.json().catch(() => ({})) as Record<string, unknown>;
      const errorMessage = (errorData.error as Record<string, unknown>)?.message as string;

      return {
        valid: false,
        error: errorMessage || `API returned status ${response.status}`,
      };
    } catch (error) {
      return handleFetchError(error);
    }
  }
}

/**
 * Google AI API key validator
 * Uses /v1beta/models endpoint
 */
export class GoogleValidator implements ApiKeyValidator {
  async validate(apiKey: string, timeoutMs: number): Promise<ValidationResult> {
    try {
      const response = await fetchWithTimeout(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
        {
          method: 'GET',
        },
        timeoutMs
      );

      if (response.ok) {
        return { valid: true };
      }

      const errorData = await response.json().catch(() => ({})) as Record<string, unknown>;
      const errorMessage = (errorData.error as Record<string, unknown>)?.message as string;

      return {
        valid: false,
        error: errorMessage || `API returned status ${response.status}`,
      };
    } catch (error) {
      return handleFetchError(error);
    }
  }
}

/**
 * Groq API key validator
 * Uses /openai/v1/models endpoint
 */
export class GroqValidator implements ApiKeyValidator {
  async validate(apiKey: string, timeoutMs: number): Promise<ValidationResult> {
    try {
      const response = await fetchWithTimeout(
        'https://api.groq.com/openai/v1/models',
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
        },
        timeoutMs
      );

      if (response.ok) {
        return { valid: true };
      }

      const errorData = await response.json().catch(() => ({})) as Record<string, unknown>;
      const errorMessage = (errorData.error as Record<string, unknown>)?.message as string;

      return {
        valid: false,
        error: errorMessage || `API returned status ${response.status}`,
      };
    } catch (error) {
      return handleFetchError(error);
    }
  }
}

/**
 * Custom provider validator (always returns valid)
 */
export class CustomValidator implements ApiKeyValidator {
  async validate(_apiKey: string, _timeoutMs: number): Promise<ValidationResult> {
    console.log('[CustomValidator] Skipping validation for custom provider');
    return { valid: true };
  }
}

/**
 * Registry of validators by provider name
 */
const validators: Record<string, ApiKeyValidator> = {
  anthropic: new AnthropicValidator(),
  openai: new OpenAIValidator(),
  google: new GoogleValidator(),
  groq: new GroqValidator(),
  custom: new CustomValidator(),
};

/**
 * Get validator for a provider
 */
export function getValidator(provider: string): ApiKeyValidator | null {
  return validators[provider] || null;
}

/**
 * Validate an API key for a given provider
 */
export async function validateApiKey(
  provider: string,
  apiKey: string,
  timeoutMs: number = 15000
): Promise<ValidationResult> {
  const validator = getValidator(provider);

  if (!validator) {
    return { valid: false, error: 'Unsupported provider' };
  }

  return validator.validate(apiKey, timeoutMs);
}
