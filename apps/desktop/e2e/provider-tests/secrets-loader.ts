/**
 * Secrets loader for provider E2E tests.
 * Supports environment variables (CI) and local secrets.json file.
 */

import { existsSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { SecretsConfig, ProviderSecrets } from './types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Default task prompt for E2E tests */
const DEFAULT_TASK_PROMPT = 'Say "Hello from E2E test" and nothing else.';

/** Cached secrets config */
let cachedSecrets: SecretsConfig | null = null;

/**
 * Build secrets config from individual environment variables.
 * Used when E2E_SECRETS_JSON is not set but individual keys are.
 */
function buildSecretsFromEnv(): SecretsConfig {
  const providers: SecretsConfig['providers'] = {};

  // Standard API key providers
  const apiKeyProviders = [
    ['anthropic', 'E2E_ANTHROPIC_API_KEY'],
    ['openai', 'E2E_OPENAI_API_KEY'],
    ['google', 'E2E_GOOGLE_API_KEY'],
    ['xai', 'E2E_XAI_API_KEY'],
    ['deepseek', 'E2E_DEEPSEEK_API_KEY'],
    ['moonshot', 'E2E_MOONSHOT_API_KEY'],
    ['minimax', 'E2E_MINIMAX_API_KEY'],
    ['openrouter', 'E2E_OPENROUTER_API_KEY'],
  ] as const;

  for (const [configKey, envVar] of apiKeyProviders) {
    const apiKey = process.env[envVar];
    if (apiKey) {
      providers[configKey] = { apiKey };
    }
  }

  // Z.AI with region
  const zaiKey = process.env.E2E_ZAI_API_KEY;
  if (zaiKey) {
    providers['zai'] = {
      apiKey: zaiKey,
      region: (process.env.E2E_ZAI_REGION as 'china' | 'international') || 'international',
    };
  }

  // Bedrock API Key
  const bedrockApiKey = process.env.E2E_BEDROCK_API_KEY;
  if (bedrockApiKey) {
    providers['bedrock-api-key'] = {
      apiKey: bedrockApiKey,
      region: process.env.E2E_BEDROCK_REGION,
    };
  }

  // Bedrock Access Keys
  const bedrockAccessKeyId = process.env.E2E_BEDROCK_ACCESS_KEY_ID;
  const bedrockSecretKey = process.env.E2E_BEDROCK_SECRET_ACCESS_KEY;
  if (bedrockAccessKeyId && bedrockSecretKey) {
    providers['bedrock-access-keys'] = {
      accessKeyId: bedrockAccessKeyId,
      secretAccessKey: bedrockSecretKey,
      sessionToken: process.env.E2E_BEDROCK_SESSION_TOKEN,
      region: process.env.E2E_BEDROCK_REGION,
    };
  }

  // Bedrock Profile
  const bedrockProfile = process.env.E2E_BEDROCK_PROFILE_NAME;
  if (bedrockProfile) {
    providers['bedrock-profile'] = {
      profileName: bedrockProfile,
      region: process.env.E2E_BEDROCK_REGION,
    };
  }

  // Azure Foundry API Key
  const azureEndpoint = process.env.E2E_AZURE_ENDPOINT;
  const azureDeployment = process.env.E2E_AZURE_DEPLOYMENT;
  const azureApiKey = process.env.E2E_AZURE_API_KEY;
  if (azureEndpoint && azureDeployment && azureApiKey) {
    providers['azure-foundry-api-key'] = {
      endpoint: azureEndpoint,
      deploymentName: azureDeployment,
      apiKey: azureApiKey,
    };
  }

  // Azure Foundry Entra ID
  if (azureEndpoint && azureDeployment && !azureApiKey) {
    providers['azure-foundry-entra-id'] = {
      endpoint: azureEndpoint,
      deploymentName: azureDeployment,
    };
  }

  // Ollama
  const ollamaUrl = process.env.E2E_OLLAMA_SERVER_URL;
  if (ollamaUrl) {
    providers['ollama'] = { serverUrl: ollamaUrl };
  }

  // LM Studio
  const lmstudioUrl = process.env.E2E_LMSTUDIO_SERVER_URL;
  if (lmstudioUrl) {
    providers['lmstudio'] = { serverUrl: lmstudioUrl };
  }

  // LiteLLM
  const litellmUrl = process.env.E2E_LITELLM_SERVER_URL;
  if (litellmUrl) {
    providers['litellm'] = {
      serverUrl: litellmUrl,
      apiKey: process.env.E2E_LITELLM_API_KEY,
    };
  }

  return {
    providers,
    taskPrompt: process.env.E2E_TASK_PROMPT || DEFAULT_TASK_PROMPT,
  };
}

/**
 * Load secrets from secrets.json file.
 */
function loadSecretsFromFile(): SecretsConfig {
  const secretsPath = resolve(__dirname, 'secrets.json');

  if (!existsSync(secretsPath)) {
    console.warn(`[secrets-loader] No secrets.json found at ${secretsPath}`);
    return { providers: {} };
  }

  try {
    const content = readFileSync(secretsPath, 'utf-8');
    const parsed = JSON.parse(content) as SecretsConfig;
    return {
      providers: parsed.providers || {},
      taskPrompt: parsed.taskPrompt || DEFAULT_TASK_PROMPT,
    };
  } catch (err) {
    console.error(`[secrets-loader] Failed to parse secrets.json:`, err);
    return { providers: {} };
  }
}

/**
 * Load secrets from:
 * 1. Environment variables (for CI) - E2E_SECRETS_JSON or individual E2E_<PROVIDER>_API_KEY
 * 2. secrets.json file (for local dev)
 */
export function loadSecrets(): SecretsConfig {
  if (cachedSecrets) {
    return cachedSecrets;
  }

  // CI mode: check for full JSON env var first
  if (process.env.E2E_SECRETS_JSON) {
    try {
      cachedSecrets = JSON.parse(process.env.E2E_SECRETS_JSON) as SecretsConfig;
      console.log('[secrets-loader] Loaded secrets from E2E_SECRETS_JSON env var');
      return cachedSecrets;
    } catch (err) {
      console.error('[secrets-loader] Failed to parse E2E_SECRETS_JSON:', err);
    }
  }

  // CI mode: build from individual env vars
  const hasAnyEnvVar = [
    'E2E_ANTHROPIC_API_KEY',
    'E2E_OPENAI_API_KEY',
    'E2E_GOOGLE_API_KEY',
    'E2E_XAI_API_KEY',
    'E2E_DEEPSEEK_API_KEY',
    'E2E_OLLAMA_SERVER_URL',
  ].some(key => process.env[key]);

  if (hasAnyEnvVar) {
    cachedSecrets = buildSecretsFromEnv();
    console.log('[secrets-loader] Built secrets from individual env vars');
    return cachedSecrets;
  }

  // Local mode: read file
  cachedSecrets = loadSecretsFromFile();
  console.log('[secrets-loader] Loaded secrets from secrets.json file');
  return cachedSecrets;
}

/**
 * Get secrets for a specific provider config key.
 */
export function getProviderSecrets(configKey: string): ProviderSecrets | null {
  const secrets = loadSecrets();
  return secrets.providers[configKey] || null;
}

/**
 * Get list of enabled providers (those with secrets configured).
 */
export function getEnabledProviders(): string[] {
  const secrets = loadSecrets();
  return Object.keys(secrets.providers).filter(key => {
    const providerSecrets = secrets.providers[key];
    if (!providerSecrets) return false;

    // Check that required fields are present based on secret type
    if ('apiKey' in providerSecrets && providerSecrets.apiKey) return true;
    if ('accessKeyId' in providerSecrets && providerSecrets.accessKeyId) return true;
    if ('profileName' in providerSecrets && providerSecrets.profileName) return true;
    if ('serverUrl' in providerSecrets && providerSecrets.serverUrl) return true;
    if ('endpoint' in providerSecrets && providerSecrets.endpoint) return true;

    return false;
  });
}

/**
 * Get the task prompt to use for tests.
 */
export function getTaskPrompt(): string {
  const secrets = loadSecrets();
  return secrets.taskPrompt || DEFAULT_TASK_PROMPT;
}

/**
 * Clear cached secrets (for testing).
 */
export function clearSecretsCache(): void {
  cachedSecrets = null;
}

