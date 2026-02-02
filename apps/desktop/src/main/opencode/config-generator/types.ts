/**
 * Type definitions for OpenCode configuration
 *
 * @module config-generator/types
 */

// Re-export ProviderId from shared package
export type { ProviderId } from '@accomplish/shared';

/**
 * Agent configuration for OpenCode
 */
export interface AgentConfig {
  description?: string;
  prompt?: string;
  mode?: 'primary' | 'subagent' | 'all';
}

/**
 * MCP server configuration
 */
export interface McpServerConfig {
  type?: 'local' | 'remote';
  command?: string[];
  url?: string;
  enabled?: boolean;
  environment?: Record<string, string>;
  timeout?: number;
}

/**
 * Base provider model configuration
 */
export interface ProviderModelConfig {
  name: string;
  tools?: boolean;
  limit?: {
    context?: number;
    output?: number;
  };
  options?: Record<string, unknown>;
}

/**
 * Ollama provider configuration
 */
export interface OllamaProviderConfig {
  npm: string;
  name: string;
  options: {
    baseURL: string;
  };
  models: Record<string, ProviderModelConfig>;
}

/**
 * Bedrock provider configuration
 */
export interface BedrockProviderConfig {
  options: {
    region: string;
    profile?: string;
  };
}

/**
 * Azure Foundry provider configuration
 */
export interface AzureFoundryProviderConfig {
  npm: string;
  name: string;
  options: {
    resourceName?: string;
    baseURL?: string;
    apiKey?: string;
    headers?: Record<string, string>;
  };
  models: Record<string, ProviderModelConfig>;
}

/**
 * OpenRouter provider model configuration
 */
export interface OpenRouterProviderModelConfig {
  name: string;
  tools?: boolean;
}

/**
 * OpenRouter provider configuration
 */
export interface OpenRouterProviderConfig {
  npm: string;
  name: string;
  options: {
    baseURL: string;
  };
  models: Record<string, OpenRouterProviderModelConfig>;
}

/**
 * Moonshot provider model configuration
 */
export interface MoonshotProviderModelConfig {
  name: string;
  tools?: boolean;
}

/**
 * Moonshot provider configuration
 */
export interface MoonshotProviderConfig {
  npm: string;
  name: string;
  options: {
    baseURL: string;
    apiKey?: string;
  };
  models: Record<string, MoonshotProviderModelConfig>;
}

/**
 * LiteLLM provider model configuration
 */
export interface LiteLLMProviderModelConfig {
  name: string;
  tools?: boolean;
}

/**
 * LiteLLM provider configuration
 */
export interface LiteLLMProviderConfig {
  npm: string;
  name: string;
  options: {
    baseURL: string;
    apiKey?: string;
  };
  models: Record<string, LiteLLMProviderModelConfig>;
}

/**
 * Z.AI provider model configuration
 */
export interface ZaiProviderModelConfig {
  name: string;
  tools?: boolean;
}

/**
 * Z.AI provider configuration
 */
export interface ZaiProviderConfig {
  npm: string;
  name: string;
  options: {
    baseURL: string;
  };
  models: Record<string, ZaiProviderModelConfig>;
}

/**
 * LM Studio provider model configuration
 */
export interface LMStudioProviderModelConfig {
  name: string;
  tools?: boolean;
}

/**
 * LM Studio provider configuration
 */
export interface LMStudioProviderConfig {
  npm: string;
  name: string;
  options: {
    baseURL: string;
  };
  models: Record<string, LMStudioProviderModelConfig>;
}

/**
 * Union type for all provider configurations
 */
export type ProviderConfig =
  | OllamaProviderConfig
  | BedrockProviderConfig
  | AzureFoundryProviderConfig
  | OpenRouterProviderConfig
  | MoonshotProviderConfig
  | LiteLLMProviderConfig
  | ZaiProviderConfig
  | LMStudioProviderConfig;

/**
 * Complete OpenCode configuration
 */
export interface OpenCodeConfig {
  $schema?: string;
  model?: string;
  small_model?: string;
  default_agent?: string;
  enabled_providers?: string[];
  permission?: string | Record<string, string | Record<string, string>>;
  agent?: Record<string, AgentConfig>;
  mcp?: Record<string, McpServerConfig>;
  provider?: Record<string, ProviderConfig>;
  plugin?: string[];
}
