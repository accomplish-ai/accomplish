export type ProviderId =
  | 'anthropic'
  | 'openai'
  | 'google'
  | 'xai'
  | 'deepseek'
  | 'moonshot'
  | 'zai'
  | 'bedrock'
  | 'azure-foundry'
  | 'ollama'
  | 'openrouter'
  | 'litellm'
  | 'minimax'
  | 'lmstudio'
  | 'vertex'
  | 'huggingface-local'
  | 'nebius'
  | 'together'
  | 'fireworks'
  | 'groq'
  | 'venice'
  | 'nim'
  | 'custom'
  | 'copilot';

export type ProviderCategory = 'classic' | 'aws' | 'gcp' | 'azure' | 'local' | 'proxy' | 'hybrid';

export interface ProviderMeta {
  id: ProviderId;
  name: string;
  category: ProviderCategory;
  label: string;
  logoKey: string;
  helpUrl?: string;
}

export const PROVIDER_META: Record<ProviderId, ProviderMeta> = {
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic',
    category: 'classic',
    label: 'Service',
    logoKey: 'claude',
    helpUrl: 'https://console.anthropic.com/settings/keys',
  },
  openai: {
    id: 'openai',
    name: 'OpenAI',
    category: 'classic',
    label: 'Service',
    logoKey: 'open-ai',
    helpUrl: 'https://platform.openai.com/api-keys',
  },
  google: {
    id: 'google',
    name: 'Gemini',
    category: 'classic',
    label: 'Service',
    logoKey: 'google-gen-ai',
    helpUrl: 'https://aistudio.google.com/app/apikey',
  },
  xai: {
    id: 'xai',
    name: 'XAI',
    category: 'classic',
    label: 'Service',
    logoKey: 'Xai',
    helpUrl: 'https://x.ai/api',
  },
  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek',
    category: 'classic',
    label: 'Service',
    logoKey: 'Deepseek',
    helpUrl: 'https://platform.deepseek.com/api_keys',
  },
  moonshot: {
    id: 'moonshot',
    name: 'Moonshot AI',
    category: 'classic',
    label: 'Service',
    logoKey: 'moonshot',
    helpUrl: 'https://platform.moonshot.ai/docs/guide/start-using-kimi-api',
  },
  zai: { id: 'zai', name: 'Z-AI', category: 'classic', label: 'Service', logoKey: 'z-ai' },
  bedrock: {
    id: 'bedrock',
    name: 'AWS Bedrock',
    category: 'aws',
    label: 'Service',
    logoKey: 'aws-bedrock',
  },
  vertex: { id: 'vertex', name: 'Vertex AI', category: 'gcp', label: 'Service', logoKey: 'vertex' },
  'azure-foundry': {
    id: 'azure-foundry',
    name: 'Azure AI Foundry',
    category: 'azure',
    label: 'Service',
    logoKey: 'azure',
    helpUrl: 'https://ai.azure.com',
  },
  ollama: {
    id: 'ollama',
    name: 'Ollama',
    category: 'local',
    label: 'Local Models',
    logoKey: 'olama',
  },
  openrouter: {
    id: 'openrouter',
    name: 'OpenRouter',
    category: 'proxy',
    label: 'Service',
    logoKey: 'open-router',
    helpUrl: 'https://openrouter.ai/keys',
  },
  litellm: {
    id: 'litellm',
    name: 'LiteLLM',
    category: 'hybrid',
    label: 'Service',
    logoKey: 'liteLLM',
  },
  minimax: {
    id: 'minimax',
    name: 'MiniMax',
    category: 'classic',
    label: 'Service',
    logoKey: 'minimax',
    helpUrl: 'https://platform.minimax.io/user-center/basic-information/interface-key',
  },
  lmstudio: {
    id: 'lmstudio',
    name: 'LM Studio',
    category: 'local',
    label: 'Local Models',
    logoKey: 'lmstudio',
    helpUrl: 'https://lmstudio.ai/',
  },
  'huggingface-local': {
    id: 'huggingface-local',
    name: 'HuggingFace Local',
    category: 'local',
    label: 'Local Models',
    logoKey: 'huggingface',
  },
  nebius: {
    id: 'nebius',
    name: 'Nebius AI',
    category: 'classic',
    label: 'Llama & DeepSeek models',
    logoKey: 'nebius',
    helpUrl: 'https://studio.nebius.ai/',
  },
  together: {
    id: 'together',
    name: 'Together AI',
    category: 'classic',
    label: 'Llama & Mixtral models',
    logoKey: 'together',
    helpUrl: 'https://api.together.xyz/settings/api-keys',
  },
  fireworks: {
    id: 'fireworks',
    name: 'Fireworks AI',
    category: 'classic',
    label: 'Fast inference models',
    logoKey: 'fireworks',
    helpUrl: 'https://fireworks.ai/account/api-keys',
  },
  groq: {
    id: 'groq',
    name: 'Groq',
    category: 'classic',
    label: 'Ultra-fast Llama models',
    logoKey: 'groq',
    helpUrl: 'https://console.groq.com/keys',
  },
  venice: {
    id: 'venice',
    name: 'Venice AI',
    category: 'classic',
    label: 'Service',
    logoKey: 'venice',
    helpUrl: 'https://venice.ai/settings/api',
  },
  nim: {
    id: 'nim',
    name: 'NVIDIA NIM',
    category: 'classic',
    label: 'NVIDIA-hosted models',
    logoKey: 'nim',
    helpUrl: 'https://org.ngc.nvidia.com/setup/api-key',
  },
  custom: {
    id: 'custom',
    name: 'Custom Endpoint',
    category: 'hybrid',
    label: 'Custom',
    logoKey: 'custom',
  },
  copilot: {
    id: 'copilot',
    name: 'GitHub Copilot',
    category: 'classic',
    label: 'Service',
    logoKey: 'github-copilot',
    helpUrl: 'https://github.com/settings/copilot',
  },
};

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface ApiKeyCredentials {
  type: 'api_key';
  keyPrefix: string;
}

