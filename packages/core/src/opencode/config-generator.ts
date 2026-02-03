import path from 'path';
import fs from 'fs';
import type { ProviderId, Skill } from '@accomplish/shared';

/**
 * Agent name used by Accomplish
 */
export const ACCOMPLISH_AGENT_NAME = 'accomplish';

/**
 * Configuration options for generating OpenCode config
 */
export interface ConfigGeneratorOptions {
  /** Operating system platform */
  platform: NodeJS.Platform;
  /** Path to MCP tools directory */
  mcpToolsPath: string;
  /** Active provider and model */
  provider?: {
    id: ProviderId;
    model: string;
    baseUrl?: string;
  };
  /** API key for the active provider (if needed) */
  apiKey?: string;
  /** Enabled skills to include in system prompt */
  skills?: Skill[];
  /** Path to bundled Node.js bin directory */
  bundledNodeBinPath?: string;
  /** Path to bundled tsx command */
  bundledTsxPath?: string;
  /** Whether the app is packaged (production) */
  isPackaged: boolean;
  /** Custom provider configurations */
  providerConfigs?: ProviderConfig[];
  /** Azure Foundry Entra ID token (if using Azure with Entra ID auth) */
  azureFoundryToken?: string;
  /** Permission API port for file permissions */
  permissionApiPort?: number;
  /** Question API port for user questions */
  questionApiPort?: number;
  /** Path to user data directory for config file storage */
  userDataPath: string;
  /** Model override (e.g., for Bedrock which uses same model for both) */
  model?: string;
  /** Small model override (e.g., for Bedrock which uses same model for both) */
  smallModel?: string;
  /** List of enabled provider IDs (if not provided, uses defaults) */
  enabledProviders?: string[];
}

/**
 * Provider configuration for custom/local providers
 */
export interface ProviderConfig {
  id: string;
  npm: string;
  name: string;
  /** Provider-specific options (e.g., baseURL for OpenAI-compatible, region/profile for Bedrock) */
  options: Record<string, unknown>;
  models: Record<string, ProviderModelConfig>;
}

export interface ProviderModelConfig {
  name: string;
  tools?: boolean;
  limit?: {
    context?: number;
    output?: number;
  };
  options?: Record<string, unknown>;
}

/**
 * Generated OpenCode configuration
 */
export interface GeneratedConfig {
  /** System prompt for the agent */
  systemPrompt: string;
  /** MCP server configurations */
  mcpServers: Record<string, McpServerConfig>;
  /** Environment variables to set */
  environment: Record<string, string>;
  /** Full config object ready to write */
  config: OpenCodeConfigFile;
  /** Path where config was written */
  configPath: string;
}

interface McpServerConfig {
  type?: 'local' | 'remote';
  command?: string[];
  url?: string;
  enabled?: boolean;
  environment?: Record<string, string>;
  timeout?: number;
}

interface AgentConfig {
  description?: string;
  prompt?: string;
  mode?: 'primary' | 'subagent' | 'all';
}

interface OpenCodeConfigFile {
  $schema?: string;
  model?: string;
  small_model?: string;
  default_agent?: string;
  enabled_providers?: string[];
  permission?: string | Record<string, string | Record<string, string>>;
  agent?: Record<string, AgentConfig>;
  mcp?: Record<string, McpServerConfig>;
  provider?: Record<string, Omit<ProviderConfig, 'id'>>;
  plugin?: string[];
}

/**
 * Build platform-specific environment setup instructions
 */
function getPlatformEnvironmentInstructions(platform: NodeJS.Platform): string {
  if (platform === 'win32') {
    return `<environment>
**You are running on Windows.** Use Windows-compatible commands:
- Use PowerShell syntax, not bash/Unix syntax
- Use \`$env:TEMP\` for temp directory (not /tmp)
- Use semicolon (;) for PATH separator (not colon)
- Use \`$env:VAR\` for environment variables (not $VAR)
</environment>`;
  } else {
    return `<environment>
You are running on ${platform === 'darwin' ? 'macOS' : 'Linux'}.
</environment>`;
  }
}

/**
 * Base system prompt template for the Accomplish agent.
 */
