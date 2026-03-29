import path from 'path';
import fs from 'fs';
import type { ProviderId } from '../common/types/providerSettings.js';
import type { Skill } from '../common/types/skills.js';
import { createConsoleLogger } from '../utils/logging.js';
import {
  getPlatformEnvironmentInstructions,
  ACCOMPLISH_SYSTEM_PROMPT_TEMPLATE,
} from './system-prompt.js';
import { buildMcpServers } from './generator-mcp.js';
export type { BrowserConfig, McpServerConfig } from './generator-mcp.js';

const log = createConsoleLogger({ prefix: 'OpenCodeConfig' });

export const ACCOMPLISH_AGENT_NAME = 'accomplish';

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
  isPackaged: boolean;
  providerConfigs?: ProviderConfig[];
  azureFoundryToken?: string;
  permissionApiPort?: number;
  questionApiPort?: number;
  /** Optional auth token for daemon API endpoints */
  authToken?: string;
  userDataPath: string;
  model?: string;
  smallModel?: string;
  enabledProviders?: string[];
  /** Browser configuration. Defaults to { mode: 'builtin' } */
  browser?: import('./generator-mcp.js').BrowserConfig;
  /** Connected MCP remote servers with OAuth access tokens */
  connectors?: Array<{
    id: string;
    name: string;
    url: string;
    accessToken: string;
  }>;
  /** Formatted workspace knowledge notes to inject into the system prompt */
  knowledgeNotes?: string;
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
  mcpServers: Record<string, import('./generator-mcp.js').McpServerConfig>;
  environment: Record<string, string>;
  config: OpenCodeConfigFile;
  configPath: string;
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
  mcp?: Record<string, import('./generator-mcp.js').McpServerConfig>;
  provider?: Record<string, Omit<ProviderConfig, 'id'>>;
  plugin?: string[];
  experimental?: Record<string, unknown>;
}

