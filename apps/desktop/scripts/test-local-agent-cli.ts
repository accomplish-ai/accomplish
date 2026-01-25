#!/usr/bin/env npx tsx
/**
 * Test Local Agent CLI
 *
 * Runs OpenCode CLI tasks with isolated browser instance.
 *
 * Usage:
 *   pnpm test:local-agent "Your task prompt here"
 *   pnpm test:local-agent --model anthropic/claude-sonnet-4-20250514 "Your prompt"
 *   pnpm test:local-agent --cwd /path/to/dir "Your prompt"
 */

import { spawn, ChildProcess, execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import {
  generateTestLocalAgentConfig,
  TEST_LOCAL_AGENT_HTTP_PORT,
  TEST_LOCAL_AGENT_CDP_PORT,
  TEST_LOCAL_AGENT_CHROME_PROFILE,
} from './test-local-agent-config.js';

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ANSI colors for output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(prefix: string, message: string, color = colors.cyan): void {
  console.log(`${color}[${prefix}]${colors.reset} ${message}`);
}

function logError(message: string): void {
  console.error(`${colors.red}[error]${colors.reset} ${message}`);
}

/**
 * Parse command line arguments
 */
function parseArgs(): { prompt: string; model?: string; cwd?: string } {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
${colors.bright}Test Local Agent CLI${colors.reset}

Run OpenCode CLI tasks with isolated browser instance.

${colors.yellow}Usage:${colors.reset}
  pnpm test:local-agent "Your task prompt here"
  pnpm test:local-agent --model anthropic/claude-sonnet-4-20250514 "Your prompt"
  pnpm test:local-agent --cwd /path/to/project "Your prompt"

${colors.yellow}Options:${colors.reset}
  --model <model>   Model to use (default: anthropic/claude-sonnet-4-20250514)
  --cwd <path>      Working directory for the task
  --help, -h        Show this help message

${colors.yellow}Environment:${colors.reset}
  ANTHROPIC_API_KEY   Required. Your Anthropic API key.

${colors.yellow}Examples:${colors.reset}
  pnpm test:local-agent "List files in the current directory"
  pnpm test:local-agent "Navigate to google.com and search for cats"
  pnpm test:local-agent --cwd ~/projects/myapp "Fix the bug in main.ts"
`);
    process.exit(0);
  }

  let model: string | undefined;
  let cwd: string | undefined;
  let prompt = '';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--model' && args[i + 1]) {
      model = args[++i];
    } else if (args[i] === '--cwd' && args[i + 1]) {
      cwd = args[++i];
    } else if (!args[i].startsWith('--')) {
      prompt = args[i];
    }
  }

  if (!prompt) {
    logError('No prompt provided. Use --help for usage.');
    process.exit(1);
  }

  return { prompt, model, cwd };
}

/**
 * Check for required environment variables
 */
function checkEnvironment(): void {
  if (!process.env.ANTHROPIC_API_KEY) {
    logError('ANTHROPIC_API_KEY environment variable is required.');
    console.log(`
Set it with:
  export ANTHROPIC_API_KEY="sk-ant-..."
`);
    process.exit(1);
  }
}

/**
 * Find the OpenCode CLI path
 */
function findOpenCodeCli(): string {
  // Check node_modules/.bin first
  const localBin = path.resolve(__dirname, '..', 'node_modules', '.bin', 'opencode');
  if (fs.existsSync(localBin)) {
    return localBin;
  }

  // Check if globally installed
  try {
    const globalPath = execSync('which opencode', { encoding: 'utf-8' }).trim();
    if (globalPath && fs.existsSync(globalPath)) {
      return globalPath;
    }
  } catch {
    // Not found globally
  }

  // Try common nvm paths
  const homeDir = process.env.HOME || '';
  const nvmDir = path.join(homeDir, '.nvm', 'versions', 'node');
  if (fs.existsSync(nvmDir)) {
    const versions = fs.readdirSync(nvmDir);
    for (const version of versions) {
      const nvmPath = path.join(nvmDir, version, 'bin', 'opencode');
      if (fs.existsSync(nvmPath)) {
        return nvmPath;
      }
    }
  }

  logError('OpenCode CLI not found. Make sure opencode-ai is installed.');
  process.exit(1);
}

/**
 * Start the dev-browser server for test local agent
 */
async function startDevBrowserServer(): Promise<ChildProcess> {
  const devBrowserDir = path.resolve(__dirname, '..', 'skills', 'dev-browser');
  const serverScript = path.join(devBrowserDir, 'scripts', 'start-server.ts');

  log('test-local-agent', `Starting dev-browser server on port ${TEST_LOCAL_AGENT_HTTP_PORT}...`);

  // Run from dev-browser directory so tsconfig paths resolve correctly
  const serverProcess = spawn('npx', ['tsx', serverScript], {
    cwd: devBrowserDir,
    env: {
      ...process.env,
      DEV_BROWSER_PORT: String(TEST_LOCAL_AGENT_HTTP_PORT),
      DEV_BROWSER_CDP_PORT: String(TEST_LOCAL_AGENT_CDP_PORT),
      DEV_BROWSER_PROFILE: TEST_LOCAL_AGENT_CHROME_PROFILE,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
  });

  // Wait for server to be ready by polling the HTTP endpoint
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Dev-browser server startup timeout'));
    }, 60000); // 60s timeout for first run (Playwright may download browsers)

    serverProcess.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    serverProcess.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        clearTimeout(timeout);
        reject(new Error(`Dev-browser server exited with code ${code}`));
      }
    });

    // Poll the HTTP endpoint until it responds
    const pollInterval = 500;
    const poll = async () => {
      try {
        const response = await fetch(`http://127.0.0.1:${TEST_LOCAL_AGENT_HTTP_PORT}/`);
        if (response.ok) {
          clearTimeout(timeout);
          resolve();
          return;
        }
      } catch {
        // Server not ready yet, continue polling
      }
      setTimeout(poll, pollInterval);
    };

    // Start polling after a brief delay to let the process start
    setTimeout(poll, 500);
  });

  log('test-local-agent', 'Dev-browser server started', colors.green);
  return serverProcess;
}

