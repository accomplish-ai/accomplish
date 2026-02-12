import type { BedrockCredentials, VertexCredentials } from '../common/types/auth.js';

/**
 * API keys for various providers.
 * Keys are provider names (lowercase), values are the API key strings or null.
 */
export type ApiKeys = Record<string, string | null>;

/**
 * Configuration for building the OpenCode environment.
 */
export interface EnvironmentConfig {
  /** API keys for various providers (anthropic, openai, google, etc.) */
  apiKeys: ApiKeys;
  /** AWS Bedrock credentials (optional) */
  bedrockCredentials?: BedrockCredentials;
  /** Vertex AI credentials (optional) */
  vertexCredentials?: VertexCredentials;
  /** Path to service account key file for Vertex AI (optional) */
  vertexServiceAccountKeyPath?: string;
  /** Path to bundled Node.js bin directory (optional) */
  bundledNodeBinPath?: string;
  /** Task ID to set in ACCOMPLISH_TASK_ID (optional) */
  taskId?: string;
  /** OpenAI base URL override (optional) */
  openAiBaseUrl?: string;
  /** Ollama host URL (optional) */
  ollamaHost?: string;
}

/**
 * Environment variable mapping for API keys.
 * Maps provider names to their corresponding environment variable names.
 */
const API_KEY_ENV_MAPPING: Record<string, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  google: 'GOOGLE_GENERATIVE_AI_API_KEY',
  xai: 'XAI_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
  moonshot: 'MOONSHOT_API_KEY',
  zai: 'ZAI_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
  litellm: 'LITELLM_API_KEY',
  minimax: 'MINIMAX_API_KEY',
};

/**
 * Sets API key environment variables based on the provided keys.
 */
function setApiKeyEnvironment(env: NodeJS.ProcessEnv, apiKeys: ApiKeys): void {
  for (const [provider, envVar] of Object.entries(API_KEY_ENV_MAPPING)) {
    const key = apiKeys[provider];
    if (key) {
      env[envVar] = key;
    }
  }
}

/**
 * Sets AWS Bedrock credential environment variables.
 */
function setBedrockEnvironment(env: NodeJS.ProcessEnv, credentials: BedrockCredentials): void {
  if (credentials.authType === 'apiKey') {
    env.AWS_BEARER_TOKEN_BEDROCK = credentials.apiKey;
  } else if (credentials.authType === 'accessKeys') {
    env.AWS_ACCESS_KEY_ID = credentials.accessKeyId;
    env.AWS_SECRET_ACCESS_KEY = credentials.secretAccessKey;
    if (credentials.sessionToken) {
      env.AWS_SESSION_TOKEN = credentials.sessionToken;
    }
  } else if (credentials.authType === 'profile') {
    env.AWS_PROFILE = credentials.profileName;
  }

  if (credentials.region) {
    env.AWS_REGION = credentials.region;
  }
}

/**
 * Sets Vertex AI credential environment variables.
 */
function setVertexEnvironment(env: NodeJS.ProcessEnv, credentials: VertexCredentials, serviceAccountKeyPath?: string): void {
  env.GOOGLE_CLOUD_PROJECT = credentials.projectId;
  env.GOOGLE_CLOUD_LOCATION = credentials.location;

  if (credentials.authType === 'serviceAccount' && serviceAccountKeyPath) {
    env.GOOGLE_APPLICATION_CREDENTIALS = serviceAccountKeyPath;
  }
}

/**
 * Sets the bundled Node.js bin path in environment.
 */
function setBundledNodeEnvironment(env: NodeJS.ProcessEnv, bundledNodeBinPath: string): void {
  env.NODE_BIN_PATH = bundledNodeBinPath;
}

/**
 * Builds the OpenCode environment variables by merging provider-specific
 * configuration into a base environment.
 *
 * This function handles the reusable environment variable setup that can
 * be shared across different runtimes (Electron, CLI, etc.).
 *
 * @param baseEnv - The base environment to extend (typically process.env)
 * @param config - Configuration containing API keys, credentials, and other settings
 * @returns A new environment object with all required variables set
 *
 * @example
 * ```typescript
 * const env = buildOpenCodeEnvironment(process.env, {
 *   apiKeys: { anthropic: 'sk-ant-...', openai: 'sk-...' },
 *   bedrockCredentials: { authType: 'profile', profileName: 'default', region: 'us-east-1' },
 *   taskId: 'task-123',
 *   bundledNodeBinPath: '/path/to/node/bin',
 * });
 * ```
 */
export function buildOpenCodeEnvironment(
  baseEnv: NodeJS.ProcessEnv,
  config: EnvironmentConfig
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...baseEnv };

  // Set task ID if provided
  if (config.taskId) {
    env.ACCOMPLISH_TASK_ID = config.taskId;
  }

  // Set API key environment variables
  setApiKeyEnvironment(env, config.apiKeys);

  // Set OpenAI base URL if provided
  if (config.openAiBaseUrl) {
    env.OPENAI_BASE_URL = config.openAiBaseUrl;
  }

  // Set Bedrock credentials if provided
  if (config.bedrockCredentials) {
    setBedrockEnvironment(env, config.bedrockCredentials);
  }

  // Set Vertex AI credentials if provided
  if (config.vertexCredentials) {
    setVertexEnvironment(env, config.vertexCredentials, config.vertexServiceAccountKeyPath);
  }

  // Set bundled Node.js path if provided
  if (config.bundledNodeBinPath) {
    setBundledNodeEnvironment(env, config.bundledNodeBinPath);
  }

  // Set Ollama host if provided
  if (config.ollamaHost) {
    env.OLLAMA_HOST = config.ollamaHost;
  }

  return env;
}
