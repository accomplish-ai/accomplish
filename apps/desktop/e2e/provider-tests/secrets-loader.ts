/**
 * Three-tier secrets loading for provider E2E tests:
 * 1. E2E_SECRETS_JSON env var (full JSON blob)
 * 2. Individual env vars (e.g., E2E_OPENAI_API_KEY)
 * 3. secrets.json file in this directory
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import type { SecretsConfig, ProviderSecrets } from './types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let _cachedSecrets: SecretsConfig | null = null;

/**
 * Loads secrets from the three-tier hierarchy.
 */
function loadSecrets(): SecretsConfig {
  if (_cachedSecrets) return _cachedSecrets;

  // Tier 1: Full JSON blob from env var
  const jsonEnv = process.env.E2E_SECRETS_JSON;
  if (jsonEnv) {
    try {
      _cachedSecrets = JSON.parse(jsonEnv) as SecretsConfig;
      console.log('[Secrets] Loaded from E2E_SECRETS_JSON env var');
      return _cachedSecrets;
    } catch (e) {
      console.warn('[Secrets] Failed to parse E2E_SECRETS_JSON:', e);
    }
  }

  // Tier 2: Individual env vars
  const envSecrets = loadFromEnvVars();
  if (Object.keys(envSecrets.providers).length > 0) {
    _cachedSecrets = envSecrets;
    console.log('[Secrets] Loaded from individual env vars:', Object.keys(envSecrets.providers));
    return _cachedSecrets;
  }

  // Tier 3: secrets.json file
  const secretsPath = path.join(__dirname, 'secrets.json');
  if (fs.existsSync(secretsPath)) {
    try {
      const content = fs.readFileSync(secretsPath, 'utf-8');
      _cachedSecrets = JSON.parse(content) as SecretsConfig;
      console.log('[Secrets] Loaded from secrets.json');
      return _cachedSecrets;
    } catch (e) {
      console.warn('[Secrets] Failed to parse secrets.json:', e);
    }
  }

  // No secrets found
  _cachedSecrets = { providers: {} };
  return _cachedSecrets;
}

/**
 * Builds a SecretsConfig from individual environment variables.
 *
 * Environment variable naming convention:
 *   E2E_{PROVIDER}_{FIELD}
 *
 * Examples:
 *   E2E_OPENAI_API_KEY
 *   E2E_GOOGLE_API_KEY
 *   E2E_BEDROCK_API_KEY
 *   E2E_BEDROCK_REGION
 *   E2E_OLLAMA_SERVER_URL
 *   E2E_OLLAMA_MODEL_ID
 *   E2E_TASK_PROMPT
 */
function loadFromEnvVars(): SecretsConfig {
  const providers: Record<string, ProviderSecrets> = {};

  // Simple API key providers
  const apiKeyProviders = [
    'openai', 'google', 'anthropic', 'xai', 'deepseek',
    'moonshot', 'openrouter', 'minimax',
  ];

  for (const provider of apiKeyProviders) {
    const envKey = `E2E_${provider.toUpperCase()}_API_KEY`;
    const apiKey = process.env[envKey];
    if (apiKey) {
      providers[provider] = { apiKey };
    }
  }

  // Bedrock API Key
  if (process.env.E2E_BEDROCK_API_KEY) {
    providers['bedrock-api-key'] = {
      apiKey: process.env.E2E_BEDROCK_API_KEY,
      region: process.env.E2E_BEDROCK_REGION || 'us-east-1',
    };
  }

  // Bedrock Access Key
  if (process.env.E2E_BEDROCK_ACCESS_KEY_ID && process.env.E2E_BEDROCK_SECRET_ACCESS_KEY) {
    providers['bedrock-access-key'] = {
      accessKeyId: process.env.E2E_BEDROCK_ACCESS_KEY_ID,
      secretAccessKey: process.env.E2E_BEDROCK_SECRET_ACCESS_KEY,
      sessionToken: process.env.E2E_BEDROCK_SESSION_TOKEN,
      region: process.env.E2E_BEDROCK_REGION || 'us-east-1',
    };
  }

  // Bedrock Profile
  if (process.env.E2E_BEDROCK_PROFILE_NAME) {
    providers['bedrock-profile'] = {
      profileName: process.env.E2E_BEDROCK_PROFILE_NAME,
      region: process.env.E2E_BEDROCK_REGION || 'us-east-1',
    };
  }

  // Azure Foundry API Key
  if (process.env.E2E_AZURE_API_KEY && process.env.E2E_AZURE_ENDPOINT) {
    providers['azure-api-key'] = {
      apiKey: process.env.E2E_AZURE_API_KEY,
      endpoint: process.env.E2E_AZURE_ENDPOINT,
      deploymentName: process.env.E2E_AZURE_DEPLOYMENT_NAME || 'default',
    };
  }

  // Ollama
  if (process.env.E2E_OLLAMA_SERVER_URL || process.env.E2E_OLLAMA_MODEL_ID) {
    providers['ollama'] = {
      serverUrl: process.env.E2E_OLLAMA_SERVER_URL || 'http://localhost:11434',
      modelId: process.env.E2E_OLLAMA_MODEL_ID,
    };
  }

  // LiteLLM
  if (process.env.E2E_LITELLM_SERVER_URL) {
    providers['litellm'] = {
      serverUrl: process.env.E2E_LITELLM_SERVER_URL,
      apiKey: process.env.E2E_LITELLM_API_KEY,
    };
  }

  // LM Studio
  if (process.env.E2E_LMSTUDIO_SERVER_URL) {
    providers['lmstudio'] = {
      serverUrl: process.env.E2E_LMSTUDIO_SERVER_URL,
    };
  }

  // Z.AI
  if (process.env.E2E_ZAI_API_KEY) {
    providers['zai'] = {
      apiKey: process.env.E2E_ZAI_API_KEY,
      region: (process.env.E2E_ZAI_REGION as 'china' | 'international') || 'international',
    };
  }

  // Custom provider
  if (process.env.E2E_CUSTOM_SERVER_URL) {
    providers['custom'] = {
      serverUrl: process.env.E2E_CUSTOM_SERVER_URL,
      apiKey: process.env.E2E_CUSTOM_API_KEY,
    };
  }

  return {
    providers,
    taskPrompt: process.env.E2E_TASK_PROMPT,
  };
}

/**
 * Get secrets for a specific provider config key.
 */
export function getProviderSecrets(configKey: string): ProviderSecrets | undefined {
  const secrets = loadSecrets();
  return secrets.providers[configKey];
}

/**
 * Get a list of provider config keys that have secrets available.
 */
export function getEnabledProviders(): string[] {
  const secrets = loadSecrets();
  return Object.keys(secrets.providers);
}

/**
 * Get the task prompt to use for tests.
 * Falls back to a simple calculation prompt.
 */
export function getTaskPrompt(): string {
  const secrets = loadSecrets();
  return secrets.taskPrompt || 'What is 2 + 2? Reply with just the number.';
}

/**
 * Clear the cached secrets (useful for testing).
 */
export function clearSecretsCache(): void {
  _cachedSecrets = null;
}
