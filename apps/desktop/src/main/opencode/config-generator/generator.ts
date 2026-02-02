/**
 * Generator Orchestrator Module
 *
 * Main orchestrator that coordinates all config generation components:
 * - Ensures config directory exists
 * - Gets provider settings and connected providers
 * - Builds enabled providers list
 * - Builds provider configurations
 * - Builds MCP server configurations
 * - Builds system prompt with skills
 * - Assembles and writes final config
 *
 * @module config-generator/generator
 */

import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import { PERMISSION_API_PORT, QUESTION_API_PORT } from '../../permission-api';
import { getApiKey } from '../../store/secureStorage';
import { getProviderSettings, getActiveProviderModel, getConnectedProviderIds } from '../../store/providerSettings';
import { ensureAzureFoundryProxy } from '../azure-foundry-proxy';
import { ensureMoonshotProxy } from '../moonshot-proxy';
import { skillsManager } from '../../skills';
import type { ProviderId, ZaiCredentials, AzureFoundryCredentials } from '@accomplish/shared';

// Re-export from other modules for backward compatibility
export { getMcpToolsPath, getOpenCodeConfigDir } from './paths';
export { ACCOMPLISH_AGENT_NAME, ACCOMPLISH_SYSTEM_PROMPT_TEMPLATE, getPlatformEnvironmentInstructions } from './system-prompt';
export type {
  OpenCodeConfig,
  AgentConfig,
  McpServerConfig,
  ProviderConfig,
  ProviderModelConfig,
} from './types';

// Import internal dependencies
import { getMcpToolsPath, getOpenCodeConfigDir, resolveBundledTsxCommand } from './paths';
import { PROVIDER_ID_TO_OPENCODE, BASE_ENABLED_PROVIDERS, PROVIDER_IDS } from './constants';
import { ACCOMPLISH_AGENT_NAME, ACCOMPLISH_SYSTEM_PROMPT_TEMPLATE, getPlatformEnvironmentInstructions } from './system-prompt';
import { buildMcpServerConfigs } from './mcp-servers/builder';
import { buildAllStandardProviders } from './providers/builder';
import type {
  OpenCodeConfig,
  ProviderConfig,
  BedrockProviderConfig,
  AzureFoundryProviderConfig,
  LiteLLMProviderConfig,
  ProviderModelConfig,
  ZaiProviderModelConfig,
} from './types';

/**
 * Options for assembling the OpenCode config
 */
export interface AssembleConfigOptions {
  enabledProviders: string[];
  providerConfig: Record<string, ProviderConfig>;
  fullSystemPrompt: string;
  bedrockModelConfig?: {
    model?: string;
    small_model?: string;
  };
  mcpConfigs: Record<string, import('./types').McpServerConfig>;
}

/**
 * Build Azure Foundry provider configuration for OpenCode CLI
 */
async function buildAzureFoundryProviderConfig(
  endpoint: string,
  deploymentName: string,
  authMethod: 'api-key' | 'entra-id',
  azureFoundryToken?: string
): Promise<AzureFoundryProviderConfig | null> {
  const baseUrl = endpoint.replace(/\/$/, '');
  const targetBaseUrl = `${baseUrl}/openai/v1`;
  const proxyInfo = await ensureAzureFoundryProxy(targetBaseUrl);

  // Build options for @ai-sdk/openai-compatible provider
  // Route through local proxy to strip unsupported params for Azure Foundry
  const azureOptions: AzureFoundryProviderConfig['options'] = {
    baseURL: proxyInfo.baseURL,
  };

  // Set API key or Entra ID token
  if (authMethod === 'api-key') {
    const azureApiKey = getApiKey('azure-foundry');
    if (azureApiKey) {
      azureOptions.apiKey = azureApiKey;
    }
  } else if (authMethod === 'entra-id' && azureFoundryToken) {
    azureOptions.apiKey = '';
    azureOptions.headers = {
      'Authorization': `Bearer ${azureFoundryToken}`,
    };
  }

  return {
    npm: '@ai-sdk/openai-compatible',
    name: 'Azure AI Foundry',
    options: azureOptions,
    models: {
      [deploymentName]: {
        name: `Azure Foundry (${deploymentName})`,
        tools: true,
        // Set conservative output token limit - can be overridden per-deployment
        // This prevents errors from models with lower limits (e.g., 16384 for some GPT-5 deployments)
        limit: {
          context: 128000,
          output: 16384,
        },
      },
    },
  };
}

