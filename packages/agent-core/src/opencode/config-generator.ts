import path from 'path';
import fs from 'fs';
import type { ProviderId } from '../common/types/providerSettings.js';
import type { Skill } from '../common/types/skills.js';

export const ACCOMPLISH_AGENT_NAME = 'accomplish';

export interface BrowserConfig {
  /** 'builtin' = dev-browser HTTP server (default), 'remote' = connect to CDP endpoint, 'none' = no browser */
  mode: 'builtin' | 'remote' | 'none';
  /** For 'remote': the CDP endpoint URL */
  cdpEndpoint?: string;
  /** For 'remote': auth headers (e.g. { 'X-CDP-Secret': '...' }) */
  cdpHeaders?: Record<string, string>;
  /** For 'builtin': run headless */
  headless?: boolean;
}

export interface ConfigGeneratorOptions {
  platform: NodeJS.Platform;
  mcpToolsPath: string;
  provider?: {
    id: ProviderId;
    model: string;
    baseUrl?: string;
  };
  apiKey?: string;
  skills?: Skill[];
  bundledNodeBinPath?: string;
  bundledTsxPath?: string;
  isPackaged: boolean;
  providerConfigs?: ProviderConfig[];
  azureFoundryToken?: string;
  permissionApiPort?: number;
  questionApiPort?: number;
  userDataPath: string;
  model?: string;
  smallModel?: string;
  enabledProviders?: string[];
  /** Browser configuration. Defaults to { mode: 'builtin' } */
  browser?: BrowserConfig;
  /** Connected MCP remote servers with OAuth access tokens */
  connectors?: Array<{
    id: string;
    name: string;
    url: string;
    accessToken: string;
  }>;
}