const ACCOMPLISH_SYSTEM_PROMPT_TEMPLATE = `<identity>
You are Accomplish, a browser automation assistant.
</identity>

{{ENVIRONMENT_INSTRUCTIONS}}

<behavior name="task-planning">
##############################################################################
# CRITICAL: PLAN FIRST WITH start_task - THIS IS MANDATORY
##############################################################################

**STEP 1: CALL start_task (before any other action)**

You MUST call start_task before any other tool. This is enforced - other tools will fail until start_task is called.

start_task requires:
- original_request: Echo the user's request exactly as stated
- goal: What you aim to accomplish
- steps: Array of planned actions to achieve the goal
- verification: Array of how you will verify the task is complete
- skills: Array of relevant skill names from <available-skills> (or empty [] if none apply)

**STEP 2: UPDATE TODOS AS YOU PROGRESS**

As you complete each step, call \`todowrite\` to update progress:
- Mark completed steps as "completed"
- Mark the current step as "in_progress"
- Keep the same step content - do NOT change the text

\`\`\`json
{
  "todos": [
    {"id": "1", "content": "First step (same as before)", "status": "completed", "priority": "high"},
    {"id": "2", "content": "Second step (same as before)", "status": "in_progress", "priority": "medium"},
    {"id": "3", "content": "Third step (same as before)", "status": "pending", "priority": "medium"}
  ]
}
\`\`\`

**STEP 3: COMPLETE ALL TODOS BEFORE FINISHING**

All todos must be "completed" or "cancelled" before calling complete_task.

WRONG: Starting work without calling start_task first
WRONG: Forgetting to update todos as you progress
CORRECT: Call start_task FIRST, update todos as you work, then complete_task

##############################################################################
</behavior>

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
See the ask-user-question MCP tool for full documentation and examples.
</important>

<behavior>
- Use AskUserQuestion tool for clarifying questions before starting ambiguous tasks
- **NEVER use shell commands (open, xdg-open, start, subprocess, webbrowser) to open browsers or URLs** - these open the user's default browser, not the automation-controlled Chrome. ALL browser operations MUST use browser_* MCP tools.
- For multi-step browser workflows, prefer \`browser_script\` over individual tools - it's faster and auto-returns page state.
- **For collecting data from multiple pages** (e.g. comparing listings, gathering info from search results), use \`browser_batch_actions\` to extract data from multiple URLs in ONE call instead of visiting each page individually with click/snapshot loops. First collect the URLs from the search results page, then pass them all to \`browser_batch_actions\` with a JS extraction script.

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

/**
 * Resolve the bundled tsx command for running MCP TypeScript servers.
 */
function resolveBundledTsxCommand(mcpToolsPath: string, platform: NodeJS.Platform): string[] {
  const tsxBin = platform === 'win32' ? 'tsx.cmd' : 'tsx';
  const candidates = [
    path.join(mcpToolsPath, 'file-permission', 'node_modules', '.bin', tsxBin),
    path.join(mcpToolsPath, 'ask-user-question', 'node_modules', '.bin', tsxBin),
    path.join(mcpToolsPath, 'dev-browser-mcp', 'node_modules', '.bin', tsxBin),
    path.join(mcpToolsPath, 'complete-task', 'node_modules', '.bin', tsxBin),
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

/**
 * Resolve the MCP command for a specific MCP server.
 */
function resolveMcpCommand(
  tsxCommand: string[],
  mcpToolsPath: string,
  mcpName: string,
  sourceRelPath: string,
  distRelPath: string,
  isPackaged: boolean,
  nodePath?: string
): string[] {
  const mcpDir = path.join(mcpToolsPath, mcpName);
  const distPath = path.join(mcpDir, distRelPath);

  if ((isPackaged || process.env.ACCOMPLISH_BUNDLED_MCP === '1') && fs.existsSync(distPath)) {
    const nodeExe = nodePath || 'node';
    console.log('[OpenCode Config] Using bundled MCP entry:', distPath);
    return [nodeExe, distPath];
  }

  const sourcePath = path.join(mcpDir, sourceRelPath);
  console.log('[OpenCode Config] Using tsx MCP entry:', sourcePath);
  return [...tsxCommand, sourcePath];
}

/**
 * Generate OpenCode configuration for the Accomplish agent.
 *
 * @param options - Configuration options
 * @returns Generated configuration
 */
export function generateConfig(options: ConfigGeneratorOptions): GeneratedConfig {
  const {
    platform,
    mcpToolsPath,
    skills = [],
    isPackaged,
    bundledNodeBinPath,
    providerConfigs = [],
    permissionApiPort = 9226,
    questionApiPort = 9227,
    userDataPath,
    model,
    smallModel,
    enabledProviders: customEnabledProviders,
  } = options;

  // Build platform-specific system prompt by replacing placeholders
  const environmentInstructions = getPlatformEnvironmentInstructions(platform);
  let systemPrompt = ACCOMPLISH_SYSTEM_PROMPT_TEMPLATE
    .replace(/\{\{ENVIRONMENT_INSTRUCTIONS\}\}/g, environmentInstructions);

  // Add skills section if enabled skills exist
  if (skills.length > 0) {
    const skillsSection = `

<available-skills>
##############################################################################
# SKILLS - Include relevant ones in your start_task call
##############################################################################

Review these skills and include any relevant ones in your start_task call's \`skills\` array.
After calling start_task, you MUST read the SKILL.md file for each skill you listed.

**Available Skills:**

${skills.map(s => `- **${s.name}** (${s.command}): ${s.description}
  File: ${s.filePath}`).join('\n\n')}

