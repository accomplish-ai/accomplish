import path from 'path';
import fs from 'fs';
import { createConsoleLogger } from '../utils/logging.js';
import {
  getPlatformEnvironmentInstructions,
  ACCOMPLISH_SYSTEM_PROMPT_TEMPLATE,
} from './system-prompt.js';
import { buildMcpServers } from './generator-mcp.js';
import { formatBuiltInConnectorStatusSection } from './completion/context-providers/connector-status.js';
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
const DEFAULT_CONFIG_FILE_NAME = 'opencode.json';
const BASH_PERMISSION_POLICY = {
  '*': 'allow',
  '* > *': 'ask',
  '* >> *': 'ask',
  '* 2> *': 'ask',
  '* | tee *': 'ask',
  '* && tee *': 'ask',
  'tee *': 'ask',
  'cat > *': 'ask',
  'rm *': 'ask',
  'mv *': 'ask',
  'cp *': 'ask',
  'mkdir *': 'ask',
  'touch *': 'ask',
  'chmod *': 'ask',
  'chown *': 'ask',
  'ln *': 'ask',
  'install *': 'ask',
  'truncate *': 'ask',
  'sed -i*': 'ask',
  'python*': 'ask',
  'node *': 'ask',
  'ruby *': 'ask',
  'perl *': 'ask',
  'sh *': 'ask',
  'bash *': 'ask',
  'zsh *': 'ask',
  'osascript *': 'ask',
  'curl * -o *': 'ask',
  'curl * --output *': 'ask',
  'wget *': 'ask',
  'tar *x*': 'ask',
  'unzip *': 'ask',
  'rsync *': 'ask',
} as const;
const ACCOMPLISH_PERMISSION_POLICY = {
  bash: BASH_PERMISSION_POLICY,
  edit: 'ask',
  write: 'ask',
  patch: 'ask',
  multiedit: 'ask',
  modify: 'ask',
  delete: 'ask',
  question: 'allow',
  todowrite: 'allow',
} as const;

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

function syncPermissionPolicyIntoDefaultConfig(configDir: string, activeConfigPath: string): void {
  const defaultConfigPath = path.join(configDir, DEFAULT_CONFIG_FILE_NAME);
  if (path.resolve(defaultConfigPath) === path.resolve(activeConfigPath)) {
    return;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(defaultConfigPath, 'utf8'));
  } catch {
    return;
  }

  if (!parsed || typeof parsed !== 'object') {
    return;
  }

  const maybeConfig = parsed as { permission?: unknown };
  if (!maybeConfig.permission || typeof maybeConfig.permission !== 'object') {
    maybeConfig.permission = { ...ACCOMPLISH_PERMISSION_POLICY };
  } else {
    const permission = maybeConfig.permission as Record<string, unknown>;
    delete permission['*'];
    Object.assign(permission, ACCOMPLISH_PERMISSION_POLICY);
  }

  fs.writeFileSync(defaultConfigPath, JSON.stringify(parsed, null, 2));
  log.info(`[OpenCode Config] Synced permission policy into: ${defaultConfigPath}`);
}

