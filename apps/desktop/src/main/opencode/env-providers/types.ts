// apps/desktop/src/main/opencode/env-providers/types.ts

import type { ProviderId } from '@accomplish/shared';

/**
 * Context passed to environment providers containing all data needed
 * to configure environment variables for the OpenCode CLI.
 */
export interface EnvContext {
  /** API keys for all providers (keyed by provider name) */
  apiKeys: Record<string, string | null>;
  /** Currently active provider and model selection */
  activeModel: { provider: ProviderId; model: string; baseUrl?: string } | null;
  /** Legacy selected model (for backwards compatibility) */
  selectedModel: { provider: string; baseUrl?: string } | null;
  /** OpenAI base URL override */
  openAiBaseUrl: string;
}

/**
 * Interface for environment variable providers.
 * Each provider is responsible for setting its specific environment variables.
 */
export interface EnvProvider {
  /** The provider ID this env provider handles */
  readonly providerId: ProviderId;

  /**
   * Set environment variables for this provider.
   * @param env - The environment object to modify
   * @param context - Context containing API keys and model configuration
   */
  setEnv(env: NodeJS.ProcessEnv, context: EnvContext): void;
}