Use empty array [] if no skills apply to your task.

##############################################################################
</available-skills>
`;
    systemPrompt += skillsSection;
  }

  // Resolve tsx command
  const tsxCommand = resolveBundledTsxCommand(mcpToolsPath, platform);

  // Get node path from bundled paths
  const nodePath = bundledNodeBinPath
    ? path.join(bundledNodeBinPath, platform === 'win32' ? 'node.exe' : 'node')
    : undefined;

  // Build MCP server configurations
  const mcpServers: Record<string, McpServerConfig> = {
    'file-permission': {
      type: 'local',
      command: resolveMcpCommand(
        tsxCommand,
        mcpToolsPath,
        'file-permission',
        'src/index.ts',
        'dist/index.mjs',
        isPackaged,
        nodePath
      ),
      enabled: true,
      environment: {
        PERMISSION_API_PORT: String(permissionApiPort),
      },
      timeout: 30000,
    },
    'ask-user-question': {
      type: 'local',
      command: resolveMcpCommand(
        tsxCommand,
        mcpToolsPath,
        'ask-user-question',
        'src/index.ts',
        'dist/index.mjs',
        isPackaged,
        nodePath
      ),
      enabled: true,
      environment: {
        QUESTION_API_PORT: String(questionApiPort),
      },
      timeout: 30000,
    },
    'dev-browser-mcp': {
      type: 'local',
      command: resolveMcpCommand(
        tsxCommand,
        mcpToolsPath,
        'dev-browser-mcp',
        'src/index.ts',
        'dist/index.mjs',
        isPackaged,
        nodePath
      ),
      enabled: true,
      timeout: 30000,
    },
    'complete-task': {
      type: 'local',
      command: resolveMcpCommand(
        tsxCommand,
        mcpToolsPath,
        'complete-task',
        'src/index.ts',
        'dist/index.mjs',
        isPackaged,
        nodePath
      ),
      enabled: true,
      timeout: 30000,
    },
    'start-task': {
      type: 'local',
      command: resolveMcpCommand(
        tsxCommand,
        mcpToolsPath,
        'start-task',
        'src/index.ts',
        'dist/index.mjs',
        isPackaged,
        nodePath
      ),
      enabled: true,
      timeout: 30000,
    },
  };

  // Build provider configurations (strip id from values since it's used as the key)
  const providerConfig: Record<string, Omit<ProviderConfig, 'id'>> = {};
  for (const provider of providerConfigs) {
    const { id, ...rest } = provider;
    providerConfig[id] = rest;
  }

  // Build enabled providers list
  let enabledProviders: string[];
  if (customEnabledProviders) {
    // Use custom list if provided
    enabledProviders = [...new Set([...customEnabledProviders, ...Object.keys(providerConfig)])];
  } else {
    // Default base providers
    const baseProviders = [
      'anthropic', 'openai', 'openrouter', 'google', 'xai',
      'deepseek', 'moonshot', 'zai-coding-plan', 'amazon-bedrock', 'minimax'
    ];
    enabledProviders = [...new Set([...baseProviders, ...Object.keys(providerConfig)])];
  }

  // Build the full config
  const config: OpenCodeConfigFile = {
    $schema: 'https://opencode.ai/config.json',
    ...(model && { model }),
    ...(smallModel && { small_model: smallModel }),
    default_agent: ACCOMPLISH_AGENT_NAME,
    enabled_providers: enabledProviders,
    permission: {
      '*': 'allow',
      todowrite: 'allow',
    },
    provider: Object.keys(providerConfig).length > 0 ? providerConfig : undefined,
    plugin: ['@tarquinen/opencode-dcp@^1.2.7'],
    agent: {
      [ACCOMPLISH_AGENT_NAME]: {
        description: 'Browser automation assistant using dev-browser',
        prompt: systemPrompt,
        mode: 'primary',
      },
    },
    mcp: mcpServers,
  };

  // Determine config path and write
  const configDir = path.join(userDataPath, 'opencode');
  const configPath = path.join(configDir, 'opencode.json');

  // Ensure directory exists
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  // Write config file
  const configJson = JSON.stringify(config, null, 2);
  fs.writeFileSync(configPath, configJson);

  console.log('[OpenCode Config] Generated config at:', configPath);

  // Build environment variables
  const environment: Record<string, string> = {
    OPENCODE_CONFIG: configPath,
    OPENCODE_CONFIG_DIR: configDir,
  };

  if (bundledNodeBinPath) {
    environment.NODE_BIN_PATH = bundledNodeBinPath;
  }

  return {
    systemPrompt,
    mcpServers,
    environment,
    config,
    configPath,
  };
}

/**
 * Get the path where OpenCode config is stored.
 */
export function getOpenCodeConfigPath(userDataPath: string): string {
  return path.join(userDataPath, 'opencode', 'opencode.json');
}
