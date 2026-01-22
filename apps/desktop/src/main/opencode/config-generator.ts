import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import { PERMISSION_API_PORT, QUESTION_API_PORT } from '../permission-api';
import { getOllamaConfig } from '../store/appSettings';
import { getApiKey } from '../store/secureStorage';
import { getProviderSettings, getActiveProviderModel, getConnectedProviderIds } from '../store/providerSettings';
import type { BedrockCredentials, ProviderId } from '@accomplish/shared';

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
You are Accomplish, a browser automation assistant.
</identity>

{{ENVIRONMENT_INSTRUCTIONS}}

<capabilities>
When users ask about your capabilities, mention:
- **Browser Automation**: Control web browsers, navigate sites, fill forms, click buttons
- **File Management**: Sort, rename, and move files based on content or rules you give it
</capabilities>

<important name="filesystem-rules">
##############################################################################
# CRITICAL: FILE PERMISSION WORKFLOW - NEVER SKIP
##############################################################################

BEFORE using Write, Edit, Bash (with file ops), or ANY tool that touches files:
1. FIRST: Call request_file_permission tool and wait for response
2. ONLY IF response is "allowed": Proceed with the file operation
3. IF "denied": Stop and inform the user

WRONG (never do this):
  Write({ path: "/tmp/file.txt", content: "..." })  ← NO! Permission not requested!

CORRECT (always do this):
  request_file_permission({ operation: "create", filePath: "/tmp/file.txt" })
  → Wait for "allowed"
  Write({ path: "/tmp/file.txt", content: "..." })  ← OK after permission granted

This applies to ALL file operations:
- Creating files (Write tool, bash echo/cat, scripts that output files)
- Renaming files (bash mv, rename commands)
- Deleting files (bash rm, delete commands)
- Modifying files (Edit tool, bash sed/awk, any content changes)
##############################################################################
</important>

<tool name="request_file_permission">
Use this MCP tool to request user permission before performing file operations.

<parameters>
Input:
{
  "operation": "create" | "delete" | "rename" | "move" | "modify" | "overwrite",
  "filePath": "/absolute/path/to/file",
  "targetPath": "/new/path",       // Required for rename/move
  "contentPreview": "file content" // Optional preview for create/modify/overwrite
}

Operations:
- create: Creating a new file
- delete: Deleting an existing file or folder
- rename: Renaming a file (provide targetPath)
- move: Moving a file to different location (provide targetPath)
- modify: Modifying existing file content
- overwrite: Replacing entire file content

Returns: "allowed" or "denied" - proceed only if allowed
</parameters>

<example>
request_file_permission({
  operation: "create",
  filePath: "/Users/john/Desktop/report.txt"
})
// Wait for response, then proceed only if "allowed"
</example>
</tool>

<important name="user-communication">
CRITICAL: The user CANNOT see your text output or CLI prompts!
To ask ANY question or get user input, you MUST use the AskUserQuestion MCP tool.
See the ask-user-question skill for full documentation and examples.
</important>

<behavior name="task-planning">
**TASK PLANNING - REQUIRED FOR EVERY TASK**

Before taking ANY action, you MUST first output a plan:

1. **State the goal** - What the user wants accomplished
2. **List steps with verification** - Numbered steps, each with a completion criterion

Format:
**Plan:**
Goal: [what user asked for]

