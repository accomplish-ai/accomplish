import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import { PERMISSION_API_PORT, QUESTION_API_PORT } from '../permission-api';
import { getOllamaConfig, getLMStudioConfig } from '../store/appSettings';
import { getApiKey } from '../store/secureStorage';
import { getProviderSettings, getActiveProviderModel, getConnectedProviderIds } from '../store/providerSettings';
import { ensureAzureFoundryProxy } from './azure-foundry-proxy';
import { ensureMoonshotProxy } from './moonshot-proxy';
import { getNodePath } from '../utils/bundled-node';
import type { BedrockCredentials, ProviderId, ZaiCredentials, AzureFoundryCredentials } from '@accomplish/shared';

/**
 * Agent name used by Accomplish
 */
export const ACCOMPLISH_AGENT_NAME = 'accomplish';

/**
 * System prompt for the Accomplish agent.
 *
 * Uses the dev-browser skill for browser automation with persistent page state.
 *
 * @see https://github.com/SawyerHood/dev-browser
 */
/**
 * Get the skills directory path (contains MCP servers and SKILL.md files)
 * In dev: apps/desktop/skills
 * In packaged: resources/skills (unpacked from asar)
 */
export function getSkillsPath(): string {
  if (app.isPackaged) {
    // In packaged app, skills should be in resources folder (unpacked from asar)
    return path.join(process.resourcesPath, 'skills');
  } else {
    // In development, use app.getAppPath() which returns the desktop app directory
    // app.getAppPath() returns apps/desktop in dev mode
    return path.join(app.getAppPath(), 'skills');
  }
}

/**
 * Get the OpenCode config directory path (parent of skills/ for OPENCODE_CONFIG_DIR)
 * OpenCode looks for skills at $OPENCODE_CONFIG_DIR/skills/<name>/SKILL.md
 */
export function getOpenCodeConfigDir(): string {
  if (app.isPackaged) {
    return process.resourcesPath;
  } else {
    return app.getAppPath();
  }
}

function resolveBundledTsxCommand(skillsPath: string): string[] {
  const tsxBin = process.platform === 'win32' ? 'tsx.cmd' : 'tsx';
  const candidates = [
    path.join(skillsPath, 'file-permission', 'node_modules', '.bin', tsxBin),
    path.join(skillsPath, 'ask-user-question', 'node_modules', '.bin', tsxBin),
    path.join(skillsPath, 'dev-browser-mcp', 'node_modules', '.bin', tsxBin),
    path.join(skillsPath, 'complete-task', 'node_modules', '.bin', tsxBin),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      console.log('[OpenCode Config] Using bundled tsx:', candidate);
      return [candidate];
    }
  }

  console.log('[OpenCode Config] Bundled tsx not found; falling back to npx tsx');
  return ['npx', 'tsx'];
}

function resolveSkillCommand(
  tsxCommand: string[],
  skillsPath: string,
  skillName: string,
  sourceRelPath: string,
  distRelPath: string
): string[] {
  const skillDir = path.join(skillsPath, skillName);
  const distPath = path.join(skillDir, distRelPath);

  if ((app.isPackaged || process.env.OPENWORK_BUNDLED_SKILLS === '1') && fs.existsSync(distPath)) {
    const nodePath = getNodePath();
    console.log('[OpenCode Config] Using bundled skill entry:', distPath);
    return [nodePath, distPath];
  }

  const sourcePath = path.join(skillDir, sourceRelPath);
  console.log('[OpenCode Config] Using tsx skill entry:', sourcePath);
  return [...tsxCommand, sourcePath];
}

/**
 * Build platform-specific environment setup instructions
 */
function getPlatformEnvironmentInstructions(): string {
  if (process.platform === 'win32') {
    return `<environment>
**You are running on Windows.** Use Windows-compatible commands:
- Use PowerShell syntax, not bash/Unix syntax
- Use \`$env:TEMP\` for temp directory (not /tmp)
- Use semicolon (;) for PATH separator (not colon)
- Use \`$env:VAR\` for environment variables (not $VAR)
</environment>`;
  } else {
    return `<environment>
You are running on ${process.platform === 'darwin' ? 'macOS' : 'Linux'}.
</environment>`;
  }
}


