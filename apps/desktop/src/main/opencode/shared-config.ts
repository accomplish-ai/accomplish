/**
 * Shared OpenCode configuration builder.
 *
 * This module provides the core config-building logic that can be used by both:
 * - Production (config-generator.ts) - runs inside Electron with access to keytar/SQLite
 * - Test (scripts/test-local-agent-config.ts) - runs standalone via npx tsx
 *
 * The abstraction takes dependencies as parameters instead of importing Electron-specific modules.
 */

import path from 'path';
import {
  ACCOMPLISH_SYSTEM_PROMPT_TEMPLATE,
  getPlatformEnvironmentInstructions,
  buildSystemPrompt,
} from './system-prompt';

// Re-export for convenience
export { ACCOMPLISH_SYSTEM_PROMPT_TEMPLATE, getPlatformEnvironmentInstructions, buildSystemPrompt };

/**
 * Agent name used by Accomplish
 */
export const ACCOMPLISH_AGENT_NAME = 'accomplish';

/**
 * Configuration for MCP server ports
 */
export interface PortConfig {
  permissionApi: number;
  questionApi: number;
  browserHttp: number;
  browserCdp: number;
}

/**
 * Configuration for paths
 */
export interface PathConfig {
  skillsPath: string;
  browserProfile?: string;
}

/**
 * How to resolve the command for running TypeScript MCP servers
 */
export interface CommandResolver {
  /**
   * Returns the command array for running a skill's TypeScript entry point.
   * @param skillName - Name of the skill directory (e.g., 'file-permission')
   * @param sourceRelPath - Relative path to source entry (e.g., 'src/index.ts')
   * @param distRelPath - Relative path to dist entry (e.g., 'dist/index.mjs')
   */
  resolveSkillCommand(skillName: string, sourceRelPath: string, distRelPath: string): string[];
}

/**
 * Provider configuration for the OpenCode config
 */
export interface ProviderConfig {
  npm?: string;
  name?: string;
  options?: Record<string, unknown>;
  models?: Record<string, { name: string; tools?: boolean; limit?: { context?: number; output?: number } }>;
}

/**
 * Options for building the OpenCode config
 */
export interface BuildConfigOptions {
  ports: PortConfig;
  paths: PathConfig;
  commandResolver: CommandResolver;

  /** Provider configurations (optional - production passes these from settings) */
  providers?: Record<string, ProviderConfig>;

  /** List of enabled provider names */
  enabledProviders?: string[];

  /** Model override for Bedrock (sets both model and small_model) */
  bedrockModel?: string;
}

/**
 * MCP server configuration
 */
interface McpServerConfig {
  type: 'local' | 'remote';
  command?: string[];
  url?: string;
  enabled: boolean;
  environment?: Record<string, string>;
  timeout: number;
}

/**
 * Agent configuration
 */
interface AgentConfig {
  description: string;
  prompt: string;
  mode: 'primary' | 'subagent' | 'all';
}

/**
 * Full OpenCode configuration
 */
export interface OpenCodeConfig {
  $schema: string;
  model?: string;
  small_model?: string;
  default_agent: string;
  enabled_providers: string[];
  permission: string | Record<string, string>;
  provider?: Record<string, ProviderConfig>;
  plugin?: string[];
  agent: Record<string, AgentConfig>;
  mcp: Record<string, McpServerConfig>;
}

/**
 * Build the OpenCode configuration object.
 *
 * This is the core function that both production and test use to generate
 * the same agent configuration, just with different inputs.
 */
export function buildOpenCodeConfig(options: BuildConfigOptions): OpenCodeConfig {
  const { ports, paths, commandResolver, providers, enabledProviders, bedrockModel } = options;

  // Build the system prompt with platform-specific instructions
  const systemPrompt = buildSystemPrompt();

  // Build MCP server configurations
  const mcpServers: Record<string, McpServerConfig> = {
    'file-permission': {
      type: 'local',
      command: commandResolver.resolveSkillCommand('file-permission', 'src/index.ts', 'dist/index.mjs'),
      enabled: true,
      environment: {
        PERMISSION_API_PORT: String(ports.permissionApi),
      },
      timeout: 30000,
    },
    'ask-user-question': {
      type: 'local',
      command: commandResolver.resolveSkillCommand('ask-user-question', 'src/index.ts', 'dist/index.mjs'),
      enabled: true,
      environment: {
        QUESTION_API_PORT: String(ports.questionApi),
      },
      timeout: 30000,
    },
    'dev-browser-mcp': {
      type: 'local',
      command: commandResolver.resolveSkillCommand('dev-browser-mcp', 'src/index.ts', 'dist/index.mjs'),
      enabled: true,
      environment: {
        DEV_BROWSER_PORT: String(ports.browserHttp),
        DEV_BROWSER_CDP_PORT: String(ports.browserCdp),
        ...(paths.browserProfile ? { DEV_BROWSER_PROFILE: paths.browserProfile } : {}),
      },
      timeout: 30000,
    },
    'complete-task': {
      type: 'local',
      command: commandResolver.resolveSkillCommand('complete-task', 'src/index.ts', 'dist/index.mjs'),
      enabled: true,
      timeout: 30000,
    },
  };

  // Build the config object
  const config: OpenCodeConfig = {
    $schema: 'https://opencode.ai/config.json',
    ...(bedrockModel ? { model: bedrockModel, small_model: bedrockModel } : {}),
    default_agent: ACCOMPLISH_AGENT_NAME,
    enabled_providers: enabledProviders || ['anthropic', 'openai', 'google', 'xai', 'deepseek'],
    permission: {
      '*': 'allow',
      todowrite: 'allow',
    },
    ...(providers && Object.keys(providers).length > 0 ? { provider: providers } : {}),
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

  return config;
}

/**
 * Create a simple command resolver that uses npx tsx.
 * Useful for development and test environments.
 */
export function createNpxTsxCommandResolver(skillsPath: string): CommandResolver {
  return {
    resolveSkillCommand(skillName: string, sourceRelPath: string, _distRelPath: string): string[] {
      return ['npx', 'tsx', path.join(skillsPath, skillName, sourceRelPath)];
    },
  };
}
