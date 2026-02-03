/**
 * Type definitions for multi-provider E2E test suite.
 * Strongly typed configs, secrets, and test utilities.
 */

import type { ProviderType } from '@accomplish/shared';
import type { Page } from '@playwright/test';

/** Supported authentication methods */
export type AuthMethod =
  | 'api-key'
  | 'bedrock-api-key'
  | 'bedrock-access-keys'
  | 'bedrock-profile'
  | 'azure-api-key'
  | 'azure-entra-id'
  | 'server-url'
  | 'server-url-with-optional-key';

/** Model selection strategy */
export type ModelSelectionStrategy = 'first' | 'default' | 'specific';

/** Provider test configuration */
export interface ProviderTestConfig {
  /** Unique config key (e.g., 'bedrock-api-key' for Bedrock with API key auth) */
  readonly configKey: string;
  /** Provider ID matching the app's ProviderType */
  readonly providerId: ProviderType;
  /** Display name for test reports */
  readonly displayName: string;
  /** Authentication method */
  readonly authMethod: AuthMethod;
  /** Whether provider requires "Show All" to be visible */
  readonly requiresShowAll: boolean;
  /** Model selection configuration */
  readonly modelSelection: {
    readonly strategy: ModelSelectionStrategy;
    readonly modelId?: string;
  };
  /** Connection timeout override (ms) */
  readonly connectionTimeout?: number;
  /** Server URL for local providers (Ollama, LM Studio, etc.) */
  readonly serverUrl?: string;
  /** Setup hook - run before connecting */
  readonly setup?: () => Promise<void>;
  /** Teardown hook - run after test */
  readonly teardown?: () => Promise<void>;
}

/** Base secrets for API key providers */
export interface ApiKeySecrets {
  readonly apiKey: string;
  /** Override model ID for testing (use a real model ID, not fictional ones from DEFAULT_PROVIDERS) */
  readonly modelId?: string;
}

/** Bedrock API key secrets */
export interface BedrockApiKeySecrets {
  readonly apiKey: string;
  readonly region?: string;
}

/** Bedrock access key secrets */
export interface BedrockAccessKeySecrets {
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly sessionToken?: string;
  readonly region?: string;
}

/** Bedrock profile secrets */
export interface BedrockProfileSecrets {
  readonly profileName: string;
  readonly region?: string;
}

/** Azure Foundry API key secrets */
export interface AzureApiKeySecrets {
  readonly endpoint: string;
  readonly deploymentName: string;
  readonly apiKey: string;
}

/** Azure Foundry Entra ID secrets */
export interface AzureEntraIdSecrets {
  readonly endpoint: string;
  readonly deploymentName: string;
}

/** Server URL secrets (Ollama, LM Studio) */
export interface ServerUrlSecrets {
  readonly serverUrl: string;
}

/** Ollama-specific secrets with optional model override */
export interface OllamaSecrets extends ServerUrlSecrets {
  readonly modelId?: string;
}

/** Server URL with optional key secrets (LiteLLM) */
export interface ServerUrlWithKeySecrets {
  readonly serverUrl: string;
  readonly apiKey?: string;
}

/** Z.AI secrets with region */
export interface ZaiSecrets {
  readonly apiKey: string;
  readonly region?: 'china' | 'international';
}

/** Union of all secret types */
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

/** Secrets file structure */
export interface SecretsConfig {
  readonly providers: Partial<Record<string, ProviderSecrets>>;
  readonly taskPrompt?: string;
}

/** Connection result */
export interface ConnectionResult {
  readonly success: boolean;
  readonly error?: string;
}

/** Test context passed to provider tests */
export interface ProviderTestContext {
  readonly page: Page;
  readonly config: ProviderTestConfig;
  readonly secrets: ProviderSecrets;
  readonly taskPrompt: string;
}

/** Complete provider test configuration with resolved secrets */
export interface ResolvedProviderTestConfig {
  /** Static provider configuration */
  readonly config: ProviderTestConfig;
  /** Provider secrets (API key, credentials, etc.) */
  readonly secrets: ProviderSecrets;
  /** Task prompt for the test */
  readonly taskPrompt: string;
  /** Resolved model ID (from secrets.modelId > config.modelSelection.modelId > provider default) */
  readonly modelId: string;
  /** Connection timeout in ms */
  readonly connectionTimeout: number;
}

/** IPC log entry */
export interface IpcLogEntry {
  readonly timestamp: number;
  readonly level: 'log' | 'warn' | 'error' | 'info' | 'debug';
  readonly message: string;
  readonly args?: unknown[];
}

/** IPC logger interface */
export interface IpcLogger {
  /** All captured log entries */
  readonly entries: IpcLogEntry[];
  /** Get logs as formatted string */
  toString(): string;
  /** Clear all entries */
  clear(): void;
  /** Attach logs to test info (for reporting) */
  attachToTest(testInfo: import('@playwright/test').TestInfo): Promise<void>;
}