const ACCOMPLISH_SYSTEM_PROMPT_TEMPLATE = `<identity>
You are Accomplish, a browser automation assistant running locally on the user's desktop.
You control browsers, manage files, and automate repetitive tasks with persistence and precision.
You always complete what you start and never stop without properly finishing.
</identity>

{{ENVIRONMENT_INSTRUCTIONS}}

<critical_rules>
##############################################################################
# RULE 1: PLAN BEFORE ANY ACTION
##############################################################################
Your FIRST output for ANY task MUST be text starting with "**Plan:**".
Tool calls before this text block are FORBIDDEN.

Sequence:
1. Output "**Plan:**" with Goal and numbered Steps
2. Call todowrite with those steps (first step as "in_progress")
3. Execute step 1
4. Mark step 1 complete IMMEDIATELY, then proceed to step 2
5. Repeat until all steps complete, then call complete_task

Self-check before first tool call:
- Did I output "**Plan:**" with Goal and Steps? If no, STOP and do it.
- Did I call todowrite? If no, STOP and do it.

##############################################################################
# RULE 2: FILE PERMISSIONS - ASK, WAIT, THEN ACT
##############################################################################
Before ANY file operation (Write, Edit, Bash with file ops, scripts that output files):

1. Call request_file_permission and STOP
2. WAIT for the response
3. Only proceed if response is "allowed"
4. If "denied": inform user and stop

This applies to: creating, renaming, deleting, moving, modifying, overwriting files.

WRONG: Write({ path: "/tmp/file.txt", content: "..." })
CORRECT: request_file_permission({...}) → wait → "allowed" → Write({...})

##############################################################################
# RULE 3: ALWAYS CALL complete_task TO FINISH
##############################################################################
You MUST call complete_task to end ANY task. Never just stop.

Before calling with status "success":
□ Re-read the original request word by word
□ Verify EVERY requirement is met
□ Confirm ALL todos are completed or cancelled

Status guide:
- "success": Everything verified done
- "blocked": ONLY for technical blockers (login walls, CAPTCHAs, site errors)
  NOT for "task is large" or "many steps" - if doable, KEEP WORKING
- "partial": AVOID - only if forced to stop mid-task

##############################################################################
# RULE 4: USER CANNOT SEE YOUR TEXT OUTPUT
##############################################################################
The user CANNOT see your text responses or CLI prompts.
To ask ANY question or get user input, you MUST use the AskUserQuestion tool.
</critical_rules>

<tools>
<tool name="request_file_permission">
Request user permission before file operations.

Input:
{
  "operation": "create" | "delete" | "rename" | "move" | "modify" | "overwrite",
  "filePath": "/absolute/path/to/file",
  "targetPath": "/new/path",       // Required for rename/move
  "contentPreview": "content..."   // Optional for create/modify/overwrite
}

Operations:
- create: Creating a new file that doesn't exist
- delete: Deleting an existing file or folder
- rename: Changing a file's name (provide targetPath with new name)
- move: Moving a file to a different location (provide targetPath)
- modify: Changing part of an existing file's content
- overwrite: Replacing an entire file's content

Returns: "allowed" or "denied" - proceed ONLY if allowed
</tool>

<tool name="AskUserQuestion">
Use this to ask the user any question or request input.
The user cannot see your regular text output - only use this tool for questions.
</tool>

<tool name="todowrite">
Track and display task progress. Call after planning.

Input:
{
  "todos": [
    {"id": "1", "content": "Step description", "status": "in_progress", "priority": "high"},
    {"id": "2", "content": "Step description", "status": "pending", "priority": "medium"}
  ]
}

Rules:
- Mark todos complete IMMEDIATELY after finishing each step (never batch)
- All todos must be "completed" or "cancelled" before complete_task
- Update to "in_progress" when starting a step
</tool>

<tool name="complete_task">
Call this to finish any task. Required fields:
- status: "success" | "blocked" | "partial"
- original_request_summary: Restate what was asked (forces you to verify)
- remaining_work: Required if blocked/partial - specific next steps
</tool>

<tool name="browser_sequence">
Execute multiple browser actions in quick succession. More efficient than individual calls.

Use for: Filling forms with multiple fields, multi-step interactions on one page.

Example: Fill login form (email field, password field, click submit) in one call
instead of three separate browser_* calls.
</tool>

<tool name="browser_batch_actions">
Extract data from multiple URLs in a single call.

Use for: Collecting info from search results, comparing listings, gathering data from multiple pages.

Workflow:
1. First, collect target URLs from initial page (e.g., search results)
2. Pass all URLs to browser_batch_actions with a JS extraction script
3. Process all results at once

This is MUCH faster than visiting each page individually with click/snapshot loops.
</tool>
</tools>

<capabilities>
When users ask what you can do:
- **Browser Automation**: Navigate sites, fill forms, click buttons, extract data
  - Use browser_sequence for multi-field forms (faster than individual calls)
  - Use browser_batch_actions for extracting data from multiple URLs at once
- **File Management**: Sort, rename, move files based on content or rules

Limitations:
- Cannot use system browser commands (open, xdg-open, start) - use browser_* tools only
- Cannot bypass login walls or CAPTCHAs without user help
- Cannot access sites that block automation
</capabilities>

<browser_behavior>
## Tool Selection
- Use browser_* MCP tools for ALL browser operations
- NEVER use shell commands (open, xdg-open, start, subprocess, webbrowser)
- For multi-step workflows on one page: use browser_script or browser_sequence
- For filling forms with multiple fields: prefer browser_sequence over individual calls
- For multi-page data collection: collect URLs first, then use browser_batch_actions

## Narration
Before each action, explain what you're doing in user terms.
After each action, describe what happened.

Good: "Navigating to Google... Page loaded with search box visible. Typing 'weather'..."
Bad: "Done." or "Clicked." or "Navigated."

When something unexpected happens:
"The expected button isn't visible. Taking a fresh snapshot to see current state..."

## Error Recovery
- If element not found: wait briefly, retry up to 3 times
- If click has no effect: take new snapshot, analyze current state
- If navigation fails: verify current URL before retrying
</browser_behavior>

<task_behavior>
## Planning Depth
- Simple tasks (1-3 steps): Brief plan, execute quickly
- Complex tasks (4+ steps): Detailed plan with clear milestones

## Continuation
- Do NOT ask "Should I continue?" if the task has clear criteria
- Keep working until requirements are met
- Only use AskUserQuestion for genuine clarifications, not progress check-ins

## When Blocked
If you hit login walls, CAPTCHAs, or access denials:
1. Explain the blocker clearly
2. Ask if user can help (e.g., complete login manually)
3. If unresolvable: complete_task with status "blocked"
</task_behavior>

<examples>
<example name="correct-planning">
User: "Rename all .txt files in Downloads to have today's date prefix"

**Plan:**
Goal: Rename .txt files in ~/Downloads with date prefix (2025-01-15_filename.txt)

Steps:
1. List .txt files in ~/Downloads
2. Request permission to rename files
3. Rename each file with date prefix
4. Verify renames succeeded

[Calls todowrite with 4 steps, step 1 as in_progress]
[Executes step 1]
</example>

<example name="wrong-planning">
User: "Rename all .txt files in Downloads"

WRONG - Starting with tool call:
[tool_use: bash {command: "ls ~/Downloads/*.txt"}]

This is FORBIDDEN. Plan text MUST come first.
</example>
</examples>

<final_reminders>
##############################################################################
# KEY POINTS - DO NOT FORGET
##############################################################################

1. CONTEXT AUTO-COMPACTS: Your context window compacts automatically at its limit.
   Do NOT stop early due to token concerns. Keep working until truly done.

2. TODOS COMPLETE IMMEDIATELY: Mark each todo done right after finishing it.
   Never batch completions. Never proceed to complete_task with pending todos.

3. BATCH FOR EFFICIENCY: When collecting data from multiple pages, gather URLs
   first, then use browser_batch_actions - not individual click/snapshot loops.

4. NO SYSTEM BROWSERS: All browser operations through browser_* MCP tools.
   Shell commands like 'open' launch the wrong browser.

5. PERSISTENCE: If a task is large but doable, KEEP WORKING.
   "blocked" and "partial" are not escape hatches for difficult tasks.

6. VERIFY BEFORE SUCCESS: Re-read the original request before marking complete.
   Check every requirement. The original_request_summary field forces this.
</final_reminders>
`;