export function generateConfig(options: ConfigGeneratorOptions): GeneratedConfig {
  const {
    platform,
    mcpToolsPath,
    skills = [],
    bundledNodeBinPath,
    providerConfigs = [],
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

  // Two distinct injection blocks with distinct binding strength, per the
  // PR #847 review (Codex P2): `instruction`-type notes MUST be treated as
  // mandatory persistent rules that override the default conversational-
  // bypass concise-by-default behavior, while `context`/`reference` notes
  // stay as soft workspace background.
  //
  // POSITIONING: the instructions block is PREPENDED to the top of the
  // prompt (before the base template's conversational-bypass and response-
  // style rules). Appending to the end put it at 94% of an 18KB prompt,
  // where model attention is weakest — the early rules dominated and
  // instructions were ignored. Putting it first gives user instructions
  // primacy over the default behavior rules they're meant to override.
  // Soft context stays appended (end of prompt) since it's background info,
  // not a rule.
  if (options.knowledgeInstructions) {
    const instructionsBlock = `<workspace-instructions>
##############################################################################
# MANDATORY WORKSPACE INSTRUCTIONS — MUST BE FOLLOWED
##############################################################################

The user has saved the following instructions for THIS SPECIFIC WORKSPACE.
These are PERSISTENT USER INSTRUCTIONS that apply to EVERY response in
this workspace, including:
- Short conversational replies — these instructions OVERRIDE the default
  "concise by default" / "1-3 sentences" / conversational-bypass rules
  described later in this prompt.
- Direct answers to simple questions.
- Task workflow responses.
- Tool-using multi-step tasks.

Follow each instruction below LITERALLY, on EVERY response, for the
duration of this workspace session. When two instructions conflict,
prefer the most recently added one. These instructions take precedence
over any response-style defaults in the rest of this prompt, except
where they would conflict with a higher-priority safety or system rule.

${options.knowledgeInstructions}

##############################################################################
</workspace-instructions>

`;
    systemPrompt = instructionsBlock + systemPrompt;
  }

  if (options.knowledgeContext) {
    systemPrompt += `

<workspace-knowledge>
##############################################################################
# WORKSPACE KNOWLEDGE - Persistent context for this workspace
##############################################################################

The user has saved the following background context for this workspace.
Use this information to inform your work. Do not ask the user to
re-explain anything covered here.

${options.knowledgeContext}

##############################################################################
</workspace-knowledge>
`;
  }

  if (options.builtInConnectorStatuses && options.builtInConnectorStatuses.length > 0) {
    systemPrompt += formatBuiltInConnectorStatusSection(options.builtInConnectorStatuses);
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
    // Permission policy: leave OpenCode's built-in defaults in charge of
    // normal non-mutating tools, and only add overrides for risky native file
    // writes, external-directory access, questions, and noisy bookkeeping.
    // Do not add a top-level `'*': 'allow'` here: it overrides OpenCode's
    // built-in `external_directory: ask` rule, which is the guard that catches
    // writes like `~/Desktop/kuku.txt` even when the bash permission pattern
    // itself is just `printf ...`. Bash's nested object keeps harmless commands
    // like `date` quiet while redirection, mutators, and arbitrary interpreters
    // pause for approval. `question` must be allowed so OpenCode can emit
    // `question.asked` and surface the renderer's QuestionCard; OpenCode's
    // built-in default denies it. `todowrite` is called by every agent turn to
    // update the task-plan TODO list and prompting on it would drown the user
    // in noise. Risky tools route via:
    //
    //   OpenCode → `permission.asked` → daemon.TaskCallbacks
    //     → `permission.request` RPC notify → main process
    //     → preload → renderer (PermissionCard UI)
    //     → renderer decision → `permission.respond` RPC
    //     → daemon.TaskService.sendResponse → SDK reply
    //
    // Earlier versions here had `{ '*': 'allow', todowrite: 'allow' }`, or a
    // top-level wildcard plus native-file asks. Both silently auto-authorized
    // external-directory file writes. Another version used `{ '*': 'ask', ... }`,
    // which prompted for everything including browser and webfetch actions.
    // Keep this policy narrow; see
    // `config-generator.test.ts` for the guard.
    permission: { ...ACCOMPLISH_PERMISSION_POLICY },
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
      mcp_timeout: 600000, // 10 minutes — allow long-running MCP tools
    },
  };

  const configDir = path.join(userDataPath, 'opencode');
  const configFileName = options.configFileName ?? DEFAULT_CONFIG_FILE_NAME;
  const configPath = path.join(configDir, configFileName);

  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  const configJson = JSON.stringify(config, null, 2);
  fs.writeFileSync(configPath, configJson);
  syncPermissionPolicyIntoDefaultConfig(configDir, configPath);

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
