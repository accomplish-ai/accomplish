import type { ProviderType } from '../common/types/provider.js';
import { ZAI_ENDPOINTS } from '../common/types/provider.js';
import type { ZaiRegion } from '../common/types/providerSettings.js';

import { fetchWithTimeout } from '../utils/fetch.js';

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
  options?: ValidationOptions
): Promise<ValidationResult> {
  const timeout = options?.timeout ?? DEFAULT_TIMEOUT_MS;

  try {
    let response: Response;

    switch (provider) {
      case 'anthropic':
        response = await fetchWithTimeout(
          'https://api.anthropic.com/v1/messages',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': apiKey,
              'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
              model: 'claude-3-haiku-20240307',
              max_tokens: 1,
              messages: [{ role: 'user', content: 'test' }],
            }),
          },
          timeout
        );
        break;

      case 'openai': {
        const baseUrl = (options?.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
        response = await fetchWithTimeout(
          `${baseUrl}/models`,
          {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${apiKey}`,
            },
          },
          timeout
        );
        break;
      }

      case 'google':
        response = await fetchWithTimeout(
          `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
          {
            method: 'GET',
          },
          timeout
        );
        break;

      case 'xai':
        response = await fetchWithTimeout(
          'https://api.x.ai/v1/models',
          {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${apiKey}`,
            },
          },
          timeout
        );
        break;

      case 'deepseek':
        response = await fetchWithTimeout(
          'https://api.deepseek.com/models',
          {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${apiKey}`,
            },
          },
          timeout
        );
        break;

      case 'openrouter':
        response = await fetchWithTimeout(
          'https://openrouter.ai/api/v1/auth/key',
          {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${apiKey}`,
            },
          },
          timeout
        );
        break;

      case 'moonshot':
        response = await fetchWithTimeout(
          'https://api.moonshot.ai/v1/chat/completions',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model: 'kimi-latest',
              max_tokens: 1,
              messages: [{ role: 'user', content: 'test' }],
            }),
          },
          timeout
        );
        break;

      case 'zai': {
        const zaiRegion = options?.zaiRegion ?? 'international';
        const zaiEndpoint = ZAI_ENDPOINTS[zaiRegion];
        response = await fetchWithTimeout(
          `${zaiEndpoint}/models`,
          {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${apiKey}`,
            },
          },
          timeout
        );
        break;
      }

      case 'minimax':
        response = await fetchWithTimeout(
          'https://api.minimax.io/anthropic/v1/messages',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiKey}`,
              'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
              model: 'MiniMax-M2',
              max_tokens: 1,
              messages: [{ role: 'user', content: 'test' }],
            }),
          },
          timeout
        );
        break;

      case 'ollama':
      case 'bedrock':
      case 'vertex':
      case 'azure-foundry':
      case 'litellm':
      case 'lmstudio':
      case 'custom':
      default:
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