/**
 * Run the OpenCode CLI
 */
async function runOpenCode(
  cliPath: string,
  configPath: string,
  prompt: string,
  model?: string,
  cwd?: string
): Promise<void> {
  const args = ['run', prompt, '--format', 'json', '--agent', 'accomplish'];

  if (model) {
    args.push('--model', model);
  }

  const workingDir = cwd || process.cwd();

  log('test-local-agent', `Working directory: ${workingDir}`);
  log('test-local-agent', `Model: ${model || 'default'}`);
  log('test-local-agent', 'Starting task...\n');

  const cliProcess = spawn(cliPath, args, {
    env: {
      ...process.env,
      OPENCODE_CONFIG: configPath,
    },
    cwd: workingDir,
    stdio: ['inherit', 'pipe', 'pipe'],
  });

  // Stream and parse output
  cliProcess.stdout?.on('data', (data: Buffer) => {
    const lines = data.toString().split('\n').filter(Boolean);
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        formatOutput(parsed);
      } catch {
        // Not JSON, print as-is
        console.log(line);
      }
    }
  });

  cliProcess.stderr?.on('data', (data: Buffer) => {
    console.error(colors.dim + data.toString() + colors.reset);
  });

  return new Promise((resolve, reject) => {
    cliProcess.on('exit', (code) => {
      if (code === 0) {
        console.log(`\n${colors.green}[test-local-agent] Task completed successfully${colors.reset}`);
        resolve();
      } else {
        console.log(`\n${colors.red}[test-local-agent] Task failed with exit code ${code}${colors.reset}`);
        reject(new Error(`Exit code ${code}`));
      }
    });

    cliProcess.on('error', reject);
  });
}

/**
 * Format OpenCode JSON output for readability
 */
function formatOutput(message: { type: string; part?: { text?: string; tool?: string; input?: unknown; output?: string } }): void {
  switch (message.type) {
    case 'text':
      if (message.part?.text) {
        console.log(`${colors.blue}[assistant]${colors.reset} ${message.part.text}`);
      }
      break;

    case 'tool_call':
    case 'tool_use':
      if (message.part?.tool) {
        const input = message.part.input ? JSON.stringify(message.part.input, null, 2) : '';
        console.log(`${colors.yellow}[tool:${message.part.tool}]${colors.reset}`);
        if (input && input !== '{}') {
          console.log(colors.dim + input + colors.reset);
        }
      }
      break;

    case 'tool_result':
      if (message.part?.output) {
        const output = message.part.output.substring(0, 500);
        console.log(`${colors.green}[result]${colors.reset} ${output}${message.part.output.length > 500 ? '...' : ''}`);
      }
      break;

    case 'step_finish':
      // Silent
      break;

    default:
      // Log unknown types for debugging
      console.log(colors.dim + JSON.stringify(message) + colors.reset);
  }
}

/**
 * Cleanup function for graceful shutdown
 */
function setupCleanup(serverProcess: ChildProcess | null): void {
  const cleanup = () => {
    log('test-local-agent', 'Cleaning up...');
    if (serverProcess && !serverProcess.killed) {
      serverProcess.kill('SIGTERM');
    }
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  console.log(`${colors.bright}Test Local Agent CLI${colors.reset}\n`);

  // Parse arguments and check environment
  const { prompt, model, cwd } = parseArgs();
  checkEnvironment();

  // Generate isolated config
  const configPath = generateTestLocalAgentConfig();

  // Find OpenCode CLI
  const cliPath = findOpenCodeCli();
  log('test-local-agent', `Using OpenCode CLI: ${cliPath}`);

  // Start dev-browser server
  let serverProcess: ChildProcess | null = null;
  try {
    serverProcess = await startDevBrowserServer();
    setupCleanup(serverProcess);

    // Run the task
    await runOpenCode(cliPath, configPath, prompt, model, cwd);
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error));
    process.exit(1);
  } finally {
    // Cleanup
    if (serverProcess && !serverProcess.killed) {
      serverProcess.kill('SIGTERM');
    }
  }
}

main().catch((error) => {
  logError(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
