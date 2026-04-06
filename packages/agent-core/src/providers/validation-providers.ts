/**
 * Provider-specific API key validation fetch helpers.
 * Each function performs a minimal HTTP request to verify the key is valid.
 */

import type { ProviderType } from '../common/types/provider.js';
import { ZAI_ENDPOINTS, DEFAULT_PROVIDERS } from '../common/types/provider.js';
import type { ZaiRegion } from '../common/types/providerSettings.js';
import { fetchWithTimeout } from '../utils/fetch.js';
import type { ValidationOptions } from './validation.js';

/**
 * Perform the provider-specific HTTP request for API key validation.
 * Returns a Response, or null if the provider skips validation (always valid).
 */
export async function fetchValidationResponse(
  provider: ProviderType,
  apiKey: string,
  options: ValidationOptions,
  timeout: number,
): Promise<Response | null> {
  switch (provider) {
    case 'anthropic':
      return fetchWithTimeout(
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
        timeout,
      );

    case 'openai': {
      const baseUrl = (options.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
      return fetchWithTimeout(
        `${baseUrl}/models`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
        },
        timeout,
      );
    }

    case 'google':
      return fetchWithTimeout(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
        { method: 'GET' },
        timeout,
      );

    case 'xai':
      return fetchWithTimeout(
        'https://api.x.ai/v1/models',
        {
          method: 'GET',
          headers: { Authorization: `Bearer ${apiKey}` },
        },
        timeout,
      );

    case 'deepseek':
      return fetchWithTimeout(
        'https://api.deepseek.com/models',
        {
          method: 'GET',
          headers: { Authorization: `Bearer ${apiKey}` },
        },
        timeout,
      );

    case 'openrouter':
      return fetchWithTimeout(
        'https://openrouter.ai/api/v1/auth/key',
        {
          method: 'GET',
          headers: { Authorization: `Bearer ${apiKey}` },
        },
        timeout,
      );

    case 'moonshot':
      return fetchWithTimeout(
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
        timeout,
      );

    case 'zai': {
      const zaiRegion: ZaiRegion = options.zaiRegion ?? 'international';
      const zaiEndpoint = ZAI_ENDPOINTS[zaiRegion];
      return fetchWithTimeout(
        `${zaiEndpoint}/models`,
        {
          method: 'GET',
          headers: { Authorization: `Bearer ${apiKey}` },
        },
        timeout,
      );
    }

    case 'minimax':
      return fetchWithTimeout(
        'https://api.minimax.io/anthropic/v1/messages',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'MiniMax-M2.5',
            max_tokens: 1,
            messages: [{ role: 'user', content: 'test' }],
          }),
        },
        timeout,
      );

    case 'ollama':
    case 'bedrock':
    case 'vertex':
    case 'azure-foundry':
    case 'litellm':
    case 'lmstudio':
    case 'custom':
      return null;

    default: {
      // Data-driven validation: fetch from modelsEndpoint configured in DEFAULT_PROVIDERS.
      // This enables validation for any OpenAI-compatible provider without adding new cases.
      const providerConfig = DEFAULT_PROVIDERS.find((p) => p.id === provider);
      if (providerConfig?.modelsEndpoint) {
        const { url, authStyle } = providerConfig.modelsEndpoint;
        const headers: Record<string, string> = {};
        let fetchUrl = url;

        if (authStyle === 'bearer') {
          headers['Authorization'] = `Bearer ${apiKey}`;
        } else if (authStyle === 'query-param') {
          fetchUrl = `${url}?key=${apiKey}`;
        } else if (authStyle === 'x-api-key') {
          headers['x-api-key'] = apiKey;
        }

        if (providerConfig.modelsEndpoint.extraHeaders) {
          Object.assign(headers, providerConfig.modelsEndpoint.extraHeaders);
        }

        return fetchWithTimeout(fetchUrl, { method: 'GET', headers }, timeout);
      }
      return null;
    }
  }
}
