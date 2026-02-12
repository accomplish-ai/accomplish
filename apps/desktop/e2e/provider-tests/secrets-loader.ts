import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import type { SecretsConfig, ProviderSecrets } from './types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let _cachedSecrets: SecretsConfig | null = null;

/**
 * Two-tier secrets loading for provider E2E tests:
 * 1. Individual env vars (e.g., E2E_OPENAI_API_KEY)
 * 2. secrets.json file in this directory
 */
function loadSecrets(): SecretsConfig {
  if (_cachedSecrets) return _cachedSecrets;

  // Tier 1: Individual env vars
  const envSecrets = loadFromEnvVars();
  if (Object.keys(envSecrets.providers).length > 0) {
    _cachedSecrets = envSecrets;
    console.log('[Secrets] Loaded from individual env vars:', Object.keys(envSecrets.providers));
    return _cachedSecrets;
  }

  // Tier 2: secrets.json file
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
 */
function loadFromEnvVars(): SecretsConfig {
  const providers: Record<string, ProviderSecrets> = {};

  // Simple API key providers
  const apiKeyProviders = ['openai', 'google'];

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

  // Ollama
  if (process.env.E2E_OLLAMA_SERVER_URL || process.env.E2E_OLLAMA_MODEL_ID) {
    providers['ollama'] = {
      serverUrl: process.env.E2E_OLLAMA_SERVER_URL || 'http://localhost:11434',
      modelId: process.env.E2E_OLLAMA_MODEL_ID,
    };
  }

  return { providers };
}

/**
 * Get secrets for a specific provider config key.
 */
export function getProviderSecrets(configKey: string): ProviderSecrets | undefined {
  const secrets = loadSecrets();
  return secrets.providers[configKey];
}