interface AgentConfig {
  description?: string;
  prompt?: string;
  mode?: 'primary' | 'subagent' | 'all';
}

interface McpServerConfig {
  type?: 'local' | 'remote';
  command?: string[];
  url?: string;
  enabled?: boolean;
  environment?: Record<string, string>;
  timeout?: number;
}

interface ProviderModelConfig {
  name: string;
  tools?: boolean;
  limit?: {
    context?: number;
    output?: number;
  };
  options?: Record<string, unknown>;
}

interface OllamaProviderConfig {
  npm: string;
  name: string;
  options: {
    baseURL: string;
  };
  models: Record<string, ProviderModelConfig>;
}

interface BedrockProviderConfig {
  options: {
    region: string;
    profile?: string;
  };
}

interface AzureFoundryProviderConfig {
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

interface OpenRouterProviderModelConfig {
  name: string;
  tools?: boolean;
}

interface OpenRouterProviderConfig {
  npm: string;
  name: string;
  options: {
    baseURL: string;
  };
  models: Record<string, OpenRouterProviderModelConfig>;
}

interface MoonshotProviderModelConfig {
  name: string;
  tools?: boolean;
}

interface MoonshotProviderConfig {
  npm: string;
  name: string;
  options: {
    baseURL: string;
  };
  models: Record<string, MoonshotProviderModelConfig>;
}

interface LiteLLMProviderModelConfig {
  name: string;
  tools?: boolean;
}

interface LiteLLMProviderConfig {
  npm: string;
  name: string;
  options: {
    baseURL: string;
    apiKey?: string;
  };
  models: Record<string, LiteLLMProviderModelConfig>;
}

interface ZaiProviderModelConfig {
  name: string;
  tools?: boolean;
}

interface ZaiProviderConfig {
  npm: string;
  name: string;
  options: {
    baseURL: string;
  };
  models: Record<string, ZaiProviderModelConfig>;
}

interface LMStudioProviderModelConfig {
  name: string;
  tools?: boolean;
}

interface LMStudioProviderConfig {
  npm: string;
  name: string;
  options: {
    baseURL: string;
  };
  models: Record<string, LMStudioProviderModelConfig>;
}

type ProviderConfig = OllamaProviderConfig | BedrockProviderConfig | AzureFoundryProviderConfig | OpenRouterProviderConfig | MoonshotProviderConfig | LiteLLMProviderConfig | ZaiProviderConfig | LMStudioProviderConfig;

interface OpenCodeConfig {
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

/**
 * Build Azure Foundry provider configuration for OpenCode CLI
 * Shared helper to avoid duplication between new settings and legacy paths
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

  // Get skills directory path
  const skillsPath = getSkillsPath();

  // Build platform-specific system prompt by replacing placeholders
  const systemPrompt = ACCOMPLISH_SYSTEM_PROMPT_TEMPLATE
    .replace(/\{\{ENVIRONMENT_INSTRUCTIONS\}\}/g, getPlatformEnvironmentInstructions());

  // Get OpenCode config directory (parent of skills/) for OPENCODE_CONFIG_DIR
  const openCodeConfigDir = getOpenCodeConfigDir();

  console.log('[OpenCode Config] Skills path:', skillsPath);
  console.log('[OpenCode Config] OpenCode config dir:', openCodeConfigDir);

  // Build file-permission MCP server command

  // Get connected providers from new settings (with legacy fallback)
  const providerSettings = getProviderSettings();
  const connectedIds = getConnectedProviderIds();
  const activeModel = getActiveProviderModel();

  // Map our provider IDs to OpenCode CLI provider names
  const providerIdToOpenCode: Record<ProviderId, string> = {
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
  };

  // Build enabled providers list from new settings or fall back to base providers
  const baseProviders = ['anthropic', 'openai', 'openrouter', 'google', 'xai', 'deepseek', 'moonshot', 'zai-coding-plan', 'amazon-bedrock', 'minimax'];
  let enabledProviders = baseProviders;

  // If we have connected providers in the new settings, use those
  if (connectedIds.length > 0) {
    const mappedProviders = connectedIds.map(id => providerIdToOpenCode[id]);
    // Always include base providers to allow switching
    enabledProviders = [...new Set([...baseProviders, ...mappedProviders])];
    console.log('[OpenCode Config] Using connected providers from new settings:', mappedProviders);
  } else {
    // Legacy fallback: add ollama if configured in old settings
    const ollamaConfig = getOllamaConfig();
    if (ollamaConfig?.enabled) {
      enabledProviders = [...baseProviders, 'ollama'];
    }
  }

  // Build provider configurations
  const providerConfig: Record<string, ProviderConfig> = {};

  // Configure Ollama if connected (check new settings first, then legacy)
  const ollamaProvider = providerSettings.connectedProviders.ollama;
  if (ollamaProvider?.connectionStatus === 'connected' && ollamaProvider.credentials.type === 'ollama') {
    // New provider settings: Ollama is connected
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
      console.log('[OpenCode Config] Ollama configured from new settings:', modelId);
    }
  } else {
    // Legacy fallback: use old Ollama config
    const ollamaConfig = getOllamaConfig();
    if (ollamaConfig?.enabled && ollamaConfig.models && ollamaConfig.models.length > 0) {
      const ollamaModels: Record<string, ProviderModelConfig> = {};
      for (const model of ollamaConfig.models) {
        ollamaModels[model.id] = {
          name: model.displayName,
          tools: true,
        };
      }

      providerConfig.ollama = {
        npm: '@ai-sdk/openai-compatible',
        name: 'Ollama (local)',
        options: {
          baseURL: `${ollamaConfig.baseUrl}/v1`,
        },
        models: ollamaModels,
      };

      console.log('[OpenCode Config] Ollama configured from legacy settings:', Object.keys(ollamaModels));
    }
  }

  // Configure OpenRouter if connected (check new settings first, then legacy)
  const openrouterProvider = providerSettings.connectedProviders.openrouter;
  if (openrouterProvider?.connectionStatus === 'connected' && activeModel?.provider === 'openrouter') {
    // New provider settings: OpenRouter is connected and active
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
    console.log('[OpenCode Config] OpenRouter configured from new settings:', modelId);
  } else {
    // Legacy fallback: use old OpenRouter config
    const openrouterKey = getApiKey('openrouter');
    if (openrouterKey) {
      const { getSelectedModel } = await import('../store/appSettings');
      const selectedModel = getSelectedModel();

      const openrouterModels: Record<string, OpenRouterProviderModelConfig> = {};

      if (selectedModel?.provider === 'openrouter' && selectedModel.model) {
        const modelId = selectedModel.model.replace('openrouter/', '');
        openrouterModels[modelId] = {
          name: modelId,
          tools: true,
        };
      }

      if (Object.keys(openrouterModels).length > 0) {
        providerConfig.openrouter = {
          npm: '@ai-sdk/openai-compatible',
          name: 'OpenRouter',
          options: {
            baseURL: 'https://openrouter.ai/api/v1',
          },
          models: openrouterModels,
        };
        console.log('[OpenCode Config] OpenRouter configured from legacy settings:', Object.keys(openrouterModels));
      }
    }
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

  // Configure Bedrock if connected (check new settings first, then legacy)
  const bedrockProvider = providerSettings.connectedProviders.bedrock;
  if (bedrockProvider?.connectionStatus === 'connected' && bedrockProvider.credentials.type === 'bedrock') {
    // New provider settings: Bedrock is connected
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
    console.log('[OpenCode Config] Bedrock configured from new settings:', bedrockOptions);
  } else {
    // Legacy fallback: use old Bedrock config
    const bedrockCredsJson = getApiKey('bedrock');
    if (bedrockCredsJson) {
      try {
        const creds = JSON.parse(bedrockCredsJson) as BedrockCredentials;

        const bedrockOptions: BedrockProviderConfig['options'] = {
          region: creds.region || 'us-east-1',
        };

        if (creds.authType === 'profile' && creds.profileName) {
          bedrockOptions.profile = creds.profileName;
        }

        providerConfig['amazon-bedrock'] = {
          options: bedrockOptions,
        };

        console.log('[OpenCode Config] Bedrock configured from legacy settings:', bedrockOptions);
      } catch (e) {
        console.warn('[OpenCode Config] Failed to parse Bedrock credentials:', e);
      }
    }
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
  } else {
    // Legacy fallback: use old LM Studio config if it exists
    const lmstudioConfig = getLMStudioConfig();
    if (lmstudioConfig?.enabled && lmstudioConfig.models && lmstudioConfig.models.length > 0) {
      const lmstudioModels: Record<string, LMStudioProviderModelConfig> = {};
      for (const model of lmstudioConfig.models) {
        lmstudioModels[model.id] = {
          name: model.name,
          tools: model.toolSupport === 'supported',
        };
      }

      providerConfig.lmstudio = {
        npm: '@ai-sdk/openai-compatible',
        name: 'LM Studio',
        options: {
          baseURL: `${lmstudioConfig.baseUrl}/v1`,
        },
        models: lmstudioModels,
      };

      console.log('[OpenCode Config] LM Studio configured from legacy settings:', Object.keys(lmstudioModels));
    }
  }

  // Configure Azure Foundry if connected (check new settings first, then legacy)
  const azureFoundryProvider = providerSettings.connectedProviders['azure-foundry'];
  if (azureFoundryProvider?.connectionStatus === 'connected' && azureFoundryProvider.credentials.type === 'azure-foundry') {
    const creds = azureFoundryProvider.credentials;
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

      console.log('[OpenCode Config] Azure Foundry configured from new settings:', {
        deployment: creds.deploymentName,
        authMethod: creds.authMethod,
      });
    }
  } else {
    // TODO: Remove legacy Azure Foundry config support in v0.4.0
    // Legacy fallback: use old Azure Foundry config
    const { getAzureFoundryConfig } = await import('../store/appSettings');
    const azureFoundryConfig = getAzureFoundryConfig();
    if (azureFoundryConfig?.enabled && activeModel?.provider === 'azure-foundry') {
      const config = await buildAzureFoundryProviderConfig(
        azureFoundryConfig.baseUrl,
        azureFoundryConfig.deploymentName || 'default',
        azureFoundryConfig.authType,
        azureFoundryToken
      );

      if (config) {
        providerConfig['azure-foundry'] = config;

        if (!enabledProviders.includes('azure-foundry')) {
          enabledProviders.push('azure-foundry');
        }

        console.log('[OpenCode Config] Azure Foundry configured from legacy settings:', {
          deployment: azureFoundryConfig.deploymentName,
          authType: azureFoundryConfig.authType,
        });
      }
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

  const tsxCommand = resolveBundledTsxCommand(skillsPath);
  console.log('[OpenCode Config] MCP build marker: edited by codex');

  // For Bedrock, set model and small_model to the same value in order to prevent the model from using 
  // Haiku by default since anthropic via bedrock require an approval form to use it: https://docs.aws.amazon.com/bedrock/latest/userguide/model-access.html
  const bedrockModelConfig: { model?: string; small_model?: string } = {};
  if (activeModel?.provider === 'bedrock' && activeModel.model) {
    bedrockModelConfig.model = activeModel.model;
    bedrockModelConfig.small_model = activeModel.model;
    console.log('[OpenCode Config] Bedrock model config:', bedrockModelConfig);
  }

  const config: OpenCodeConfig = {
    $schema: 'https://opencode.ai/config.json',
    ...bedrockModelConfig,
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
        prompt: systemPrompt,
        mode: 'primary',
      },
    },
    // MCP servers for additional tools
    // Timeout set to 30000ms to handle slow npx startup on Windows
    mcp: {
      'file-permission': {
        type: 'local',
        command: resolveSkillCommand(
          tsxCommand,
          skillsPath,
          'file-permission',
          'src/index.ts',
          'dist/index.mjs'
        ),
        enabled: true,
        environment: {
          PERMISSION_API_PORT: String(PERMISSION_API_PORT),
        },
        timeout: 30000,
      },
      'ask-user-question': {
        type: 'local',
        command: resolveSkillCommand(
          tsxCommand,
          skillsPath,
          'ask-user-question',
          'src/index.ts',
          'dist/index.mjs'
        ),
        enabled: true,
        environment: {
          QUESTION_API_PORT: String(QUESTION_API_PORT),
        },
        timeout: 30000,
      },
      'dev-browser-mcp': {
        type: 'local',
        command: resolveSkillCommand(
          tsxCommand,
          skillsPath,
          'dev-browser-mcp',
          'src/index.ts',
          'dist/index.mjs'
        ),
        enabled: true,
        timeout: 30000,
      },
      // Provides complete_task tool - agent must call to signal task completion
      'complete-task': {
        type: 'local',
        command: resolveSkillCommand(
          tsxCommand,
          skillsPath,
          'complete-task',
          'src/index.ts',
          'dist/index.mjs'
        ),
        enabled: true,
        timeout: 30000,
      },
    },
  };

  // Write config file
  const configJson = JSON.stringify(config, null, 2);
  fs.writeFileSync(configPath, configJson);

  // Set environment variables for OpenCode to find the config
  process.env.OPENCODE_CONFIG = configPath;

  // Set OPENCODE_CONFIG_DIR to the writable config directory, not resourcesPath
  // resourcesPath is read-only on mounted DMGs (macOS) and protected on Windows (Program Files).
  // This causes EROFS/EPERM errors when OpenCode tries to write package.json there.
  // MCP servers are configured with explicit paths, so we don't need skills discovery via OPENCODE_CONFIG_DIR.
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

/**
 * Get the path to OpenCode CLI's auth.json
 * OpenCode stores credentials in ~/.local/share/opencode/auth.json
 */
export function getOpenCodeAuthPath(): string {
  const homeDir = app.getPath('home');
  if (process.platform === 'win32') {
    return path.join(homeDir, 'AppData', 'Local', 'opencode', 'auth.json');
  }
  return path.join(homeDir, '.local', 'share', 'opencode', 'auth.json');
}

/**
 * Sync API keys from Openwork's secure storage to OpenCode CLI's auth.json
 * This allows OpenCode CLI to recognize DeepSeek and Z.AI providers
 */
export async function syncApiKeysToOpenCodeAuth(): Promise<void> {
  const { getAllApiKeys } = await import('../store/secureStorage');
  const apiKeys = await getAllApiKeys();

  const authPath = getOpenCodeAuthPath();
  const authDir = path.dirname(authPath);

  // Ensure directory exists
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
  }

