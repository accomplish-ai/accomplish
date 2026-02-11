import type { ZaiRegion } from './providerSettings.js';

export const ZAI_ENDPOINTS: Record<ZaiRegion, string> = {
  china: 'https://open.bigmodel.cn/api/paas/v4',
  international: 'https://api.z.ai/api/coding/paas/v4',
};

export type ProviderType = 'anthropic' | 'openai' | 'openrouter' | 'google' | 'xai' | 'ollama' | 'deepseek' | 'moonshot' | 'zai' | 'azure-foundry' | 'custom' | 'bedrock' | 'litellm' | 'minimax' | 'lmstudio';

export type ApiKeyProvider =
  | 'anthropic'
  | 'openai'
  | 'openrouter'
  | 'google'
  | 'xai'
  | 'deepseek'
  | 'moonshot'
  | 'zai'
  | 'azure-foundry'
  | 'custom'
  | 'bedrock'
  | 'litellm'
  | 'minimax'
  | 'lmstudio'
  | 'elevenlabs';

/**
 * Providers that accept API key storage via the setApiKey IPC handler.
 * This is the allowlist of providers that can have their API keys stored.
 * Uses Set<string> to allow runtime checking of untrusted input strings.
 */
export const ALLOWED_API_KEY_PROVIDERS: ReadonlySet<string> = new Set<string>([
  'anthropic',
  'openai',
  'openrouter',
  'google',
  'xai',
  'deepseek',
  'moonshot',
  'zai',
  'azure-foundry',
  'custom',
  'bedrock',
  'litellm',
  'minimax',
  'lmstudio',
  'elevenlabs',
]);

/**
 * Providers that use standard OpenAI-compatible API key validation.
 * These providers can be validated using a simple test request to their API.
 * Uses Set<string> to allow runtime checking of untrusted input strings.
 */
export const STANDARD_VALIDATION_PROVIDERS: ReadonlySet<string> = new Set<string>([
  'anthropic',
  'openai',
  'google',
  'xai',
  'deepseek',
  'openrouter',
  'moonshot',
  'zai',
  'minimax',
]);

export interface ProviderConfig {
  id: ProviderType;
  name: string;
  models: ModelConfig[];
  requiresApiKey: boolean;
  apiKeyEnvVar?: string;
  baseUrl?: string;
}

export interface ModelConfig {
  id: string;
  displayName: string;
  provider: ProviderType;
  fullId: string;
  contextWindow?: number;
  maxOutputTokens?: number;
  supportsVision?: boolean;
}

export interface SelectedModel {
  provider: ProviderType;
  model: string;
  baseUrl?: string;
  deploymentName?: string;
}

export interface OllamaModelInfo {
  id: string;
  displayName: string;
  size: number;
}

export interface OllamaConfig {
  baseUrl: string;
  enabled: boolean;
  lastValidated?: number;
  models?: OllamaModelInfo[];
}

export interface AzureFoundryConfig {
  baseUrl: string;
  deploymentName: string;
  authType: 'api-key' | 'entra-id';
  enabled: boolean;
  lastValidated?: number;
}

export interface LiteLLMModel {
  id: string;
  name: string;
  provider: string;
  contextLength: number;
}

export interface LiteLLMConfig {
  baseUrl: string;
  enabled: boolean;
  lastValidated?: number;
  models?: LiteLLMModel[];
}

export interface LMStudioModel {
  id: string;
  name: string;
  toolSupport: 'supported' | 'unsupported' | 'unknown';
}

