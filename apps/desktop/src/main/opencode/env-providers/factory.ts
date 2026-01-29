// apps/desktop/src/main/opencode/env-providers/factory.ts

import type { ProviderId } from '@accomplish/shared';
import type { EnvProvider } from './types';
import {
  AnthropicEnvProvider,
  OpenAIEnvProvider,
  GoogleEnvProvider,
  XaiEnvProvider,
  DeepSeekEnvProvider,
  ZaiEnvProvider,
  OpenRouterEnvProvider,
  LiteLLMEnvProvider,
  MiniMaxEnvProvider,
  BedrockEnvProvider,
  OllamaEnvProvider,
} from './providers';

/**
 * Factory for environment providers.
 * Provides access to all registered environment providers.
 */
export class EnvProviderFactory {
  private static readonly providers: Map<ProviderId, EnvProvider> = new Map<
    ProviderId,
    EnvProvider
  >([
    ['anthropic', new AnthropicEnvProvider()],
    ['openai', new OpenAIEnvProvider()],
    ['google', new GoogleEnvProvider()],
    ['xai', new XaiEnvProvider()],
    ['deepseek', new DeepSeekEnvProvider()],
    ['zai', new ZaiEnvProvider()],
    ['openrouter', new OpenRouterEnvProvider()],
    ['litellm', new LiteLLMEnvProvider()],
    ['minimax', new MiniMaxEnvProvider()],
    ['bedrock', new BedrockEnvProvider()],
    ['ollama', new OllamaEnvProvider()],
  ]);

  /**
   * Get all registered environment providers.
   * @returns Array of all environment providers
   */
  static getAll(): EnvProvider[] {
    return Array.from(this.providers.values());
  }

  /**
   * Get a specific environment provider by ID.
   * @param id - The provider ID to look up
   * @returns The environment provider, or undefined if not found
   */
  static get(id: ProviderId): EnvProvider | undefined {
    return this.providers.get(id);
  }
}