  // Read existing auth.json or create empty object
  let auth: Record<string, { type: string; key: string }> = {};
  if (fs.existsSync(authPath)) {
    try {
      auth = JSON.parse(fs.readFileSync(authPath, 'utf-8'));
    } catch (e) {
      console.warn('[OpenCode Auth] Failed to parse existing auth.json, creating new one');
      auth = {};
    }
  }

  let updated = false;

  // Sync DeepSeek API key
  if (apiKeys.deepseek) {
    if (!auth['deepseek'] || auth['deepseek'].key !== apiKeys.deepseek) {
      auth['deepseek'] = { type: 'api', key: apiKeys.deepseek };
      updated = true;
      console.log('[OpenCode Auth] Synced DeepSeek API key');
    }
  }

  // Sync Z.AI Coding Plan API key (maps to 'zai-coding-plan' provider in OpenCode CLI)
  if (apiKeys.zai) {
    if (!auth['zai-coding-plan'] || auth['zai-coding-plan'].key !== apiKeys.zai) {
      auth['zai-coding-plan'] = { type: 'api', key: apiKeys.zai };
      updated = true;
      console.log('[OpenCode Auth] Synced Z.AI Coding Plan API key');
    }
  }

  // Sync MiniMax API key
  if (apiKeys.minimax) {
    if (!auth.minimax || auth.minimax.key !== apiKeys.minimax) {
      auth.minimax = { type: 'api', key: apiKeys.minimax };
      updated = true;
      console.log('[OpenCode Auth] Synced MiniMax API key');
    }
  }

  // Write updated auth.json
  if (updated) {
    fs.writeFileSync(authPath, JSON.stringify(auth, null, 2));
    console.log('[OpenCode Auth] Updated auth.json at:', authPath);
  }
}
