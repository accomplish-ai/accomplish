import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEST_LOCAL_AGENT_HTTP_PORT = 9226;
const TEST_LOCAL_AGENT_CDP_PORT = 9227;
const TEST_LOCAL_AGENT_CHROME_PROFILE = path.join(
  os.homedir(),
  '.accomplish-test-local-agent-chrome',
);

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

function getMcpToolsPath(): string {
  return path.resolve(__dirname, '..', '..', '..', 'packages', 'core', 'mcp-tools');
}

function getSystemPrompt(): string {
  const platformInstructions =
    process.platform === 'darwin'
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

export function generateTestLocalAgentConfig(): string {
  const homeDir = os.homedir();
  const configDir = path.join(homeDir, '.opencode');
  const configPath = path.join(configDir, 'opencode-test-local-agent.json');

  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  if (!fs.existsSync(TEST_LOCAL_AGENT_CHROME_PROFILE)) {
    fs.mkdirSync(TEST_LOCAL_AGENT_CHROME_PROFILE, { recursive: true });
  }

  const mcpToolsPath = getMcpToolsPath();

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
        command: ['npx', 'tsx', path.join(mcpToolsPath, 'file-permission', 'src', 'index.ts')],
        enabled: true,
        environment: {
          PERMISSION_API_PORT: String(PERMISSION_API_PORT),
        },
        timeout: 10000,
      },
      'ask-user-question': {
        type: 'local',
        command: ['npx', 'tsx', path.join(mcpToolsPath, 'ask-user-question', 'src', 'index.ts')],
        enabled: true,
        environment: {
          QUESTION_API_PORT: String(QUESTION_API_PORT),
        },
        timeout: 10000,
      },
      'dev-browser-mcp': {
        type: 'local',
        command: ['npx', 'tsx', path.join(mcpToolsPath, 'dev-browser-mcp', 'src', 'index.ts')],
        enabled: true,
        environment: {
          DEV_BROWSER_PORT: String(TEST_LOCAL_AGENT_HTTP_PORT),
          DEV_BROWSER_CDP_PORT: String(TEST_LOCAL_AGENT_CDP_PORT),
          DEV_BROWSER_PROFILE: TEST_LOCAL_AGENT_CHROME_PROFILE,
        },
        timeout: 30000,
      },
      'complete-task': {
        type: 'local',
        command: ['npx', 'tsx', path.join(mcpToolsPath, 'complete-task', 'src', 'index.ts')],
        enabled: true,
        timeout: 5000,
      },
    },
  };

  const configJson = JSON.stringify(config, null, 2);
  fs.writeFileSync(configPath, configJson);

  console.log('[test-local-agent] Config generated at:', configPath);
  console.log('[test-local-agent] Using ports:', {
    http: TEST_LOCAL_AGENT_HTTP_PORT,
    cdp: TEST_LOCAL_AGENT_CDP_PORT,
  });
  console.log('[test-local-agent] Chrome profile:', TEST_LOCAL_AGENT_CHROME_PROFILE);

  return configPath;
}

export { TEST_LOCAL_AGENT_HTTP_PORT, TEST_LOCAL_AGENT_CDP_PORT, TEST_LOCAL_AGENT_CHROME_PROFILE };

const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  generateTestLocalAgentConfig();
}