export interface BedrockProviderCredentials {
  type: 'bedrock';
  authMethod: 'accessKey' | 'profile' | 'apiKey';
  region: string;
  accessKeyIdPrefix?: string;
  profileName?: string;
  apiKeyPrefix?: string;
}

export interface OllamaCredentials {
  type: 'ollama';
  serverUrl: string;
}

export interface OpenRouterCredentials {
  type: 'openrouter';
  keyPrefix: string;
}

export interface LiteLLMCredentials {
  type: 'litellm';
  serverUrl: string;
  hasApiKey: boolean;
  keyPrefix?: string;
}

export type ZaiRegion = 'china' | 'international';

export interface ZaiCredentials {
  type: 'zai';
  keyPrefix: string;
  region: ZaiRegion;
}

export interface LMStudioCredentials {
  type: 'lmstudio';
  serverUrl: string;
}

export interface HuggingFaceLocalCredentials {
  type: 'huggingface-local';
  modelId: string;
}

export interface CustomCredentials {
  type: 'custom';
  baseUrl: string;
  modelName: string;
  hasApiKey: boolean;
  keyPrefix?: string;
}

export interface NimCredentials {
  type: 'nim';
  serverUrl: string;
  keyPrefix: string;
}

export interface AzureFoundryCredentials {
  type: 'azure-foundry';
  authMethod: 'api-key' | 'entra-id';
  endpoint: string;
  deploymentName: string;
  keyPrefix?: string;
}

export interface VertexProviderCredentials {
  type: 'vertex';
  authMethod: 'serviceAccount' | 'adc';
  projectId: string;
  location: string;
  serviceAccountEmail?: string;
}

export interface OAuthCredentials {
  type: 'oauth';
  oauthProvider: 'chatgpt';
}

export interface CopilotOAuthCredentials {
  type: 'copilot-oauth';
}

export type ProviderCredentials =
  | ApiKeyCredentials
  | BedrockProviderCredentials
  | VertexProviderCredentials
  | OllamaCredentials
  | OpenRouterCredentials
  | LiteLLMCredentials
  | ZaiCredentials
  | AzureFoundryCredentials
  | LMStudioCredentials
  | OAuthCredentials
  | HuggingFaceLocalCredentials
  | CopilotOAuthCredentials
  | CustomCredentials
  | NimCredentials;

