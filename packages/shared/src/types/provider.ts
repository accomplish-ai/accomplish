/**
 * Provider and model configuration types for multi-provider support
 */

export type ProviderType = 'anthropic' | 'openai' | 'openrouter' | 'google' | 'xai' | 'ollama' | 'deepseek' | 'zai' | 'azure-foundry' | 'custom' | 'bedrock' | 'litellm' | 'minimax' | 'lmstudio' | 'nebius' | 'together' | 'fireworks' | 'groq' | 'kimi';

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
  baseUrl?: string;  // For Ollama: the server URL, for Azure Foundry: the endpoint URL
  deploymentName?: string;  // For Azure Foundry: the deployment name
}

/**
 * Ollama model info from API
 */
export interface OllamaModelInfo {
  id: string;        // e.g., "qwen3:latest"
  displayName: string;
  size: number;
}

/**
 * Ollama server configuration
 */
export interface OllamaConfig {
  baseUrl: string;
  enabled: boolean;
  lastValidated?: number;
  models?: OllamaModelInfo[];  // Discovered models from Ollama API
}

/**
/**
 * Azure Foundry configuration
 */
export interface AzureFoundryConfig {
  baseUrl: string;  // Azure Foundry endpoint URL
  deploymentName: string;  // Deployment name
  authType: 'api-key' | 'entra-id';  // Authentication type
  enabled: boolean;
  lastValidated?: number;
}

/**
 * OpenRouter model info from API
 */
export interface OpenRouterModel {
  id: string;           // e.g., "anthropic/claude-3.5-sonnet"
  name: string;         // e.g., "Claude 3.5 Sonnet"
  provider: string;     // e.g., "anthropic" (extracted from id)
  contextLength: number;
}

/**
 * OpenRouter configuration
 */
export interface OpenRouterConfig {
  models: OpenRouterModel[];
  lastFetched?: number;
}

/**
 * LiteLLM model info from API
 */
export interface LiteLLMModel {
  id: string;           // e.g., "openai/gpt-4"
  name: string;         // Display name (same as id for LiteLLM)
  provider: string;     // Extracted from model ID
  contextLength: number;
}

/**
 * LiteLLM configuration
 */
export interface LiteLLMConfig {
  baseUrl: string;      // e.g., "http://localhost:4000"
  enabled: boolean;
  lastValidated?: number;
  models?: LiteLLMModel[];
}

/**
 * LM Studio model info from API
 */
export interface LMStudioModel {
  id: string;                     // e.g., "qwen2.5-7b-instruct"
  name: string;                   // Display name
  toolSupport: 'supported' | 'unsupported' | 'unknown'; // Whether model supports function calling
}

/**
 * LM Studio configuration
 */