export interface LMStudioConfig {
  baseUrl: string;
  enabled: boolean;
  lastValidated?: number;
  models?: LMStudioModel[];
}

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
        id: 'gpt-5.2',
        displayName: 'GPT 5.2',
        provider: 'openai',
        fullId: 'openai/gpt-5.2',
        contextWindow: 400000,
        supportsVision: true,
      },
      {
        id: 'gpt-5.2-codex',
        displayName: 'GPT 5.2 Codex',
        provider: 'openai',
        fullId: 'openai/gpt-5.2-codex',
        contextWindow: 400000,
        supportsVision: true,
      },
      {
        id: 'gpt-5.1-codex-max',
        displayName: 'GPT 5.1 Codex Max',
        provider: 'openai',
        fullId: 'openai/gpt-5.1-codex-max',
        contextWindow: 272000,
        supportsVision: true,
      },
      {
        id: 'gpt-5.1-codex-mini',
        displayName: 'GPT 5.1 Codex Mini',
        provider: 'openai',
        fullId: 'openai/gpt-5.1-codex-mini',
        contextWindow: 400000,
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
    id: 'xai',
    name: 'xAI',
    requiresApiKey: true,
    apiKeyEnvVar: 'XAI_API_KEY',
    baseUrl: 'https://api.x.ai',
    models: [
      {
        id: 'grok-4',
        displayName: 'Grok 4',
        provider: 'xai',
        fullId: 'xai/grok-4',
        contextWindow: 256000,
        supportsVision: true,
      },
      {
        id: 'grok-3',
        displayName: 'Grok 3',
        provider: 'xai',
        fullId: 'xai/grok-3',
        contextWindow: 131000,
        supportsVision: false,
      },
    ],
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    requiresApiKey: true,
    apiKeyEnvVar: 'DEEPSEEK_API_KEY',
    baseUrl: 'https://api.deepseek.com',
    models: [
      {
        id: 'deepseek-chat',
        displayName: 'DeepSeek Chat (V3)',
        provider: 'deepseek',
        fullId: 'deepseek/deepseek-chat',
        contextWindow: 64000,
        supportsVision: false,
      },
      {
        id: 'deepseek-reasoner',
        displayName: 'DeepSeek Reasoner (R1)',
        provider: 'deepseek',
        fullId: 'deepseek/deepseek-reasoner',
        contextWindow: 64000,
        supportsVision: false,
      },
    ],
  },
  {
    id: 'moonshot',
    name: 'Moonshot AI',
    requiresApiKey: true,
    apiKeyEnvVar: 'MOONSHOT_API_KEY',
    baseUrl: 'https://api.moonshot.ai/v1',
    models: [
      {
        id: 'kimi-k2.5',
        displayName: 'Kimi K2.5',
        provider: 'moonshot',
        fullId: 'moonshot/kimi-k2.5',
        contextWindow: 256000,
        supportsVision: true,
      },
      {
        id: 'kimi-k2-turbo-preview',
        displayName: 'Kimi K2 Turbo (Preview)',
        provider: 'moonshot',
        fullId: 'moonshot/kimi-k2-turbo-preview',
        contextWindow: 256000,
      },
      {
        id: 'kimi-latest',
        displayName: 'Kimi Latest',
        provider: 'moonshot',
        fullId: 'moonshot/kimi-latest',
      },
    ],
  },
  {
    id: 'zai',
    name: 'Z.AI Coding Plan',
    requiresApiKey: true,
    apiKeyEnvVar: 'ZAI_API_KEY',
    baseUrl: 'https://open.bigmodel.cn',
    models: [
      {
        id: 'glm-4.7-flashx',
        displayName: 'GLM-4.7 FlashX (Latest)',
        provider: 'zai',
        fullId: 'zai/glm-4.7-flashx',
        contextWindow: 200000,
        supportsVision: false,
      },
      {
        id: 'glm-4.7',
        displayName: 'GLM-4.7',
        provider: 'zai',
        fullId: 'zai/glm-4.7',
        contextWindow: 200000,
        supportsVision: false,
      },
      {
        id: 'glm-4.7-flash',
        displayName: 'GLM-4.7 Flash',
        provider: 'zai',
        fullId: 'zai/glm-4.7-flash',
        contextWindow: 200000,
        supportsVision: false,
      },
      {
        id: 'glm-4.6',
        displayName: 'GLM-4.6',
        provider: 'zai',
        fullId: 'zai/glm-4.6',
        contextWindow: 200000,
        supportsVision: false,
      },
      {
        id: 'glm-4.5-flash',
        displayName: 'GLM-4.5 Flash',
        provider: 'zai',
        fullId: 'zai/glm-4.5-flash',
        contextWindow: 128000,
        supportsVision: false,
      },
    ],
  },
  {
    id: 'bedrock',
    name: 'Amazon Bedrock',
    requiresApiKey: false,
    models: [],
  },
  {
    id: 'minimax',
    name: 'MiniMax',
    requiresApiKey: true,
    apiKeyEnvVar: 'MINIMAX_API_KEY',
    baseUrl: 'https://api.minimax.io',
    models: [
      {
        id: 'MiniMax-M2',
        displayName: 'MiniMax-M2',
        provider: 'minimax',
        fullId: 'minimax/MiniMax-M2',
        contextWindow: 196608,
        supportsVision: false,
      },
      {
        id: 'MiniMax-M2.1',
        displayName: 'MiniMax-M2.1',
        provider: 'minimax',
        fullId: 'minimax/MiniMax-M2.1',
        contextWindow: 204800,
        supportsVision: false,
      },
    ],
  },
];

export const DEFAULT_MODEL: SelectedModel = {
  provider: 'anthropic',
  model: 'anthropic/claude-opus-4-5',
};