export type ToolSupportStatus = 'supported' | 'unsupported' | 'unknown';

export interface ConnectedProvider {
  providerId: ProviderId;
  connectionStatus: ConnectionStatus;
  selectedModelId: string | null;
  credentials: ProviderCredentials;
  lastConnectedAt: string;
  availableModels?: Array<{ id: string; name: string; toolSupport?: ToolSupportStatus }>;
  /** Custom base URL override set by the user (for providers with editableBaseUrl: true) */
  customBaseUrl?: string;
}

export interface ProviderSettings {
  activeProviderId: ProviderId | null;
  connectedProviders: Partial<Record<ProviderId, ConnectedProvider>>;
  debugMode: boolean;
}

export function isProviderReady(provider: ConnectedProvider | undefined): boolean {
  if (!provider) return false;
  return provider.connectionStatus === 'connected' && provider.selectedModelId !== null;
}

export function hasAnyReadyProvider(settings: ProviderSettings | null | undefined): boolean {
  if (!settings?.connectedProviders) return false;
  return Object.values(settings.connectedProviders).some(isProviderReady);
}

export function getActiveProvider(
  settings: ProviderSettings | null | undefined,
): ConnectedProvider | null {
  if (!settings?.activeProviderId) return null;
  return settings.connectedProviders?.[settings.activeProviderId] ?? null;
}

/**
 * Default model for each provider.
 * For providers with `defaultModelId` in DEFAULT_PROVIDERS, that value is canonical.
 * This map covers providers that don't have modelsEndpoint (bedrock) or as fallback.
 */
export const DEFAULT_MODELS: Partial<Record<ProviderId, string>> = {
  anthropic: 'anthropic/claude-opus-4-5',
  openai: 'openai/gpt-5.2',
  google: 'google/gemini-3-pro-preview',
  xai: 'xai/grok-4',
  deepseek: 'deepseek/deepseek-chat',
  moonshot: 'moonshot/kimi-k2.5',
  zai: 'zai/glm-4.7-flashx',
  minimax: 'minimax/MiniMax-M2',
  bedrock: 'amazon-bedrock/anthropic.claude-opus-4-5-20251101-v1:0',
  nebius: 'nebius/meta-llama/Meta-Llama-3.1-70B-Instruct',
  together: 'together/meta-llama/Llama-3-70b-chat-hf',
  fireworks: 'fireworks/accounts/fireworks/models/llama-v3-70b-instruct',
  groq: 'groq/llama3-70b-8192',
  venice: 'venice/llama-3.3-70b',
  nim: 'nim/meta/llama-3.1-70b-instruct',
  copilot: 'copilot/gpt-4o',
};

export function getDefaultModelForProvider(providerId: ProviderId): string | null {
  return DEFAULT_MODELS[providerId] ?? null;
}

/**
 * Maps internal ProviderId to OpenCode CLI provider names.
 * Used when generating OpenCode configuration.
 */
export const PROVIDER_ID_TO_OPENCODE: Record<ProviderId, string> = {
  anthropic: 'anthropic',
  openai: 'openai',
  google: 'google',
  xai: 'xai',
  deepseek: 'deepseek',
  moonshot: 'moonshot',
  zai: 'zai-coding-plan',
  bedrock: 'amazon-bedrock',
  'azure-foundry': 'azure-foundry',
  ollama: 'ollama',
  openrouter: 'openrouter',
  litellm: 'litellm',
  minimax: 'minimax',
  lmstudio: 'lmstudio',
  vertex: 'vertex',
  // HuggingFace Local exposes an OpenAI-compatible API; opencode connects via OPENAI_API_BASE env var
  'huggingface-local': 'openai',
  nebius: 'nebius',
  together: 'together',
  fireworks: 'fireworks',
  groq: 'groq',
  venice: 'venice',
  nim: 'nim',
  custom: 'custom',
  copilot: 'github-copilot',
};
