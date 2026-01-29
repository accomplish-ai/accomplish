// apps/desktop/src/main/opencode/env-providers/providers.ts

import type { BedrockCredentials } from '@accomplish/shared';
import type { EnvProvider, EnvContext } from './types';

/**
 * Anthropic environment provider.
 * Sets ANTHROPIC_API_KEY.
 */
export class AnthropicEnvProvider implements EnvProvider {
  readonly providerId = 'anthropic' as const;

  setEnv(env: NodeJS.ProcessEnv, context: EnvContext): void {
    if (context.apiKeys.anthropic) {
      env.ANTHROPIC_API_KEY = context.apiKeys.anthropic;
      console.log('[OpenCode CLI] Using Anthropic API key from settings');
    }
  }
}

/**
 * OpenAI environment provider.
 * Sets OPENAI_API_KEY and optionally OPENAI_BASE_URL.
 */
export class OpenAIEnvProvider implements EnvProvider {
  readonly providerId = 'openai' as const;

  setEnv(env: NodeJS.ProcessEnv, context: EnvContext): void {
    if (context.apiKeys.openai) {
      env.OPENAI_API_KEY = context.apiKeys.openai;
      console.log('[OpenCode CLI] Using OpenAI API key from settings');

      if (context.openAiBaseUrl) {
        env.OPENAI_BASE_URL = context.openAiBaseUrl;
        console.log('[OpenCode CLI] Using OPENAI_BASE_URL override from settings');
      }
    }
  }
}

/**
 * Google environment provider.
 * Sets GOOGLE_GENERATIVE_AI_API_KEY.
 */
export class GoogleEnvProvider implements EnvProvider {
  readonly providerId = 'google' as const;

  setEnv(env: NodeJS.ProcessEnv, context: EnvContext): void {
    if (context.apiKeys.google) {
      env.GOOGLE_GENERATIVE_AI_API_KEY = context.apiKeys.google;
      console.log('[OpenCode CLI] Using Google API key from settings');
    }
  }
}

/**
 * xAI environment provider.
 * Sets XAI_API_KEY.
 */
export class XaiEnvProvider implements EnvProvider {
  readonly providerId = 'xai' as const;

  setEnv(env: NodeJS.ProcessEnv, context: EnvContext): void {
    if (context.apiKeys.xai) {
      env.XAI_API_KEY = context.apiKeys.xai;
      console.log('[OpenCode CLI] Using xAI API key from settings');
    }
  }
}

/**
 * DeepSeek environment provider.
 * Sets DEEPSEEK_API_KEY.
 */
export class DeepSeekEnvProvider implements EnvProvider {
  readonly providerId = 'deepseek' as const;

  setEnv(env: NodeJS.ProcessEnv, context: EnvContext): void {
    if (context.apiKeys.deepseek) {
      env.DEEPSEEK_API_KEY = context.apiKeys.deepseek;
      console.log('[OpenCode CLI] Using DeepSeek API key from settings');
    }
  }
}

/**
 * Z.AI environment provider.
 * Sets ZAI_API_KEY.
 */
export class ZaiEnvProvider implements EnvProvider {
  readonly providerId = 'zai' as const;

  setEnv(env: NodeJS.ProcessEnv, context: EnvContext): void {
    if (context.apiKeys.zai) {
      env.ZAI_API_KEY = context.apiKeys.zai;
      console.log('[OpenCode CLI] Using Z.AI API key from settings');
    }
  }
}

/**
 * OpenRouter environment provider.
 * Sets OPENROUTER_API_KEY.
 */
export class OpenRouterEnvProvider implements EnvProvider {
  readonly providerId = 'openrouter' as const;

  setEnv(env: NodeJS.ProcessEnv, context: EnvContext): void {
    if (context.apiKeys.openrouter) {
      env.OPENROUTER_API_KEY = context.apiKeys.openrouter;
      console.log('[OpenCode CLI] Using OpenRouter API key from settings');
    }
  }
}

/**
 * LiteLLM environment provider.
 * Sets LITELLM_API_KEY and logs base URL if configured.
 */
