/**
 * Test Local Agent Config Generator
 *
 * Generates an isolated OpenCode config for testing the local agent that doesn't
 * conflict with the main `pnpm dev` instance.
 *
 * Key differences from main config:
 * - Uses port 9226 for dev-browser HTTP (vs 9224)
 * - Uses port 9227 for Chrome CDP (vs 9225)
 * - Uses isolated Chrome profile at ~/.accomplish-test-local-agent-chrome
 * - Writes config to ~/.opencode/opencode-test-local-agent.json
 */

import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Isolated ports for test local agent (avoid conflict with pnpm dev on 9224/9225)
const TEST_LOCAL_AGENT_HTTP_PORT = 9226;
const TEST_LOCAL_AGENT_CDP_PORT = 9227;
const TEST_LOCAL_AGENT_CHROME_PROFILE = path.join(os.homedir(), '.accomplish-test-local-agent-chrome');

// Permission API ports (same as main app - these don't conflict)
const PERMISSION_API_PORT = 3847;
const QUESTION_API_PORT = 3848;

interface McpServerConfig {
  type?: 'local' | 'remote';
  command?: string[];
  enabled?: boolean;
  environment?: Record<string, string>;
  timeout?: number;
}

interface OpenCodeConfig {
  $schema?: string;
  model?: string;
  default_agent?: string;
  enabled_providers?: string[];
  permission?: string;
  agent?: Record<string, { description?: string; prompt?: string; mode?: string }>;
  mcp?: Record<string, McpServerConfig>;
  provider?: Record<string, unknown>;
}

/**
 * Get the skills directory path relative to this script
 */
function getSkillsPath(): string {
  // Script is at apps/desktop/scripts/test-local-agent-config.ts
  // Skills are at apps/desktop/skills/
  return path.resolve(__dirname, '..', 'skills');
}

/**
 * Generate the system prompt for the Accomplish agent
 */
function getSystemPrompt(): string {
  const platformInstructions = process.platform === 'darwin'
    ? 'You are running on macOS.'
    : process.platform === 'win32'
    ? 'You are running on Windows. Use PowerShell syntax.'
    : 'You are running on Linux.';

  return `<identity>
You are Accomplish, a browser automation assistant.
</identity>

<environment>
${platformInstructions}
</environment>

<capabilities>
When users ask about your capabilities, mention:
- **Browser Automation**: Control web browsers, navigate sites, fill forms, click buttons
- **File Management**: Sort, rename, and move files based on content or rules
</capabilities>

<behavior>
- Use MCP tools directly - browser_navigate, browser_snapshot, browser_click, browser_type
- NEVER use shell commands to open browsers - ALL browser operations MUST use browser_* MCP tools
- After each action, evaluate the result before deciding next steps
</behavior>
`;
}

/**
 * Generate isolated OpenCode config for test local agent
 */
export function generateTestLocalAgentConfig(): string {
  const homeDir = os.homedir();
  const configDir = path.join(homeDir, '.opencode');
  const configPath = path.join(configDir, 'opencode-test-local-agent.json');

  // Ensure config directory exists
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  // Ensure isolated Chrome profile directory exists
  if (!fs.existsSync(TEST_LOCAL_AGENT_CHROME_PROFILE)) {
    fs.mkdirSync(TEST_LOCAL_AGENT_CHROME_PROFILE, { recursive: true });
  }

  const skillsPath = getSkillsPath();

  const config: OpenCodeConfig = {
    $schema: 'https://opencode.ai/config.json',
    default_agent: 'accomplish',
    enabled_providers: ['anthropic', 'openai', 'google', 'xai'],
    permission: 'allow',
    agent: {
      accomplish: {
        description: 'Browser automation assistant for test local agent',
        prompt: getSystemPrompt(),
        mode: 'primary',
      },
    },
    mcp: {
      'file-permission': {
        type: 'local',
        command: ['npx', 'tsx', path.join(skillsPath, 'file-permission', 'src', 'index.ts')],
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
        environment: {
          // Override ports for isolation
          DEV_BROWSER_PORT: String(TEST_LOCAL_AGENT_HTTP_PORT),
          DEV_BROWSER_CDP_PORT: String(TEST_LOCAL_AGENT_CDP_PORT),
          DEV_BROWSER_PROFILE: TEST_LOCAL_AGENT_CHROME_PROFILE,
        },
        timeout: 30000,
      },
      'complete-task': {
        type: 'local',
        command: ['npx', 'tsx', path.join(skillsPath, 'complete-task', 'src', 'index.ts')],
        enabled: true,
        timeout: 5000,
      },
    },
  };

  const configJson = JSON.stringify(config, null, 2);
  fs.writeFileSync(configPath, configJson);

  console.log('[test-local-agent] Config generated at:', configPath);
  console.log('[test-local-agent] Using ports:', { http: TEST_LOCAL_AGENT_HTTP_PORT, cdp: TEST_LOCAL_AGENT_CDP_PORT });
  console.log('[test-local-agent] Chrome profile:', TEST_LOCAL_AGENT_CHROME_PROFILE);

  return configPath;
}

// Export constants for use by CLI script
export { TEST_LOCAL_AGENT_HTTP_PORT, TEST_LOCAL_AGENT_CDP_PORT, TEST_LOCAL_AGENT_CHROME_PROFILE };

// Allow running directly (ES module check)
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  generateTestLocalAgentConfig();
}