export interface ProviderConfig {
  id: string;
  npm?: string;
  name?: string;
  options: Record<string, unknown>;
  models?: Record<string, ProviderModelConfig>;
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

export interface GeneratedConfig {
  systemPrompt: string;
  mcpServers: Record<string, McpServerConfig>;
  environment: Record<string, string>;
  config: OpenCodeConfigFile;
  configPath: string;
}

interface McpServerConfig {
  type?: 'local' | 'remote';
  command?: string[];
  url?: string;
  headers?: Record<string, string>;
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

const ACCOMPLISH_SYSTEM_PROMPT_TEMPLATE = `<identity>
You are Accomplish, a {{AGENT_ROLE}} assistant.
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
{{BROWSER_CAPABILITY}}- **File Management**: Sort, rename, and move files based on content or rules you give it
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
{{BROWSER_BEHAVIOR}}- Don't announce server checks or startup - proceed directly to the task
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
  const sourcePath = path.join(mcpDir, sourceRelPath);
  const distPath = path.join(mcpDir, distRelPath);

  // Use compiled dist entry when packaged OR when source files don't exist
  // (e.g. agent-core installed from npm where only dist/ is published)
  if ((isPackaged || !fs.existsSync(sourcePath)) && fs.existsSync(distPath)) {
    const nodeExe = nodePath || 'node';
    console.log('[OpenCode Config] Using bundled MCP entry:', distPath);
    return [nodeExe, distPath];
  }

  console.log('[OpenCode Config] Using tsx MCP entry:', sourcePath);
  return [...tsxCommand, sourcePath];
}

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

  const environmentInstructions = getPlatformEnvironmentInstructions(platform);
  let systemPrompt = ACCOMPLISH_SYSTEM_PROMPT_TEMPLATE
    .replace(/\{\{ENVIRONMENT_INSTRUCTIONS\}\}/g, environmentInstructions);

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

  const tsxCommand = resolveBundledTsxCommand(mcpToolsPath, platform);

  const nodePath = bundledNodeBinPath
    ? path.join(bundledNodeBinPath, platform === 'win32' ? 'node.exe' : 'node')
    : undefined;

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

  // Conditionally register dev-browser-mcp based on browser config
  const browserConfig = options.browser ?? { mode: 'builtin' };

  if (browserConfig.mode !== 'none') {
    const browserEnv: Record<string, string> = {};

    if (browserConfig.mode === 'remote') {
      if (browserConfig.cdpEndpoint) {
        browserEnv.CDP_ENDPOINT = browserConfig.cdpEndpoint;
      }
      if (browserConfig.cdpHeaders) {
        for (const [key, value] of Object.entries(browserConfig.cdpHeaders)) {
          if (key === 'X-CDP-Secret') {
            browserEnv.CDP_SECRET = value;
          }
        }
      }
    }

    mcpServers['dev-browser-mcp'] = {
      type: 'local',
      command: resolveMcpCommand(
        tsxCommand, mcpToolsPath, 'dev-browser-mcp',
        'src/index.ts', 'dist/index.mjs', isPackaged, nodePath
      ),
      enabled: true,
      ...(Object.keys(browserEnv).length > 0 && { environment: browserEnv }),
      timeout: 30000,
    };
  }

  // Add connected MCP connectors as remote servers
  if (options.connectors) {
    for (const connector of options.connectors) {
      // Use short sanitized name + ID suffix as key to prevent collisions
      const sanitized = connector.name
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 20);
      const baseName = sanitized || 'mcp-remote';
      const idSuffix = connector.id.slice(0, 6);
      let key = `connector-${baseName}-${idSuffix}`;
      // Guard against unlikely collision with existing keys
      if (mcpServers[key]) {
        let i = 1;
        while (mcpServers[`${key}-${i}`]) i += 1;
        key = `${key}-${i}`;
      }
      mcpServers[key] = {
        type: 'remote',
        url: connector.url,
        headers: { Authorization: `Bearer ${connector.accessToken}` },
        enabled: true,
      };
    }
  }

  // Fill browser-specific template sections based on mode
  const hasBrowser = browserConfig.mode !== 'none';
  systemPrompt = systemPrompt
    .replace('{{AGENT_ROLE}}', hasBrowser ? 'browser automation' : 'task automation')
    .replace('{{BROWSER_CAPABILITY}}', hasBrowser
      ? '- **Browser Automation**: Control web browsers, navigate sites, fill forms, click buttons\n'
      : '')
    .replace('{{BROWSER_BEHAVIOR}}', hasBrowser
      ? `- **NEVER use shell commands (open, xdg-open, start, subprocess, webbrowser) to open browsers or URLs** - these open the user's default browser, not the automation-controlled Chrome. ALL browser operations MUST use browser_* MCP tools.
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
`
      : '');

  const providerConfig: Record<string, Omit<ProviderConfig, 'id'>> = {};
  for (const provider of providerConfigs) {
    const { id, ...rest } = provider;
    providerConfig[id] = rest;
  }

  let enabledProviders: string[];
  if (customEnabledProviders) {
    enabledProviders = [...new Set([...customEnabledProviders, ...Object.keys(providerConfig)])];
  } else {
    const baseProviders = [
      'anthropic', 'openai', 'openrouter', 'google', 'xai',
      'deepseek', 'moonshot', 'zai-coding-plan', 'amazon-bedrock', 'minimax'
    ];
    enabledProviders = [...new Set([...baseProviders, ...Object.keys(providerConfig)])];
  }

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

  const configDir = path.join(userDataPath, 'opencode');
  const configPath = path.join(configDir, 'opencode.json');

  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  const configJson = JSON.stringify(config, null, 2);
  fs.writeFileSync(configPath, configJson);

  console.log('[OpenCode Config] Generated config at:', configPath);

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

export function getOpenCodeConfigPath(userDataPath: string): string {
  return path.join(userDataPath, 'opencode', 'opencode.json');
}

export interface BuildCliArgsOptions {
  prompt: string;
  sessionId?: string;
  selectedModel?: {
    provider: string;
    model: string;
  } | null;
}

export function buildCliArgs(options: BuildCliArgsOptions): string[] {
  const { prompt, sessionId, selectedModel } = options;

  const args: string[] = ['run'];

  // CRITICAL: JSON format required for StreamParser to parse messages
  args.push('--format', 'json');

  if (selectedModel?.model) {
    if (selectedModel.provider === 'zai') {
      const modelId = selectedModel.model.split('/').pop();
      args.push('--model', `zai-coding-plan/${modelId}`);
    } else if (selectedModel.provider === 'deepseek') {
      const modelId = selectedModel.model.split('/').pop();
      args.push('--model', `deepseek/${modelId}`);
    } else if (selectedModel.provider === 'openrouter') {
      args.push('--model', selectedModel.model);
    } else if (selectedModel.provider === 'ollama') {
      const modelId = selectedModel.model.replace(/^ollama\//, '');
      args.push('--model', `ollama/${modelId}`);
    } else if (selectedModel.provider === 'litellm') {
      const modelId = selectedModel.model.replace(/^litellm\//, '');
      args.push('--model', `litellm/${modelId}`);
    } else if (selectedModel.provider === 'lmstudio') {
      const modelId = selectedModel.model.replace(/^lmstudio\//, '');
      args.push('--model', `lmstudio/${modelId}`);
    } else if (selectedModel.provider === 'vertex') {
      // Model IDs stored as "vertex/{publisher}/{model}" — strip publisher for @ai-sdk/google-vertex
      const modelId = selectedModel.model.replace(/^vertex\/[^/]+\//, '');
      args.push('--model', `vertex/${modelId}`);
    } else {
      args.push('--model', selectedModel.model);
    }
  }

  if (sessionId) {
    args.push('--session', sessionId);
  }

  args.push('--agent', ACCOMPLISH_AGENT_NAME);

  args.push(prompt);

  return args;
}
