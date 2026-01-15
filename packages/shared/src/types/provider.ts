/**
 * Provider and model configuration types for multi-provider support
 */

export type ProviderType = 'anthropic' | 'openai' | 'google' | 'groq' | 'local' | 'custom';

export interface ProviderConfig {
  id: ProviderType;
  name: string;
  models: ModelConfig[];
  requiresApiKey: boolean;
  apiKeyEnvVar?: string;
  baseUrl?: string;
}

export interface ModelConfig {
  id: string; // e.g., "claude-sonnet-4-5"
  displayName: string; // e.g., "Claude Sonnet 4.5"
  provider: ProviderType;
  fullId: string; // e.g., "anthropic/claude-sonnet-4-5"
  contextWindow?: number;
  maxOutputTokens?: number;
  supportsVision?: boolean;
}

export interface SelectedModel {
  provider: ProviderType;
  model: string; // Full ID: "anthropic/claude-sonnet-4-5"
}

export interface LocalLlmConfig {
  preset?: string;
  baseUrl: string;
  model: string;
}

/**
 * Default providers and models
 */
export const DEFAULT_PROVIDERS: ProviderConfig[] = [
  {
    id: 'anthropic',
    name: 'Anthropic',
    requiresApiKey: true,
    apiKeyEnvVar: 'ANTHROPIC_API_KEY',
    models: [
      {
        id: 'claude-haiku-4-5',
        displayName: 'Claude Haiku 4.5',
        provider: 'anthropic',
        fullId: 'anthropic/claude-haiku-4-5',
        contextWindow: 200000,
        supportsVision: true,
      },
      {
        id: 'claude-sonnet-4-5',
        displayName: 'Claude Sonnet 4.5',
        provider: 'anthropic',
        fullId: 'anthropic/claude-sonnet-4-5',
        contextWindow: 200000,
        supportsVision: true,
      },
      {
        id: 'claude-opus-4-5',
        displayName: 'Claude Opus 4.5',
        provider: 'anthropic',
        fullId: 'anthropic/claude-opus-4-5',
        contextWindow: 200000,
        supportsVision: true,
      },
    ],
  },
  {
    id: 'openai',
    name: 'OpenAI',
    requiresApiKey: true,
    apiKeyEnvVar: 'OPENAI_API_KEY',
    models: [
      {
        id: 'gpt-5-codex',
        displayName: 'GPT 5 Codex',
        provider: 'openai',
        fullId: 'openai/gpt-5-codex',
        contextWindow: 1000000,
        supportsVision: true,
      },
    ],
  },
  {
    id: 'google',
    name: 'Google AI',
    requiresApiKey: true,
    apiKeyEnvVar: 'GOOGLE_GENERATIVE_AI_API_KEY',
    models: [
      {
        id: 'gemini-3-pro-preview',
        displayName: 'Gemini 3 Pro',
        provider: 'google',
        fullId: 'google/gemini-3-pro-preview',
        contextWindow: 2000000,
        supportsVision: true,
      },
      {
        id: 'gemini-3-flash-preview',
        displayName: 'Gemini 3 Flash',
        provider: 'google',
        fullId: 'google/gemini-3-flash-preview',
        contextWindow: 1000000,
        supportsVision: true,
      },
    ],
  },
  {
    id: 'groq',
    name: 'Groq',
    requiresApiKey: true,
    apiKeyEnvVar: 'GROQ_API_KEY',
    models: [
      {
        id: 'llama-3-3-70b',
        displayName: 'Llama 3.3 70B',
        provider: 'groq',
        fullId: 'groq/llama-3.3-70b',
        contextWindow: 131072,
        supportsVision: false,
      },
      {
        id: 'llama-3-1-8b-instant',
        displayName: 'Llama 3.1 8B Instant',
        provider: 'groq',
        fullId: 'groq/llama-3.1-8b-instant',
        contextWindow: 131072,
        supportsVision: false,
      },
      {
        id: 'mixtral-8x7b',
        displayName: 'Mixtral 8x7B',
        provider: 'groq',
        fullId: 'groq/mixtral-8x7b',
        contextWindow: 32768,
        supportsVision: false,
      },
    ],
  },
  {
    id: 'local',
    name: 'Local Models',
    requiresApiKey: false,
    models: [
      {
        id: 'ollama',
        displayName: 'Ollama (Local)',
        provider: 'local',
        fullId: 'ollama/llama3',
        supportsVision: false,
      },
    ],
  },
];

export const DEFAULT_MODEL: SelectedModel = {
  provider: 'anthropic',
  model: 'anthropic/claude-opus-4-5',
};
