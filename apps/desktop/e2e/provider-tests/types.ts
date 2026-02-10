/**
 * Type definitions for the provider E2E test framework.
 *
 * These tests run real API calls against actual provider endpoints.
 * Secrets are loaded from environment variables or a local secrets.json file.
 */

import type { ProviderId } from '@accomplish_ai/agent-core/common';

// ===== Auth & Model Strategy =====

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

export type ModelSelectionStrategy =
  | 'default'   // Use the default model for the provider
  | 'first'     // Pick the first model from the list
  | 'specific'; // Use a specific model ID from config

// ===== Provider Test Config =====

export interface ProviderTestConfig {
  /** Internal provider ID (e.g., 'openai', 'google') */
  providerId: ProviderId;
  /** Human-readable name for test output */
  displayName: string;
  /** How authentication works for this provider */
  authMethod: AuthMethod;
  /** How to select a model for the test */
  modelSelection: ModelSelectionStrategy;
  /** Specific model ID when modelSelection is 'specific' */
  specificModelId?: string;
  /** Keys in the secrets config that this provider requires */
  requiredSecretKeys: string[];
  /** Optional: timeout override in ms */
  timeout?: number;
  /** Optional: extra setup steps description */
  setupNotes?: string;
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
  /** Optional: task prompt to use for real tests (default: simple calculation) */
  taskPrompt?: string;
}

// ===== Resolved Config =====

export interface ResolvedProviderTestConfig extends ProviderTestConfig {
  /** Resolved secrets for this provider */
  secrets: ProviderSecrets;
  /** Resolved model ID to use */
  modelId?: string;
}

// ===== Connection Result =====

export interface ConnectionResult {
  success: boolean;
  error?: string;
  connectionStatus?: string;
}

// ===== Test Context =====

export interface ProviderTestContext {
  /** The resolved test configuration */
  config: ResolvedProviderTestConfig;
  /** Task prompt to submit */
  taskPrompt: string;
}

// ===== IPC Logging =====

export interface IpcLogEntry {
  timestamp: number;
  channel: string;
  args: unknown[];
}

export interface IpcLogger {
  entries: IpcLogEntry[];
  start(): void;
  stop(): void;
  getEntries(channel?: string): IpcLogEntry[];
  clear(): void;
}
