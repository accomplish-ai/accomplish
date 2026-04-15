import path from 'path';
import fs from 'fs';
import { createConsoleLogger } from '../utils/logging.js';
import {
  getPlatformEnvironmentInstructions,
  ACCOMPLISH_SYSTEM_PROMPT_TEMPLATE,
} from './system-prompt.js';
import { buildMcpServers } from './generator-mcp.js';
export type { BrowserConfig, McpServerConfig } from './generator-mcp.js';
export type {
  ConfigGeneratorOptions,
  ProviderConfig,
  ProviderModelConfig,
  GeneratedConfig,
  AgentConfig,
  OpenCodeConfigFile,
} from './config-generator-types.js';
import type {
  ConfigGeneratorOptions,
  ProviderConfig,
  GeneratedConfig,
  OpenCodeConfigFile,
  AgentConfig,
} from './config-generator-types.js';
import { BASE_PROVIDERS, getBrowserBehaviorInstructions } from './config-generator-types.js';

const log = createConsoleLogger({ prefix: 'OpenCodeConfig' });

// LANGUAGE_DISPLAY_NAMES uses keys matching LanguagePreference (BCP-47/ISO 639-1, e.g., 'zh-CN', 'ru', 'fr').
// This list is intentionally minimal and only includes supported UI languages.
const LANGUAGE_DISPLAY_NAMES: Record<string, string> = {
  'zh-CN': '中文',
  ru: 'русский',
  fr: 'français',
};

/**
 * Generates a language instruction directive for the system prompt.
 *
 * Returns an empty string for 'auto', 'en', or unknown languages
 * (English is the model default, so no directive is needed).
 * For 'zh-CN', returns a Chinese directive. For other supported languages,
 * returns an English directive using the native display name.
 */
function getLanguageInstruction(language: string | undefined): string {
  if (!language || language === 'auto' || language === 'en') {
    return '';
  }
  // Normalize to match keys (case-sensitive, as in LanguagePreference)
  const displayName = LANGUAGE_DISPLAY_NAMES[language];
  if (!displayName) {
    return '';
  }
  if (language === 'zh-CN') {
    return `#始终用${displayName}交流#`;
  }
  // For other supported languages, use an English template with native name
  return `Always respond in ${displayName}`;
}

export const ACCOMPLISH_AGENT_NAME = 'accomplish';

export function generateConfig(options: ConfigGeneratorOptions): GeneratedConfig {
  const {
    platform,
    mcpToolsPath,
    skills = [],
    bundledNodeBinPath,
    providerConfigs = [],
    permissionApiPort = 9226,
    questionApiPort = 9227,
    whatsappApiPort,
    userDataPath,
    model,
    smallModel,
    enabledProviders: customEnabledProviders,
    gwsAccountsManifestPath,
    gwsAccountsSummary,
  } = options;

  const environmentInstructions = getPlatformEnvironmentInstructions(platform);
  let systemPrompt = ACCOMPLISH_SYSTEM_PROMPT_TEMPLATE.replace(
    /\{\{ENVIRONMENT_INSTRUCTIONS\}\}/g,
    environmentInstructions,
  ).replace(/\{\{LANGUAGE_INSTRUCTION\}\}/g, getLanguageInstruction(options.language));

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

  if (gwsAccountsManifestPath && gwsAccountsSummary && gwsAccountsSummary.length > 0) {
    const sanitizeField = (v: string) =>
      v
        .replace(/\|/g, '\\|')
        .replace(/[\r\n]/g, ' ')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    const accountRows = gwsAccountsSummary
      .map(
        (a) =>
          `| ${sanitizeField(a.label)} | ${sanitizeField(a.email)} | ${sanitizeField(a.status)} |`,
      )
      .join('\n');
    const gwsSection = `

<google-workspace-accounts>
##############################################################################
# CONNECTED GOOGLE ACCOUNTS
##############################################################################

The user has connected the following Google accounts. Use the appropriate
account when performing Gmail or Calendar operations.

| Label | Email | Status |
|-------|-------|--------|
${accountRows}

**Routing rules:**
- For read operations (list, search, get, free-time): omit the \`account\` parameter to
  query ALL accounts simultaneously.
- For write operations (send, reply, create, update, delete): ALWAYS specify
  the \`account\` parameter. If the user does not specify which account to use,
  ask them before proceeding. Never guess.
- Address accounts by their Label (e.g. "Work") or full email address.
- If an account status is "expired", instruct the user to reconnect it in
  Settings → Integrations → Google Accounts.
- Do NOT fall back to browser automation when these MCP tools are available.

**Available Google Workspace tools:**
- \`google_gmail\` — Send, read, and manage Gmail messages (accepts \`account\`)
- \`google_calendar\` — Create, list, and update Calendar events (accepts \`account\`)
- \`google_sheets\` — Create/read/write Sheets spreadsheets (accepts \`account\`)
- \`google_docs\` — Create/read/write Docs documents (accepts \`account\`)
- \`google_slides\` — Create/read/write Slides presentations (accepts \`account\`)
- \`request_google_file_picker\` — Request access to Drive files (accepts \`account\`).
  Provide a \`query\` to search for already-accessible files first. If found, returns
  metadata directly without interrupting the user. If not found, pauses the task
  for the user to select files via the Google Picker.

##############################################################################
</google-workspace-accounts>
`;
    systemPrompt += gwsSection;
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
    whatsappApiPort,
    browserConfig,
    authToken: options.authToken,
    connectors: options.connectors,
    gwsAccountsManifestPath,
  });

  const hasBrowser = browserConfig.mode !== 'none';
  systemPrompt = systemPrompt
    .replace('{{AGENT_ROLE}}', hasBrowser ? 'browser automation' : 'task automation')
    .replace(
      '{{BROWSER_CAPABILITY}}',
      hasBrowser
        ? '- **Browser Automation**: Control web browsers, navigate sites, fill forms, click buttons\n'
        : '',
    )
    .replace('{{BROWSER_BEHAVIOR}}', hasBrowser ? getBrowserBehaviorInstructions() : '');

  const providerConfig: Record<string, Omit<ProviderConfig, 'id'>> = {};
  for (const provider of providerConfigs) {
    const { id, ...rest } = provider;
    providerConfig[id] = rest;
  }

  let enabledProviders: string[];
  if (customEnabledProviders) {
    enabledProviders = [...new Set([...customEnabledProviders, ...Object.keys(providerConfig)])];
  } else {
    enabledProviders = [...new Set([...BASE_PROVIDERS, ...Object.keys(providerConfig)])];
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
      } as AgentConfig,
    },
    mcp: mcpServers,
    experimental: {
      mcp_timeout: 600000, // 10 minutes — allow long-running MCP tools like AskUserQuestion
    },
  };

  const configDir = path.join(userDataPath, 'opencode');
  const configFileName = options.configFileName ?? 'opencode.json';
  const configPath = path.join(configDir, configFileName);

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
