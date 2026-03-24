/**
 * Type definitions for the provider E2E test framework.
 *
 * These tests run real API calls against actual provider endpoints.
 * Secrets are loaded from environment variables or a local secrets.json file.
 */

import type { ProviderId } from '@accomplish_ai/agent-core/common';

// ===== Auth Method =====

export type AuthMethod =
  | 'api-key'
  | 'bedrock-api-key'
  | 'bedrock-access-key'
  | 'bedrock-profile'
  | 'azure-api-key'
  | 'azure-entra-id'
  | 'server-url'
  | 'server-url-with-key'
  | 'ollama'
  | 'zai';

// ===== Provider Test Config =====

export interface ProviderTestConfig {
  /** Internal provider ID (e.g., 'openai', 'google') */
  providerId: ProviderId;
  /** Human-readable name for test output */
  displayName: string;
  /** Optional: model ID to use for testing */
  modelId?: string;
  /** How authentication works for this provider */
  authMethod: AuthMethod;
  /** Optional: timeout override in ms */
  timeout?: number;
}

// ===== Secret Types =====

export interface ApiKeySecrets {
  apiKey: string;
}

export interface BedrockApiKeySecrets {
  apiKey: string;
  region?: string;
}

export interface BedrockAccessKeySecrets {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  region?: string;
}

export interface BedrockProfileSecrets {
  profileName: string;
  region?: string;
}

export interface AzureApiKeySecrets {
  apiKey: string;
  endpoint: string;
  deploymentName: string;
}

export interface AzureEntraIdSecrets {
  endpoint: string;
  deploymentName: string;
}

export interface ServerUrlSecrets {
  serverUrl: string;
}

export interface OllamaSecrets {
  serverUrl?: string;
  modelId?: string;
}

export interface ServerUrlWithKeySecrets {
  serverUrl: string;
  apiKey?: string;
}

export interface ZaiSecrets {
  apiKey: string;
  region?: 'china' | 'international';
}

/**
 * Union of all provider secret shapes.
 *
 * NOTE: This union is NOT discriminated. Members share structural overlap
 * (e.g., ApiKeySecrets and BedrockApiKeySecrets both have `apiKey`).
 * Use `ProviderTestConfig.authMethod` as the external discriminant when
 * narrowing to a specific variant.
 */
export type ProviderSecrets =
  | ApiKeySecrets
  | BedrockApiKeySecrets
  | BedrockAccessKeySecrets
  | BedrockProfileSecrets
  | AzureApiKeySecrets
  | AzureEntraIdSecrets
  | ServerUrlSecrets
  | OllamaSecrets
  | ServerUrlWithKeySecrets
  | ZaiSecrets;

// ===== Secrets Config =====

export interface SecretsConfig {
  /** Provider-specific secrets keyed by config key (e.g., 'openai', 'bedrock-api-key') */
  providers: Record<string, ProviderSecrets>;
}

// ===== Resolved Config =====

export interface ResolvedProviderTestConfig extends ProviderTestConfig {
  /** Resolved secrets for this provider */
  secrets?: ProviderSecrets;
}
