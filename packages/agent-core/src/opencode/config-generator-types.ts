/**
 * Type definitions for config-generator.ts
 *
 * ESM module — use .js extensions on imports.
 */

import type { ProviderId } from '../common/types/providerSettings.js';
import type { Skill } from '../common/types/skills.js';

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
  /** Port for the WhatsApp HTTP API (daemon). Omit to disable the MCP tool. */
  whatsappApiPort?: number;
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
  /** UI language preference — instructs the agent to reply in the user's language */
  language?: string;
  /**
   * Custom config file name (default: 'opencode.json').
   * Use a per-task name (e.g. 'opencode-tsk_abc123.json') to prevent
   * concurrent tasks from overwriting each other's config.
   */
  configFileName?: string;
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

export interface AgentConfig {
  description?: string;
  prompt?: string;
  mode?: 'primary' | 'subagent' | 'all';
}

export interface OpenCodeConfigFile {
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

export const BASE_PROVIDERS = [
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

export function getBrowserBehaviorInstructions(): string {
  return `- **NEVER use shell commands (open, xdg-open, start, subprocess, webbrowser) to open browsers or URLs** - these open the user's default browser, not the automation-controlled Chrome. ALL browser operations MUST use browser_* MCP tools.
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
`;
}