export class LiteLLMEnvProvider implements EnvProvider {
  readonly providerId = 'litellm' as const;

  setEnv(env: NodeJS.ProcessEnv, context: EnvContext): void {
    if (context.apiKeys.litellm) {
      env.LITELLM_API_KEY = context.apiKeys.litellm;
      console.log('[OpenCode CLI] Using LiteLLM API key from settings');
    }

    // Log base URL for debugging if LiteLLM is active
    if (context.activeModel?.provider === 'litellm' && context.activeModel.baseUrl) {
      console.log('[OpenCode CLI] LiteLLM active with base URL:', context.activeModel.baseUrl);
    }
  }
}

/**
 * MiniMax environment provider.
 * Sets MINIMAX_API_KEY.
 */
export class MiniMaxEnvProvider implements EnvProvider {
  readonly providerId = 'minimax' as const;

  setEnv(env: NodeJS.ProcessEnv, context: EnvContext): void {
    if (context.apiKeys.minimax) {
      env.MINIMAX_API_KEY = context.apiKeys.minimax;
      console.log('[OpenCode CLI] Using MiniMax API key from settings');
    }
  }
}

/**
 * Parse Bedrock credentials from JSON string.
 * Returns null if parsing fails or credentials are not present.
 */
function parseBedrockCredentials(credentialsJson: string | null): BedrockCredentials | null {
  if (!credentialsJson) return null;
  try {
    return JSON.parse(credentialsJson) as BedrockCredentials;
  } catch {
    return null;
  }
}

/**
 * AWS Bedrock environment provider.
 * Handles 3 authentication types: apiKey, accessKeys, and profile.
 * Sets AWS_BEARER_TOKEN_BEDROCK, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY,
 * AWS_SESSION_TOKEN, AWS_PROFILE, and AWS_REGION as appropriate.
 */
export class BedrockEnvProvider implements EnvProvider {
  readonly providerId = 'bedrock' as const;

  setEnv(env: NodeJS.ProcessEnv, context: EnvContext): void {
    const credentials = parseBedrockCredentials(context.apiKeys.bedrock);
    if (!credentials){
      console.log('[OpenCode CLI] No Bedrock credentials found');
      return;
    }

    if (credentials.authType === 'apiKey') {
      env.AWS_BEARER_TOKEN_BEDROCK = credentials.apiKey;
      console.log('[OpenCode CLI] Using Bedrock API Key credentials');
    } else if (credentials.authType === 'accessKeys') {
      env.AWS_ACCESS_KEY_ID = credentials.accessKeyId;
      env.AWS_SECRET_ACCESS_KEY = credentials.secretAccessKey;
      if (credentials.sessionToken) {
        env.AWS_SESSION_TOKEN = credentials.sessionToken;
      }
      console.log('[OpenCode CLI] Using Bedrock Access Key credentials');
    } else if (credentials.authType === 'profile') {
      env.AWS_PROFILE = credentials.profileName;
      console.log('[OpenCode CLI] Using Bedrock AWS Profile:', credentials.profileName);
    }

    if (credentials.region) {
      env.AWS_REGION = credentials.region;
      console.log('[OpenCode CLI] Using Bedrock region:', credentials.region);
    }
  }
}

/**
 * Ollama environment provider.
 * Sets OLLAMA_HOST based on active model or legacy settings.
 */
export class OllamaEnvProvider implements EnvProvider {
  readonly providerId = 'ollama' as const;

  setEnv(env: NodeJS.ProcessEnv, context: EnvContext): void {
    // Check new settings first, then legacy
    if (context.activeModel?.provider === 'ollama' && context.activeModel.baseUrl) {
      env.OLLAMA_HOST = context.activeModel.baseUrl;
      console.log('[OpenCode CLI] Using Ollama host from provider settings:', context.activeModel.baseUrl);
    } else if (context.selectedModel?.provider === 'ollama' && context.selectedModel.baseUrl) {
      env.OLLAMA_HOST = context.selectedModel.baseUrl;
      console.log('[OpenCode CLI] Using Ollama host from legacy settings:', context.selectedModel.baseUrl);
    }
  }
}