/**
 * Assemble the final OpenCodeConfig object
 */
export function assembleConfig(options: AssembleConfigOptions): OpenCodeConfig {
  const {
    enabledProviders,
    providerConfig,
    fullSystemPrompt,
    bedrockModelConfig,
    mcpConfigs,
  } = options;

  const config: OpenCodeConfig = {
    $schema: 'https://opencode.ai/config.json',
    ...(bedrockModelConfig || {}),
    default_agent: ACCOMPLISH_AGENT_NAME,
    // Enable all supported providers - providers auto-configure when API keys are set via env vars
    enabled_providers: enabledProviders,
    // Auto-allow all tool permissions - the system prompt instructs the agent to use
    // AskUserQuestion for user confirmations, which shows in the UI as an interactive modal.
    // CLI-level permission prompts don't show in the UI and would block task execution.
    // Note: todowrite is disabled by default and must be explicitly enabled.
    permission: {
      '*': 'allow',
      todowrite: 'allow',
    },
    provider: Object.keys(providerConfig).length > 0 ? providerConfig : undefined,
    // Dynamic Context Pruning plugin - prunes obsolete tool outputs from conversation
    // history to reduce token usage (deduplication, supersede writes, purge errors)
    plugin: ['@tarquinen/opencode-dcp@^1.2.7'],
    agent: {
      [ACCOMPLISH_AGENT_NAME]: {
        description: 'Browser automation assistant using dev-browser',
        prompt: fullSystemPrompt,
        mode: 'primary',
      },
    },
    // MCP servers for additional tools (built by buildMcpServerConfigs)
    // Timeout set to 30000ms to handle slow npx startup on Windows
    mcp: mcpConfigs,
  };

  return config;
}

/**
 * Generate OpenCode configuration file
 * OpenCode reads config from .opencode.json in the working directory or
 * from ~/.config/opencode/opencode.json
 * @param azureFoundryToken - Optional Entra ID token for Azure Foundry authentication
 */
