import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import { PERMISSION_API_PORT } from '../permission-api';
import { getOllamaConfig } from '../store/appSettings';

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
 * Get the skills directory path
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
Browser automation that maintains page state across script executions. Write small, focused scripts to accomplish tasks incrementally.

<critical-requirement>
##############################################################################
# MANDATORY: Browser scripts must use .mts extension to enable ESM mode.
# tsx treats .mts files as ES modules, enabling top-level await.
#
# CORRECT (always do this - two steps):
#   1. Write script to temp file with .mts extension:
#      cat > /tmp/accomplish-\${ACCOMPLISH_TASK_ID:-default}.mts <<'EOF'
#      import { connect } from "@/client.js";
#      ...
#      EOF
#
#   2. Run from dev-browser directory with bundled Node:
#      cd {{SKILLS_PATH}}/dev-browser && PATH="\${NODE_BIN_PATH}:\$PATH" npx tsx /tmp/accomplish-\${ACCOMPLISH_TASK_ID:-default}.mts
#
# WRONG (will fail - .ts files in /tmp default to CJS mode):
#   cat > /tmp/script.ts <<'EOF'
#   import { connect } from "@/client.js";  # Top-level await won't work!
#   EOF
#
# ALWAYS use .mts extension for temp scripts!
##############################################################################
</critical-requirement>

<setup>
The dev-browser server is automatically started when you begin a task. Before your first browser script, verify it's ready:

