import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import { PERMISSION_API_PORT, QUESTION_API_PORT } from '../permission-api';
import { getOllamaConfig, getLiteLLMConfig } from '../store/appSettings';
import { getApiKey } from '../store/secureStorage';
import type { BedrockCredentials } from '@accomplish/shared';

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

const ACCOMPLISH_SYSTEM_PROMPT_TEMPLATE = `<identity>
You are Accomplish, a browser automation assistant.
</identity>

<environment>
This app bundles Node.js. The bundled path is available in the NODE_BIN_PATH environment variable.
Before running node/npx/npm commands, prepend it to PATH:

PATH="\${NODE_BIN_PATH}:\$PATH" npx tsx script.ts

Never assume Node.js is installed system-wide. Always use the bundled version.
</environment>

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

EXCEPTION: Temp scripts in /tmp/accomplish-*.mts for browser automation are auto-allowed.
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

<skill name="dev-browser">
Browser automation using MCP tools. Use these tools directly for web automation tasks.

<tools>
**browser_navigate(url, page_name?)** - Navigate to a URL
- url: The URL to visit (e.g., "google.com" or "https://example.com")
- page_name: Optional name for the page (default: "main")

**browser_snapshot(page_name?)** - Get the page's accessibility tree
- Returns YAML with element refs like [ref=e5]
- Use these refs with browser_click and browser_type

**browser_click(x?, y?, ref?, selector?, page_name?)** - Click on the page
- x, y: Pixel coordinates (default method)
- ref: Element ref from browser_snapshot (alternative)
- selector: CSS selector (alternative)

**browser_type(ref?, selector?, text, press_enter?, page_name?)** - Type into an input
- ref: Element ref from browser_snapshot (preferred)
- selector: CSS selector as fallback
- text: The text to type
- press_enter: Set to true to press Enter after typing

**browser_screenshot(page_name?, full_page?)** - Take a screenshot
- Returns the image for visual inspection
- full_page: Set to true for full scrollable page

**browser_evaluate(script, page_name?)** - Run custom JavaScript
- script: Plain JavaScript code (no TypeScript)

**browser_pages(action, page_name?)** - Manage pages
- action: "list" to see all pages, "close" to close a page
</tools>

<workflow>
1. **Navigate**: \`browser_navigate("google.com")\`
2. **Discover elements**: \`browser_snapshot()\` - find refs like [ref=e5]
3. **Interact**: \`browser_click(ref="e5")\` or \`browser_type(ref="e3", text="search query", press_enter=true)\`
4. **Verify**: \`browser_screenshot()\` to see the result
</workflow>

<example name="google-search">
1. browser_navigate(url="google.com")
2. browser_snapshot() -> find search box [ref=e12]
3. browser_type(ref="e12", text="cute animals", press_enter=true)
4. browser_screenshot() -> see search results
</example>

<login-pages>
When you encounter a login page (e.g., Google Sign-In, OAuth screens, authentication prompts):
- Do NOT say you cannot log in or suggest alternative approaches
- Instead, ASK the user to log in manually in the browser window
- Take a screenshot to show the user the login page
- Say something like: "I've reached a login page. Please log in to your account in the browser window, then let me know when you're done."
- WAIT for the user to confirm they've logged in before continuing
- After the user confirms login, take another screenshot to verify you're past the login screen
- Then continue with the original task

This interactive login flow is essential because:
- Users expect to authenticate themselves for security
- Many services require human verification (CAPTCHAs, 2FA)
- The agent should not give up on tasks that require authentication
</login-pages>

<filesystem>
For saving/downloading content:
- Use browser's native download (click download buttons, Save As)
- Chrome handles downloads with its own permissions
- For text/data, copy to clipboard so users can paste where they want
</filesystem>
</skill>

<important name="user-communication">
CRITICAL: The user CANNOT see your text output or CLI prompts!
To ask ANY question or get user input, you MUST use the AskUserQuestion MCP tool.
See the ask-user-question skill for full documentation and examples.
</important>


<behavior>
- Use AskUserQuestion tool for clarifying questions before starting ambiguous tasks
- Use MCP tools directly - browser_navigate, browser_snapshot, browser_click, browser_type, browser_screenshot
- After each action, evaluate the result before deciding next steps
- Be concise - don't narrate every internal action
- Hide implementation details - describe actions in user terms
- For multi-step tasks, summarize at the end rather than narrating each step
- Don't announce server checks or startup - proceed directly to the task
- Only speak to the user when you have meaningful results or need input
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

type ProviderConfig = OllamaProviderConfig | BedrockProviderConfig | OpenRouterProviderConfig | LiteLLMProviderConfig;

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
  const systemPrompt = ACCOMPLISH_SYSTEM_PROMPT_TEMPLATE;

  // Get OpenCode config directory (parent of skills/) for OPENCODE_CONFIG_DIR
  const openCodeConfigDir = getOpenCodeConfigDir();

  console.log('[OpenCode Config] Skills path:', skillsPath);
  console.log('[OpenCode Config] OpenCode config dir:', openCodeConfigDir);

  // Build file-permission MCP server command
  const filePermissionServerPath = path.join(skillsPath, 'file-permission', 'src', 'index.ts');

  // Enable providers - add ollama and litellm if configured
  const ollamaConfig = getOllamaConfig();
  const litellmConfig = getLiteLLMConfig();
  const baseProviders = ['anthropic', 'openai', 'openrouter', 'google', 'xai', 'deepseek', 'zai-coding-plan', 'amazon-bedrock'];
  let enabledProviders = [...baseProviders];
  if (ollamaConfig?.enabled) {
    enabledProviders.push('ollama');
  }
  if (litellmConfig?.enabled) {
    enabledProviders.push('litellm');
  }

  // Build provider configurations
  const providerConfig: Record<string, ProviderConfig> = {};

  // Add Ollama provider configuration if enabled
  if (ollamaConfig?.enabled && ollamaConfig.models && ollamaConfig.models.length > 0) {
    const ollamaModels: Record<string, OllamaProviderModelConfig> = {};
    for (const model of ollamaConfig.models) {
      ollamaModels[model.id] = {
        name: model.displayName,
        tools: true,  // Enable tool calling for all models
      };
    }

    providerConfig.ollama = {
      npm: '@ai-sdk/openai-compatible',
      name: 'Ollama (local)',
      options: {
        baseURL: `${ollamaConfig.baseUrl}/v1`,  // OpenAI-compatible endpoint
      },
      models: ollamaModels,
    };

    console.log('[OpenCode Config] Ollama provider configured with models:', Object.keys(ollamaModels));
  }

  // Add OpenRouter provider configuration if API key is set
  const openrouterKey = getApiKey('openrouter');
  if (openrouterKey) {
    // Get the selected model to configure OpenRouter
    const { getSelectedModel } = await import('../store/appSettings');
    const selectedModel = getSelectedModel();

    const openrouterModels: Record<string, OpenRouterProviderModelConfig> = {};

    // If a model is selected via OpenRouter, add it to the config
    if (selectedModel?.provider === 'openrouter' && selectedModel.model) {
      // Extract model ID from full ID (e.g., "openrouter/anthropic/claude-3.5-sonnet" -> "anthropic/claude-3.5-sonnet")
      const modelId = selectedModel.model.replace('openrouter/', '');
      openrouterModels[modelId] = {
        name: modelId,
        tools: true,
      };
    }

    // Only configure OpenRouter if we have at least one model
    if (Object.keys(openrouterModels).length > 0) {
      providerConfig.openrouter = {
        npm: '@ai-sdk/openai-compatible',
        name: 'OpenRouter',
        options: {
          baseURL: 'https://openrouter.ai/api/v1',
        },
        models: openrouterModels,
      };
      console.log('[OpenCode Config] OpenRouter provider configured with model:', Object.keys(openrouterModels));
    }
  }

  // Add Bedrock provider configuration if credentials are stored
  const bedrockCredsJson = getApiKey('bedrock');
  if (bedrockCredsJson) {
    try {
      const creds = JSON.parse(bedrockCredsJson) as BedrockCredentials;

      const bedrockOptions: BedrockProviderConfig['options'] = {
        region: creds.region || 'us-east-1',
      };

      // Only add profile if using profile mode
      if (creds.authType === 'profile' && creds.profileName) {
        bedrockOptions.profile = creds.profileName;
      }

      providerConfig['amazon-bedrock'] = {
        options: bedrockOptions,
      };

      console.log('[OpenCode Config] Bedrock provider configured:', bedrockOptions);
    } catch (e) {
      console.warn('[OpenCode Config] Failed to parse Bedrock credentials:', e);
    }
  }

  // Add LiteLLM provider configuration if enabled
  if (litellmConfig?.enabled && litellmConfig.baseUrl) {
    // Get the selected model to configure LiteLLM
    const { getSelectedModel } = await import('../store/appSettings');
    const selectedModel = getSelectedModel();

    const litellmModels: Record<string, LiteLLMProviderModelConfig> = {};

    // If a model is selected via LiteLLM, add it to the config
    if (selectedModel?.provider === 'litellm' && selectedModel.model) {
      // Extract model ID from full ID (e.g., "litellm/openai/gpt-4" -> "openai/gpt-4")
      const modelId = selectedModel.model.replace('litellm/', '');
      litellmModels[modelId] = {
        name: modelId,
        tools: true,
      };
    }

    // Only configure LiteLLM if we have at least one model
    if (Object.keys(litellmModels).length > 0) {
      // Get LiteLLM API key if configured
      const litellmApiKey = getApiKey('litellm');
      
      const litellmOptions: LiteLLMProviderConfig['options'] = {
        baseURL: `${litellmConfig.baseUrl}/v1`,
      };
      
      // Add API key to options if available
      if (litellmApiKey) {
        litellmOptions.apiKey = litellmApiKey;
        console.log('[OpenCode Config] LiteLLM API key configured');
      }
      
      providerConfig.litellm = {
        npm: '@ai-sdk/openai-compatible',
        name: 'LiteLLM',
        options: litellmOptions,
        models: litellmModels,
      };
      console.log('[OpenCode Config] LiteLLM provider configured with model:', Object.keys(litellmModels));
    }
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
    },
  };

  // Write config file
  const configJson = JSON.stringify(config, null, 2);
  fs.writeFileSync(configPath, configJson);

  // Set environment variables for OpenCode to find the config and skills
  process.env.OPENCODE_CONFIG = configPath;
  process.env.OPENCODE_CONFIG_DIR = openCodeConfigDir;

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