export async function generateOpenCodeConfig(azureFoundryToken?: string): Promise<string> {
  const configDir = path.join(app.getPath('userData'), 'opencode');
  const configPath = path.join(configDir, 'opencode.json');

  // Ensure directory exists
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  // Get MCP tools directory path
  const mcpToolsPath = getMcpToolsPath();

  // Build platform-specific system prompt by replacing placeholders
  const systemPrompt = ACCOMPLISH_SYSTEM_PROMPT_TEMPLATE
    .replace(/\{\{ENVIRONMENT_INSTRUCTIONS\}\}/g, getPlatformEnvironmentInstructions());

  // Get OpenCode config directory (parent of mcp-tools/) for OPENCODE_CONFIG_DIR
  const openCodeConfigDir = getOpenCodeConfigDir();

  console.log('[OpenCode Config] MCP tools path:', mcpToolsPath);
  console.log('[OpenCode Config] OpenCode config dir:', openCodeConfigDir);

  // Get connected providers from provider settings
  const providerSettings = getProviderSettings();
  const connectedIds = getConnectedProviderIds();
  const activeModel = getActiveProviderModel();

  // Build enabled providers list from connected providers
  // Type as string[] to allow adding providers not in BASE_ENABLED_PROVIDERS
  let enabledProviders: string[] = [...BASE_ENABLED_PROVIDERS];

  // If we have connected providers, add them to the enabled list
  if (connectedIds.length > 0) {
    const mappedProviders = connectedIds.map(id => PROVIDER_ID_TO_OPENCODE[id]);
    // Always include base providers to allow switching
    enabledProviders = [...new Set([...BASE_ENABLED_PROVIDERS, ...mappedProviders])];
    console.log('[OpenCode Config] Using connected providers:', mappedProviders);
  }

  // Build provider configurations
  const providerConfig: Record<string, ProviderConfig> = {};

  // Configure Ollama if connected
  const ollamaProvider = providerSettings.connectedProviders.ollama;
  if (ollamaProvider?.connectionStatus === 'connected' && ollamaProvider.credentials.type === 'ollama') {
    if (ollamaProvider.selectedModelId) {
      // OpenCode CLI splits "ollama/model" into provider="ollama" and modelID="model"
      // So we need to register the model without the "ollama/" prefix
      const modelId = ollamaProvider.selectedModelId.replace(/^ollama\//, '');
      providerConfig.ollama = {
        npm: '@ai-sdk/openai-compatible',
        name: 'Ollama (local)',
        options: {
          baseURL: `${ollamaProvider.credentials.serverUrl}/v1`,
        },
        models: {
          [modelId]: {
            name: modelId,
            tools: true,
          },
        },
      };
      console.log('[OpenCode Config] Ollama configured:', modelId);
    }
  }

  // Configure OpenRouter if connected and active
  const openrouterProvider = providerSettings.connectedProviders.openrouter;
  if (openrouterProvider?.connectionStatus === 'connected' && activeModel?.provider === 'openrouter') {
    const modelId = activeModel.model.replace('openrouter/', '');
    providerConfig.openrouter = {
      npm: '@ai-sdk/openai-compatible',
      name: 'OpenRouter',
      options: {
        baseURL: 'https://openrouter.ai/api/v1',
      },
      models: {
        [modelId]: {
          name: modelId,
          tools: true,
        },
      },
    };
    console.log('[OpenCode Config] OpenRouter configured:', modelId);
  }

  // Configure Moonshot if connected
  const moonshotProvider = providerSettings.connectedProviders.moonshot;
  if (moonshotProvider?.connectionStatus === 'connected') {
    if (moonshotProvider.selectedModelId) {
      const modelId = moonshotProvider.selectedModelId.replace(/^moonshot\//, '');
      const moonshotApiKey = getApiKey('moonshot');
      const proxyInfo = await ensureMoonshotProxy('https://api.moonshot.ai/v1');
      providerConfig.moonshot = {
        npm: '@ai-sdk/openai-compatible',
        name: 'Moonshot AI',
        options: {
          baseURL: proxyInfo.baseURL,
          ...(moonshotApiKey ? { apiKey: moonshotApiKey } : {}),
        },
        models: {
          [modelId]: {
            name: modelId,
            tools: true,
          },
        },
      };
      console.log('[OpenCode Config] Moonshot AI configured:', modelId);
    }
  }

  // Configure Bedrock if connected
  const bedrockProvider = providerSettings.connectedProviders.bedrock;
  if (bedrockProvider?.connectionStatus === 'connected' && bedrockProvider.credentials.type === 'bedrock') {
    const creds = bedrockProvider.credentials;
    const bedrockOptions: BedrockProviderConfig['options'] = {
      region: creds.region || 'us-east-1',
    };
    if (creds.authMethod === 'profile' && creds.profileName) {
      bedrockOptions.profile = creds.profileName;
    }
    providerConfig['amazon-bedrock'] = {
      options: bedrockOptions,
    };
    console.log('[OpenCode Config] Bedrock configured:', bedrockOptions);
  }

  // Configure LiteLLM if connected
  const litellmProvider = providerSettings.connectedProviders.litellm;
  if (litellmProvider?.connectionStatus === 'connected' && litellmProvider.credentials.type === 'litellm') {
    if (litellmProvider.selectedModelId) {
      // Get API key if available
      const litellmApiKey = getApiKey('litellm');
      const litellmOptions: LiteLLMProviderConfig['options'] = {
        baseURL: `${litellmProvider.credentials.serverUrl}/v1`,
      };
      if (litellmApiKey) {
        litellmOptions.apiKey = litellmApiKey;
      }
      providerConfig.litellm = {
        npm: '@ai-sdk/openai-compatible',
        name: 'LiteLLM',
        options: litellmOptions,
        models: {
          [litellmProvider.selectedModelId]: {
            name: litellmProvider.selectedModelId,
            tools: true,
          },
        },
      };
      console.log('[OpenCode Config] LiteLLM configured:', litellmProvider.selectedModelId, litellmApiKey ? '(with API key)' : '(no API key)');
    }
  }

  // Configure LM Studio if connected
  const lmstudioProvider = providerSettings.connectedProviders.lmstudio;
  if (lmstudioProvider?.connectionStatus === 'connected' && lmstudioProvider.credentials.type === 'lmstudio') {
    if (lmstudioProvider.selectedModelId) {
      // OpenCode CLI splits "lmstudio/model" into provider="lmstudio" and modelID="model"
      // So we need to register the model without the "lmstudio/" prefix
      const modelId = lmstudioProvider.selectedModelId.replace(/^lmstudio\//, '');

      // Check if the model supports tools from the availableModels metadata
      const modelInfo = lmstudioProvider.availableModels?.find(
        m => m.id === lmstudioProvider.selectedModelId || m.id === modelId
      );
      const supportsTools = (modelInfo as { toolSupport?: string })?.toolSupport === 'supported';

      providerConfig.lmstudio = {
        npm: '@ai-sdk/openai-compatible',
        name: 'LM Studio',
        options: {
          baseURL: `${lmstudioProvider.credentials.serverUrl}/v1`,
        },
        models: {
          [modelId]: {
            name: modelId,
            tools: supportsTools,
          },
        },
      };
      console.log(`[OpenCode Config] LM Studio configured: ${modelId} (tools: ${supportsTools})`);
    }
  }

  // Configure Azure Foundry if connected
  const azureFoundryProvider = providerSettings.connectedProviders['azure-foundry'];
  if (azureFoundryProvider?.connectionStatus === 'connected' && azureFoundryProvider.credentials.type === 'azure-foundry') {
    const creds = azureFoundryProvider.credentials as AzureFoundryCredentials;
    const config = await buildAzureFoundryProviderConfig(
      creds.endpoint,
      creds.deploymentName,
      creds.authMethod,
      azureFoundryToken
    );

    if (config) {
      providerConfig['azure-foundry'] = config;

      if (!enabledProviders.includes('azure-foundry')) {
        enabledProviders.push('azure-foundry');
      }

      console.log('[OpenCode Config] Azure Foundry configured:', {
        deployment: creds.deploymentName,
        authMethod: creds.authMethod,
      });
    }
  }

  // Add Z.AI Coding Plan provider configuration with all supported models
  // This is needed because OpenCode's built-in zai-coding-plan provider may not have all models
  const zaiKey = getApiKey('zai');
  if (zaiKey) {
    const zaiModels: Record<string, ZaiProviderModelConfig> = {
      'glm-4.7-flashx': { name: 'GLM-4.7 FlashX (Latest)', tools: true },
      'glm-4.7': { name: 'GLM-4.7', tools: true },
      'glm-4.7-flash': { name: 'GLM-4.7 Flash', tools: true },
      'glm-4.6': { name: 'GLM-4.6', tools: true },
      'glm-4.5-flash': { name: 'GLM-4.5 Flash', tools: true },
    };

    // Z.AI - use endpoint based on stored region
    const zaiCredentials = providerSettings.connectedProviders.zai?.credentials as ZaiCredentials | undefined;
    const zaiRegion = zaiCredentials?.region || 'international';
    const zaiEndpoint = zaiRegion === 'china'
      ? 'https://open.bigmodel.cn/api/paas/v4'
      : 'https://api.z.ai/api/coding/paas/v4';

    providerConfig['zai-coding-plan'] = {
      npm: '@ai-sdk/openai-compatible',
      name: 'Z.AI Coding Plan',
      options: {
        baseURL: zaiEndpoint,
      },
      models: zaiModels,
    };
    console.log('[OpenCode Config] Z.AI Coding Plan provider configured with models:', Object.keys(zaiModels), 'region:', zaiRegion, 'endpoint:', zaiEndpoint);
  }

  const tsxCommand = resolveBundledTsxCommand(mcpToolsPath);

  // Get enabled skills and add to system prompt
  const enabledSkills = await skillsManager.getEnabled();

  let skillsSection = '';
  if (enabledSkills.length > 0) {
    skillsSection = `

<available-skills>
##############################################################################
# SKILLS - Include relevant ones in your start_task call
##############################################################################

Review these skills and include any relevant ones in your start_task call's \`skills\` array.
After calling start_task, you MUST read the SKILL.md file for each skill you listed.

**Available Skills:**

${enabledSkills.map(s => `- **${s.name}** (${s.command}): ${s.description}
  File: ${s.filePath}`).join('\n\n')}

Use empty array [] if no skills apply to your task.

##############################################################################
</available-skills>
`;
  }

  // Combine base system prompt with skills section
  const fullSystemPrompt = systemPrompt + skillsSection;

  console.log('[OpenCode Config] MCP build marker: edited by codex');

  // For Bedrock, set model and small_model to the same value in order to prevent the model from using
  // Haiku by default since anthropic via bedrock require an approval form to use it: https://docs.aws.amazon.com/bedrock/latest/userguide/model-access.html
  const bedrockModelConfig: { model?: string; small_model?: string } = {};
  if (activeModel?.provider === 'bedrock' && activeModel.model) {
    bedrockModelConfig.model = activeModel.model;
    bedrockModelConfig.small_model = activeModel.model;
    console.log('[OpenCode Config] Bedrock model config:', bedrockModelConfig);
  }

  // Build MCP server configurations using the builder module
  const mcpConfigs = buildMcpServerConfigs(
    mcpToolsPath,
    tsxCommand,
    PERMISSION_API_PORT,
    QUESTION_API_PORT
  );

  const config = assembleConfig({
    enabledProviders,
    providerConfig,
    fullSystemPrompt,
    bedrockModelConfig,
    mcpConfigs,
  });

  // Write config file
  const configJson = JSON.stringify(config, null, 2);
  fs.writeFileSync(configPath, configJson);

  // Set environment variables for OpenCode to find the config
  process.env.OPENCODE_CONFIG = configPath;

  // Set OPENCODE_CONFIG_DIR to the writable config directory, not resourcesPath
  // resourcesPath is read-only on mounted DMGs (macOS) and protected on Windows (Program Files).
  // This causes EROFS/EPERM errors when OpenCode tries to write package.json there.
  // MCP servers are configured with explicit paths, so we don't need MCP tools discovery via OPENCODE_CONFIG_DIR.
  process.env.OPENCODE_CONFIG_DIR = configDir;

  console.log('[OpenCode Config] Generated config at:', configPath);
  console.log('[OpenCode Config] Full config:', configJson);
  console.log('[OpenCode Config] OPENCODE_CONFIG env set to:', process.env.OPENCODE_CONFIG);
  console.log('[OpenCode Config] OPENCODE_CONFIG_DIR env set to:', process.env.OPENCODE_CONFIG_DIR);

  return configPath;
}

/**
 * Get the path where OpenCode config is stored
 */
export function getOpenCodeConfigPath(): string {
  return path.join(app.getPath('userData'), 'opencode', 'opencode.json');
}
