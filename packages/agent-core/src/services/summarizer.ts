/**
 * Task summary generator using LLM APIs
 *
 * Generates short, descriptive titles for tasks (like ChatGPT's conversation titles).
 * Uses the first available API key, preferring Anthropic for speed/cost.
 */

import type { ApiKeyProvider } from '../common/types/provider.js';
import { createConsoleLogger } from '../utils/logging.js';
import {
  callAnthropic,
  callOpenAI,
  callGoogle,
  callXAI,
  truncatePrompt,
} from './summarizer-providers.js';

const log = createConsoleLogger({ prefix: 'Summarizer' });

/**
 * Type for the getApiKey function that retrieves API keys by provider
 */
export type GetApiKeyFn = (provider: ApiKeyProvider) => string | null;

/**
 * Generate a short summary title for a task prompt
 * @param prompt The user's task prompt
 * @param getApiKey Function to retrieve API keys by provider
 * @returns A short summary string, or truncated prompt as fallback
 */
export async function generateTaskSummary(prompt: string, getApiKey: GetApiKeyFn): Promise<string> {
  // Try providers in order of preference
  const providers: ApiKeyProvider[] = ['anthropic', 'openai', 'google', 'xai'];

  for (const provider of providers) {
    const apiKey = getApiKey(provider);
    if (!apiKey) {
      continue;
    }

    try {
      const summary = await callProviderByName(provider, apiKey, prompt);
      if (summary) {
        log.info(`[Summarizer] Generated summary using ${provider}: "${summary}"`);
        return summary;
      }
    } catch (error) {
      log.warn(`[Summarizer] ${provider} failed: ${String(error)}`);
      // Continue to next provider
    }
  }

  // Fallback: truncate prompt
  log.info('[Summarizer] All providers failed, using truncated prompt');
  return truncatePrompt(prompt);
}

async function callProviderByName(
  provider: ApiKeyProvider,
  apiKey: string,
  prompt: string,
): Promise<string | null> {
  switch (provider) {
    case 'anthropic':
      return callAnthropic(apiKey, prompt);
    case 'openai':
      return callOpenAI(apiKey, prompt);
    case 'google':
      return callGoogle(apiKey, prompt);
    case 'xai':
      return callXAI(apiKey, prompt);
    default:
      return null;
  }
}