Steps:
1. [Action] → verify: [how to confirm it's done]
2. [Action] → verify: [how to confirm it's done]
...

Then execute the steps. When calling \`complete_task\`:
- Review each step's verification criterion
- Only use status "success" if ALL criteria are met
- Use "partial" if some steps incomplete, list which ones in \`remaining_work\`

**Example:**
Goal: Extract analytics data from a website

Steps:
1. Navigate to URL → verify: page title contains expected text
2. Locate data section → verify: can see the target metrics
3. Extract values → verify: have captured specific numbers
4. Report findings → verify: summary includes all extracted data
</behavior>

<behavior>
- Use AskUserQuestion tool for clarifying questions before starting ambiguous tasks
- Use MCP tools directly - browser_navigate, browser_snapshot, browser_click, browser_type, browser_screenshot, browser_sequence
- **NEVER use shell commands (open, xdg-open, start, subprocess, webbrowser) to open browsers or URLs** - these open the user's default browser, not the automation-controlled Chrome. ALL browser operations MUST use browser_* MCP tools.

**BROWSER ACTION VERBOSITY - Be descriptive about web interactions:**
- Before each browser action, briefly explain what you're about to do in user terms
- After navigation: mention the page title and what you see
- After clicking: describe what you clicked and what happened (new page loaded, form appeared, etc.)
- After typing: confirm what you typed and where
- When analyzing a snapshot: describe the key elements you found
- If something unexpected happens, explain what you see and how you'll adapt

Example good narration:
"I'll navigate to Google... The search page is loaded. I can see the search box. Let me search for 'cute animals'... Typing in the search field and pressing Enter... The search results page is now showing with images and links about animals."

Example bad narration (too terse):
"Done." or "Navigated." or "Clicked."

- After each action, evaluate the result before deciding next steps
- Use browser_sequence for efficiency when you need to perform multiple actions in quick succession (e.g., filling a form with multiple fields)
- Don't announce server checks or startup - proceed directly to the task
- Only use AskUserQuestion when you genuinely need user input or decisions

**DO NOT ASK FOR PERMISSION TO CONTINUE:**
If the user gave you a task with specific criteria (e.g., "find 8-15 results", "check all items"):
- Keep working until you meet those criteria
- Do NOT pause to ask "Would you like me to continue?" or "Should I keep going?"
- Do NOT stop after reviewing just a few items when the task asks for more
- Just continue working until the task requirements are met
- Only use AskUserQuestion for genuine clarifications about requirements, NOT for progress check-ins

**TASK COMPLETION - CRITICAL:**

You MUST call the \`complete_task\` tool to finish ANY task. Never stop without calling it.

When to call \`complete_task\`:

1. **status: "success"** - You verified EVERY part of the user's request is done
   - Before calling, re-read the original request
   - Check off each requirement mentally
   - Summarize what you did for each part

2. **status: "blocked"** - You hit an unresolvable TECHNICAL blocker
   - Only use for: login walls, CAPTCHAs, rate limits, site errors, missing permissions
   - NOT for: "task is large", "many items to check", "would take many steps"
   - If the task is big but doable, KEEP WORKING - do not use blocked as an excuse to quit
   - Explain what you were trying to do
   - Describe what went wrong
   - State what remains undone in \`remaining_work\`

3. **status: "partial"** - AVOID THIS STATUS
   - Only use if you are FORCED to stop mid-task (context limit approaching, etc.)
   - The system will automatically continue you to finish the remaining work
   - If you use partial, you MUST fill in remaining_work with specific next steps
   - Do NOT use partial as a way to ask "should I continue?" - just keep working
   - If you've done some work and can keep going, KEEP GOING - don't use partial

**NEVER** just stop working. If you find yourself about to end without calling \`complete_task\`,
ask yourself: "Did I actually finish what was asked?" If unsure, keep working.

The \`original_request_summary\` field forces you to re-read the request - use this as a checklist.
</behavior>
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

interface OllamaProviderModelConfig {
  name: string;
  tools?: boolean;
}

interface OllamaProviderConfig {
  npm: string;
  name: string;
  options: {
    baseURL: string;
  };
  models: Record<string, OllamaProviderModelConfig>;
}

interface BedrockProviderConfig {
  options: {
    region: string;
    profile?: string;
  };
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

type ProviderConfig = OllamaProviderConfig | BedrockProviderConfig | OpenRouterProviderConfig | LiteLLMProviderConfig | ZaiProviderConfig;

interface OpenCodeConfig {
  $schema?: string;
  model?: string;
  default_agent?: string;
  enabled_providers?: string[];
  permission?: string | Record<string, string | Record<string, string>>;
  agent?: Record<string, AgentConfig>;
  mcp?: Record<string, McpServerConfig>;
  provider?: Record<string, ProviderConfig>;
}

/**
 * Generate OpenCode configuration file
 * OpenCode reads config from .opencode.json in the working directory or
 * from ~/.config/opencode/opencode.json
 */
export async function generateOpenCodeConfig(): Promise<string> {
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
  const filePermissionServerPath = path.join(skillsPath, 'file-permission', 'src', 'index.ts');

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
    zai: 'zai-coding-plan',
    bedrock: 'amazon-bedrock',
    ollama: 'ollama',
    openrouter: 'openrouter',
    litellm: 'litellm',
  };

  // Build enabled providers list from new settings or fall back to base providers
  const baseProviders = ['anthropic', 'openai', 'openrouter', 'google', 'xai', 'deepseek', 'zai-coding-plan', 'amazon-bedrock'];
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
      const ollamaModels: Record<string, OllamaProviderModelConfig> = {};
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

    providerConfig['zai-coding-plan'] = {
      npm: '@ai-sdk/openai-compatible',
      name: 'Z.AI Coding Plan',
      options: {
        baseURL: 'https://open.bigmodel.cn/api/paas/v4',
      },
      models: zaiModels,
    };
    console.log('[OpenCode Config] Z.AI Coding Plan provider configured with models:', Object.keys(zaiModels));
  }

  const config: OpenCodeConfig = {
    $schema: 'https://opencode.ai/config.json',
    default_agent: ACCOMPLISH_AGENT_NAME,
    // Enable all supported providers - providers auto-configure when API keys are set via env vars
    enabled_providers: enabledProviders,
    // Auto-allow all tool permissions - the system prompt instructs the agent to use
    // AskUserQuestion for user confirmations, which shows in the UI as an interactive modal.
    // CLI-level permission prompts don't show in the UI and would block task execution.
    permission: 'allow',
    provider: Object.keys(providerConfig).length > 0 ? providerConfig : undefined,
    agent: {
      [ACCOMPLISH_AGENT_NAME]: {
        description: 'Browser automation assistant using dev-browser',
        prompt: systemPrompt,
        mode: 'primary',
      },
    },
    // MCP servers for additional tools
    mcp: {
      'file-permission': {
        type: 'local',
        command: ['npx', 'tsx', filePermissionServerPath],
        enabled: true,
        environment: {
          PERMISSION_API_PORT: String(PERMISSION_API_PORT),
        },
        timeout: 10000,
      },
      'ask-user-question': {
        type: 'local',
        command: ['npx', 'tsx', path.join(skillsPath, 'ask-user-question', 'src', 'index.ts')],
        enabled: true,
        environment: {
          QUESTION_API_PORT: String(QUESTION_API_PORT),
        },
        timeout: 10000,
      },
      'dev-browser-mcp': {
        type: 'local',
        command: ['npx', 'tsx', path.join(skillsPath, 'dev-browser-mcp', 'src', 'index.ts')],
        enabled: true,
        timeout: 30000,  // Longer timeout for browser operations
      },
      // Provides complete_task tool - agent must call to signal task completion
      'complete-task': {
        type: 'local',
        command: ['npx', 'tsx', path.join(skillsPath, 'complete-task', 'src', 'index.ts')],
        enabled: true,
        timeout: 5000,
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

  // Write updated auth.json
  if (updated) {
    fs.writeFileSync(authPath, JSON.stringify(auth, null, 2));
    console.log('[OpenCode Auth] Updated auth.json at:', authPath);
  }
}