\`\`\`bash
curl -s http://localhost:9224
\`\`\`

If it returns JSON with a \`wsEndpoint\`, proceed with browser automation. If connection is refused, the server is still starting - wait 2-3 seconds and check again.

**Fallback** (only if server isn't running after multiple checks):
\`\`\`bash
cd {{SKILLS_PATH}}/dev-browser && PATH="\${NODE_BIN_PATH}:\$PATH" ./server.sh &
\`\`\`
</setup>

<usage>
Write scripts to /tmp with .mts extension, then execute from dev-browser directory:

<example name="basic-navigation">
\`\`\`bash
cat > /tmp/accomplish-\${ACCOMPLISH_TASK_ID:-default}.mts <<'EOF'
import { connect, waitForPageLoad } from "@/client.js";

const taskId = process.env.ACCOMPLISH_TASK_ID || 'default';
const client = await connect();
const page = await client.page(\`\${taskId}-main\`);

await page.goto("https://example.com");
await waitForPageLoad(page);

console.log({ title: await page.title(), url: page.url() });
await client.disconnect();
EOF
cd {{SKILLS_PATH}}/dev-browser && PATH="\${NODE_BIN_PATH}:\$PATH" npx tsx /tmp/accomplish-\${ACCOMPLISH_TASK_ID:-default}.mts
\`\`\`
</example>
</usage>

<principles>
1. **Small scripts**: Each script does ONE thing (navigate, click, fill, check)
2. **Evaluate state**: Log/return state at the end to decide next steps
3. **Task-scoped page names**: ALWAYS prefix page names with the task ID from environment:
   \`\`\`typescript
   const taskId = process.env.ACCOMPLISH_TASK_ID || 'default';
   const page = await client.page(\`\${taskId}-main\`);
   \`\`\`
   This ensures parallel tasks don't interfere with each other's browser pages.
4. **Task-scoped screenshot filenames**: ALWAYS prefix screenshot filenames with taskId to prevent parallel tasks from overwriting each other's screenshots:
   \`\`\`typescript
   await page.screenshot({ path: \`tmp/\${taskId}-screenshot.png\` });
   \`\`\`
5. **Disconnect to exit**: \`await client.disconnect()\` - pages persist on server
6. **Plain JS in evaluate**: \`page.evaluate()\` runs in browser - no TypeScript syntax
</principles>

<api-reference name="client">
\`\`\`typescript
const taskId = process.env.ACCOMPLISH_TASK_ID || 'default';
const client = await connect();

const page = await client.page(\`\${taskId}-main\`); // Get or create named page
const pages = await client.list(); // List all page names
await client.close(\`\${taskId}-main\`); // Close a page
await client.disconnect(); // Disconnect (pages persist)

// ARIA Snapshot methods
const snapshot = await client.getAISnapshot(\`\${taskId}-main\`); // Get accessibility tree
const element = await client.selectSnapshotRef(\`\${taskId}-main\`, "e5"); // Get element by ref
\`\`\`

The \`page\` object is a standard Playwright Page.
</api-reference>

<api-reference name="screenshots">
IMPORTANT: Always prefix screenshot filenames with taskId to avoid collisions with parallel tasks:
\`\`\`typescript
const taskId = process.env.ACCOMPLISH_TASK_ID || 'default';
await page.screenshot({ path: \`tmp/\${taskId}-screenshot.png\` });
await page.screenshot({ path: \`tmp/\${taskId}-full.png\`, fullPage: true });
\`\`\`
</api-reference>

<api-reference name="aria-snapshot">
Use \`getAISnapshot()\` to discover page elements. Returns YAML-formatted accessibility tree with refs like \`[ref=e1]\`. Then use \`selectSnapshotRef()\` to interact:

<example name="aria-snapshot-usage">
\`\`\`typescript
const taskId = process.env.ACCOMPLISH_TASK_ID || 'default';
const snapshot = await client.getAISnapshot(\`\${taskId}-main\`);
console.log(snapshot); // Find the ref you need

const element = await client.selectSnapshotRef(\`\${taskId}-main\`, "e2");
await element.click();
\`\`\`
</example>
</api-reference>

<error-recovery>
Page state persists after failures. Debug by reconnecting and taking a screenshot:

<example name="debug-screenshot">
\`\`\`bash
cat > /tmp/accomplish-\${ACCOMPLISH_TASK_ID:-default}.mts <<'EOF'
import { connect } from "@/client.js";

const taskId = process.env.ACCOMPLISH_TASK_ID || 'default';
const client = await connect();
const page = await client.page(\`\${taskId}-main\`);

await page.screenshot({ path: \`tmp/\${taskId}-debug.png\` });
console.log({ url: page.url(), title: await page.title() });

await client.disconnect();
EOF
cd {{SKILLS_PATH}}/dev-browser && PATH="\${NODE_BIN_PATH}:\$PATH" npx tsx /tmp/accomplish-\${ACCOMPLISH_TASK_ID:-default}.mts
\`\`\`
</example>
</error-recovery>

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

<important name="user-confirmations">
CRITICAL: Always use AskUserQuestion to get explicit approval before sensitive actions.
Users cannot see CLI/terminal prompts - you MUST ask through the chat interface.

<rules>
ALWAYS ask before these actions (no exceptions):
- Financial: Clicking "Buy", "Purchase", "Pay", "Subscribe", "Donate", or any payment button
- Messaging: Sending emails, messages, comments, reviews, or any communication
- Forms: Submitting forms that create accounts, place orders, or share personal data
- Deletion: Clicking "Delete", "Remove", "Cancel subscription", or any destructive action
- Posting: Publishing content, tweets, posts, or updates to any platform
- Settings: Changing account settings, passwords, or privacy options
- Sharing: Sharing content, granting permissions, or connecting accounts
</rules>

<instructions>
How to ask:
- Use AskUserQuestion tool with clear options
- Describe WHAT will happen: "This will send an email to john@example.com"
- Show the CONTENT when relevant: "Message: 'Hello, I wanted to follow up...'"
- Offer options: "Send" / "Edit first" / "Cancel"

NEVER assume intent for irreversible actions. Even if the user said "send the email",
confirm the final content before clicking send.

When in doubt, ask. A brief confirmation is better than an irreversible mistake.
</instructions>
</important>

<behavior>
- Ask clarifying questions before starting ambiguous tasks
- Write small, focused scripts - each does ONE thing
- After each script, evaluate the output before deciding next steps
- Be concise - don't narrate every internal action
- Hide implementation details - describe actions in user terms
- For multi-step tasks, summarize at the end rather than narrating each step
- Don't explain what bash commands you're running - just run them silently
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

interface OpenCodeConfig {
  $schema?: string;
  model?: string;
  default_agent?: string;
  enabled_providers?: string[];
  permission?: string | Record<string, string | Record<string, string>>;
  agent?: Record<string, AgentConfig>;
  mcp?: Record<string, McpServerConfig>;
  provider?: Record<string, OllamaProviderConfig>;
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

  // Get skills directory path and inject into system prompt
  const skillsPath = getSkillsPath();
  const systemPrompt = ACCOMPLISH_SYSTEM_PROMPT_TEMPLATE.replace(/\{\{SKILLS_PATH\}\}/g, skillsPath);

  console.log('[OpenCode Config] Skills path:', skillsPath);

  // Build file-permission MCP server command
  const filePermissionServerPath = path.join(skillsPath, 'file-permission', 'src', 'index.ts');

  // Enable providers - add ollama if configured
  const ollamaConfig = getOllamaConfig();
  const baseProviders = ['anthropic', 'openai', 'google', 'xai'];
  const enabledProviders = ollamaConfig?.enabled
    ? [...baseProviders, 'ollama']
    : baseProviders;

  // Build Ollama provider configuration if enabled
  let providerConfig: Record<string, OllamaProviderConfig> | undefined;
  if (ollamaConfig?.enabled && ollamaConfig.models && ollamaConfig.models.length > 0) {
    const ollamaModels: Record<string, OllamaProviderModelConfig> = {};
    for (const model of ollamaConfig.models) {
      ollamaModels[model.id] = {
        name: model.displayName,
        tools: true,  // Enable tool calling for all models
      };
    }

    providerConfig = {
      ollama: {
        npm: '@ai-sdk/openai-compatible',
        name: 'Ollama (local)',
        options: {
          baseURL: `${ollamaConfig.baseUrl}/v1`,  // OpenAI-compatible endpoint
        },
        models: ollamaModels,
      },
    };

    console.log('[OpenCode Config] Ollama provider configured with models:', Object.keys(ollamaModels));
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
    provider: providerConfig,
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
    },
  };

  // Write config file
  const configJson = JSON.stringify(config, null, 2);
  fs.writeFileSync(configPath, configJson);

  // Set environment variable for OpenCode to find the config
  process.env.OPENCODE_CONFIG = configPath;

  console.log('[OpenCode Config] Generated config at:', configPath);
  console.log('[OpenCode Config] Full config:', configJson);
  console.log('[OpenCode Config] OPENCODE_CONFIG env set to:', process.env.OPENCODE_CONFIG);

  return configPath;
}

/**
 * Get the path where OpenCode config is stored
 */
export function getOpenCodeConfigPath(): string {
  return path.join(app.getPath('userData'), 'opencode', 'opencode.json');
}