export function generateConfig(options: ConfigGeneratorOptions): GeneratedConfig {
  const {
    platform,
    mcpToolsPath,
    skills = [],
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
  let systemPrompt = ACCOMPLISH_SYSTEM_PROMPT_TEMPLATE.replace(
    /\{\{ENVIRONMENT_INSTRUCTIONS\}\}/g,
    environmentInstructions,
  );

  if (skills.length > 0) {
    const skillsSection = `

<available-skills>
##############################################################################
# SKILLS - Include relevant ones in your start_task call
##############################################################################

Review these skills and include any relevant ones in your start_task call's \`skills\` array.
After calling start_task, you MUST read the SKILL.md file for each skill you listed.

**Available Skills:**

${skills
  .map(
    (s) => `- **${s.name}** (${s.command}): ${s.description}
  File: ${s.filePath}`,
  )
  .join('\n\n')}

Use empty array [] if no skills apply to your task.

##############################################################################
</available-skills>
`;
    systemPrompt += skillsSection;
  }

  if (options.knowledgeNotes) {
    const knowledgeSection = `

<workspace-knowledge>
##############################################################################
# WORKSPACE KNOWLEDGE - Persistent context for this workspace
##############################################################################

The user has saved the following knowledge notes for this workspace.
Use this information as context for all tasks. Do not ask the user to
re-explain anything covered here.

${options.knowledgeNotes}

##############################################################################
</workspace-knowledge>
`;
    systemPrompt += knowledgeSection;
  }

  if (!bundledNodeBinPath) {
    throw new Error(
      '[OpenCode Config] Missing bundled Node.js path; cannot launch MCP tools. ' +
        'Run "pnpm -F @accomplish/desktop download:nodejs" and rebuild artifacts.',
    );
  }

  const nodeExe = path.join(bundledNodeBinPath, platform === 'win32' ? 'node.exe' : 'node');
  if (!fs.existsSync(nodeExe)) {
    throw new Error(`[OpenCode Config] Missing bundled Node.js executable: ${nodeExe}`);
  }

  const browserConfig = options.browser ?? { mode: 'builtin' as const };
  const mcpServers = buildMcpServers({
    mcpToolsPath,
    nodeExe,
    permissionApiPort,
    questionApiPort,
    browserConfig,
    connectors: options.connectors,
  });

  // Fill browser-specific template sections based on mode
  const hasBrowser = browserConfig.mode !== 'none';
  systemPrompt = systemPrompt
    .replace('{{AGENT_ROLE}}', hasBrowser ? 'browser automation' : 'task automation')
    .replace(
      '{{BROWSER_CAPABILITY}}',
      hasBrowser
        ? '- **Browser Automation**: Control web browsers, navigate sites, fill forms, click buttons\n'
        : '',
    )
    .replace(
      '{{BROWSER_BEHAVIOR}}',
      hasBrowser
        ? `- **NEVER use shell commands (open, xdg-open, start, subprocess, webbrowser) to open browsers or URLs** - these open the user's default browser, not the automation-controlled Chrome. ALL browser operations MUST use browser_* MCP tools.
- For multi-step browser workflows, prefer \`browser_script\` over individual tools - it's faster and auto-returns page state.
- **For collecting data from multiple pages** (e.g. comparing listings, gathering info from search results), use \`browser_batch_actions\` to extract data from multiple URLs in ONE call instead of visiting each page individually with click/snapshot loops. First collect the URLs from the search results page, then pass them all to \`browser_batch_actions\` with a JS extraction script.

**BROWSER ACTION VERBOSITY - Balance clarity with conciseness:**
- Provide brief, informative updates about web interactions - enough context to understand progress, but avoid excessive detail
- After navigation: briefly mention the page or what's visible if relevant
- After clicking: note what happened if it's significant (page change, form appeared, error occurred)
- After typing: only confirm if the input is important to track
- When analyzing snapshots: summarize key findings concisely
- If something unexpected happens: explain what you see and how you'll adapt

Aim for a middle ground: informative but not overly verbose. Different models have different natural verbosity levels - find a balance that's clear without being excessive.

Example balanced narration:
"Navigating to Google... Search page loaded. Searching for 'cute animals'... Results page showing animal images and links."

Example too verbose (avoid):
"I'll navigate to Google... The search page is loaded. I can see the search box. Let me search for 'cute animals'... Typing in the search field and pressing Enter... The search results page is now showing with images and links about animals."

Example too terse (avoid):
"Done." or "Navigated." or "Clicked."

- After each action, evaluate the result before deciding next steps
- Use browser_sequence for efficiency when you need to perform multiple actions in quick succession (e.g., filling a form with multiple fields)
`
        : '',
    );

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
      'anthropic',
      'openai',
      'openrouter',
      'google',
      'xai',
      'deepseek',
      'moonshot',
      'zai-coding-plan',
      'amazon-bedrock',
      'minimax',
      'venice',
    ];
    enabledProviders = [...new Set([...baseProviders, ...Object.keys(providerConfig)])];
  }

  const config: OpenCodeConfigFile = {
    $schema: 'https://opencode.ai/config.json',
    ...(model && { model }),
    ...(smallModel && { small_model: smallModel }),
    default_agent: ACCOMPLISH_AGENT_NAME,
    enabled_providers: enabledProviders,
    permission: { '*': 'allow', todowrite: 'allow' },
    provider: Object.keys(providerConfig).length > 0 ? providerConfig : undefined,
    plugin: ['@tarquinen/opencode-dcp@^2.0.0'],
    agent: {
      [ACCOMPLISH_AGENT_NAME]: {
        description: 'Browser automation assistant using dev-browser',
        prompt: systemPrompt,
        mode: 'primary',
      },
    },
    mcp: mcpServers,
    experimental: {
      mcp_timeout: 600000, // 10 minutes — allow long-running MCP tools like AskUserQuestion
    },
  };

  const configDir = path.join(userDataPath, 'opencode');
  const configPath = path.join(configDir, 'opencode.json');

  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  const configJson = JSON.stringify(config, null, 2);
  fs.writeFileSync(configPath, configJson);

  log.info(`[OpenCode Config] Generated config at: ${configPath}`);

  const environment: Record<string, string> = {
    OPENCODE_CONFIG: configPath,
    OPENCODE_CONFIG_DIR: configDir,
  };

  if (bundledNodeBinPath) {
    environment.NODE_BIN_PATH = bundledNodeBinPath;
  }

  return { systemPrompt, mcpServers, environment, config, configPath };
}

export function getOpenCodeConfigPath(userDataPath: string): string {
  return path.join(userDataPath, 'opencode', 'opencode.json');
}