export interface LMStudioConfig {
  baseUrl: string;      // e.g., "http://localhost:1234"
  enabled: boolean;
  lastValidated?: number;
  models?: LMStudioModel[];
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
    requiresApiKey: false, // Uses AWS credentials
    models: [], // Now fetched dynamically from AWS API
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
  {
    id: 'nebius',
    name: 'Nebius AI',
    requiresApiKey: true,
    apiKeyEnvVar: 'NEBIUS_API_KEY',
    baseUrl: 'https://api.studio.nebius.ai',
    models: [
      {
        id: 'meta-llama/Llama-3.3-70B-Instruct',
        displayName: 'Llama 3.3 70B Instruct',
        provider: 'nebius',
        fullId: 'nebius/meta-llama/Llama-3.3-70B-Instruct',
        contextWindow: 128000,
        supportsVision: false,
      },
      {
        id: 'meta-llama/Llama-3.1-405B-Instruct',
        displayName: 'Llama 3.1 405B Instruct',
        provider: 'nebius',
        fullId: 'nebius/meta-llama/Llama-3.1-405B-Instruct',
        contextWindow: 128000,
        supportsVision: false,
      },
      {
        id: 'deepseek-ai/DeepSeek-V3',
        displayName: 'DeepSeek V3',
        provider: 'nebius',
        fullId: 'nebius/deepseek-ai/DeepSeek-V3',
        contextWindow: 64000,
        supportsVision: false,
      },
    ],
  },
  {
    id: 'together',
    name: 'Together AI',
    requiresApiKey: true,
    apiKeyEnvVar: 'TOGETHER_API_KEY',
    baseUrl: 'https://api.together.xyz',
    models: [
      {
        id: 'meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo',
        displayName: 'Llama 3.1 405B Instruct Turbo',
        provider: 'together',
        fullId: 'together/meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo',
        contextWindow: 130000,
        supportsVision: false,
      },
      {
        id: 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',
        displayName: 'Llama 3.1 70B Instruct Turbo',
        provider: 'together',
        fullId: 'together/meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',
        contextWindow: 131000,
        supportsVision: false,
      },
      {
        id: 'Qwen/Qwen2.5-72B-Instruct-Turbo',
        displayName: 'Qwen 2.5 72B Instruct Turbo',
        provider: 'together',
        fullId: 'together/Qwen/Qwen2.5-72B-Instruct-Turbo',
        contextWindow: 32768,
        supportsVision: false,
      },
      {
        id: 'mistralai/Mixtral-8x22B-Instruct-v0.1',
        displayName: 'Mixtral 8x22B Instruct',
        provider: 'together',
        fullId: 'together/mistralai/Mixtral-8x22B-Instruct-v0.1',
        contextWindow: 65536,
        supportsVision: false,
      },
    ],
  },
  {
    id: 'fireworks',
    name: 'Fireworks AI',
    requiresApiKey: true,
    apiKeyEnvVar: 'FIREWORKS_API_KEY',
    baseUrl: 'https://api.fireworks.ai',
    models: [
      {
        id: 'accounts/fireworks/models/llama-v3p3-70b-instruct',
        displayName: 'Llama 3.3 70B Instruct',
        provider: 'fireworks',
        fullId: 'fireworks/accounts/fireworks/models/llama-v3p3-70b-instruct',
        contextWindow: 128000,
        supportsVision: false,
      },
      {
        id: 'accounts/fireworks/models/llama-v3p1-405b-instruct',
        displayName: 'Llama 3.1 405B Instruct',
        provider: 'fireworks',
        fullId: 'fireworks/accounts/fireworks/models/llama-v3p1-405b-instruct',
        contextWindow: 131072,
        supportsVision: false,
      },
      {
        id: 'accounts/fireworks/models/qwen2p5-72b-instruct',
        displayName: 'Qwen 2.5 72B Instruct',
        provider: 'fireworks',
        fullId: 'fireworks/accounts/fireworks/models/qwen2p5-72b-instruct',
        contextWindow: 32768,
        supportsVision: false,
      },
      {
        id: 'accounts/fireworks/models/firefunction-v2',
        displayName: 'FireFunction V2',
        provider: 'fireworks',
        fullId: 'fireworks/accounts/fireworks/models/firefunction-v2',
        contextWindow: 8192,
        supportsVision: false,
      },
    ],
  },
  {
    id: 'groq',
    name: 'Groq',
    requiresApiKey: true,
    apiKeyEnvVar: 'GROQ_API_KEY',
    baseUrl: 'https://api.groq.com',
    models: [
      {
        id: 'llama-3.3-70b-versatile',
        displayName: 'Llama 3.3 70B Versatile',
        provider: 'groq',
        fullId: 'groq/llama-3.3-70b-versatile',
        contextWindow: 128000,
        supportsVision: false,
      },
      {
        id: 'llama-3.1-70b-versatile',
        displayName: 'Llama 3.1 70B Versatile',
        provider: 'groq',
        fullId: 'groq/llama-3.1-70b-versatile',
        contextWindow: 131072,
        supportsVision: false,
      },
      {
        id: 'mixtral-8x7b-32768',
        displayName: 'Mixtral 8x7B',
        provider: 'groq',
        fullId: 'groq/mixtral-8x7b-32768',
        contextWindow: 32768,
        supportsVision: false,
      },
      {
        id: 'gemma2-9b-it',
        displayName: 'Gemma 2 9B',
        provider: 'groq',
        fullId: 'groq/gemma2-9b-it',
        contextWindow: 8192,
        supportsVision: false,
      },
    ],
  },
  {
    id: 'kimi',
    name: 'Kimi (Moonshot AI)',
    requiresApiKey: true,
    apiKeyEnvVar: 'MOONSHOT_API_KEY',
    baseUrl: 'https://api.moonshot.cn',
    models: [
      {
        id: 'moonshot-v1-128k',
        displayName: 'Moonshot V1 128K',
        provider: 'kimi',
        fullId: 'kimi/moonshot-v1-128k',
        contextWindow: 128000,
        supportsVision: false,
      },
      {
        id: 'moonshot-v1-32k',
        displayName: 'Moonshot V1 32K',
        provider: 'kimi',
        fullId: 'kimi/moonshot-v1-32k',
        contextWindow: 32000,
        supportsVision: false,
      },
      {
        id: 'moonshot-v1-8k',
        displayName: 'Moonshot V1 8K',
        provider: 'kimi',
        fullId: 'kimi/moonshot-v1-8k',
        contextWindow: 8000,
        supportsVision: false,
      },
    ],
  },
];

export const DEFAULT_MODEL: SelectedModel = {
  provider: 'anthropic',
  model: 'anthropic/claude-opus-4-5',
};
