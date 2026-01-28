/**
 * Eval Mode - Headless evaluation mode for CI/CD and automated testing
 *
 * Runs OpenWork tasks without UI, handles permissions programmatically,
 * and outputs structured JSON results.
 */

import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { initializeDatabase, closeDatabase } from './store/db';
import { TaskManager, TaskCallbacks, TaskProgressEvent } from './opencode/task-manager';
import { startEvalPermissionServer, startEvalQuestionServer, EvalPermissionConfig } from './eval-permission-api';
import type { OpenCodeMessage, PermissionRequest, TaskResult, TodoItem } from '@accomplish/shared';

// ============================================================================
// Exit Codes
// ============================================================================

export const EXIT_SUCCESS = 0;
export const EXIT_FAILED = 1;
export const EXIT_TIMEOUT = 2;
export const EXIT_MAX_STEPS = 3;
export const EXIT_CONFIG_ERROR = 4;
export const EXIT_RUNTIME_ERROR = 5;

// ============================================================================
// Types
// ============================================================================

export interface EvalConfig {
  task: string;
  timeout: number;           // seconds, default 300
  output: string | null;     // JSON output path or null for stdout
  workingDir: string;        // default $HOME
  provider: string | null;   // override provider
  model: string | null;      // override model
  browserStartUrl: string;   // default "about:blank"
  maxSteps: number;          // default 100
  permissionMode: string;    // "auto-approve" | "auto-deny" | "allowlist:/path"
  verbose: boolean;          // include action sequence
  sessionId: string | null;  // resume existing session
}

interface ActionRecord {
  timestamp: string;
  tool: string;
  input?: unknown;
  output?: string;
  status?: string;
}

interface PermissionRecord {
  timestamp: string;
  type: string;
  operation?: string;
  path?: string;
  approved: boolean;
}

interface EvalMetrics {
  started_at: Date;
  tokens: { input: number; output: number; total: number };
  api_calls: number;
  estimated_cost_usd: number;
  actions: {
    total: number;
    by_tool: Record<string, number>;
    sequence: ActionRecord[];
  };
  permissions: {
    requested: number;
    approved: number;
    denied: number;
    details: PermissionRecord[];
  };
}

export interface EvalOutput {
  schema_version: '1.0';
  task_id: string;
  session_id: string;

  input: {
    instruction: string;
    working_dir: string;
    browser_start_url: string;
    provider: string | null;
    model: string | null;
  };

  outcome: {
    status: 'success' | 'failed' | 'timeout' | 'interrupted' | 'error';
    exit_code: number;
    error: string | null;
  };

  timing: {
    started_at: string;
    completed_at: string;
    duration_ms: number;
    timeout_ms: number;
  };

  resources: {
    tokens: { input: number; output: number; total: number };
    api_calls: number;
    estimated_cost_usd: number;
  };

  actions: {
    total: number;
    by_tool: Record<string, number>;
    sequence: ActionRecord[];
  };

  final_state: {
    browser: { url: string | null; title: string | null };
    agent_response: string;
  };

  permissions: {
    requested: number;
    approved: number;
    denied: number;
    details: PermissionRecord[];
  };
}

// ============================================================================
// CLI Argument Parsing
// ============================================================================

/**
 * Parse command line arguments for eval mode.
 * Returns null if --eval-mode is not present.
 */
export function parseEvalArgs(argv: string[]): EvalConfig | null {
  // Check if eval mode is requested
  if (!argv.includes('--eval-mode')) {
    return null;
  }

  const config: EvalConfig = {
    task: '',
    timeout: 300,
    output: null,
    workingDir: os.homedir(),
    provider: null,
    model: null,
    browserStartUrl: 'about:blank',
    maxSteps: 100,
    permissionMode: 'auto-deny',
    verbose: false,
    sessionId: null,
  };

  // Parse arguments
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const nextArg = argv[i + 1];

    switch (arg) {
      case '--task':
        if (nextArg && !nextArg.startsWith('--')) {
          config.task = nextArg;
          i++;
        }
        break;
      case '--timeout':
        if (nextArg && !nextArg.startsWith('--')) {
          config.timeout = parseInt(nextArg, 10);
          i++;
        }
        break;
      case '--output':
        if (nextArg && !nextArg.startsWith('--')) {
          config.output = nextArg;
          i++;
        }
        break;
      case '--working-dir':
        if (nextArg && !nextArg.startsWith('--')) {
          config.workingDir = nextArg;
          i++;
        }
        break;
      case '--provider':
        if (nextArg && !nextArg.startsWith('--')) {
          config.provider = nextArg;
          i++;
        }
        break;
      case '--model':
        if (nextArg && !nextArg.startsWith('--')) {
          config.model = nextArg;
          i++;
        }
        break;
      case '--browser-start-url':
        if (nextArg && !nextArg.startsWith('--')) {
          config.browserStartUrl = nextArg;
          i++;
        }
        break;
      case '--max-steps':
        if (nextArg && !nextArg.startsWith('--')) {
          config.maxSteps = parseInt(nextArg, 10);
          i++;
        }
        break;
      case '--permission-mode':
        if (nextArg && !nextArg.startsWith('--')) {
          config.permissionMode = nextArg;
          i++;
        }
        break;
      case '--verbose':
        config.verbose = true;
        break;
      case '--session':
        if (nextArg && !nextArg.startsWith('--')) {
          config.sessionId = nextArg;
          i++;
        }
        break;
    }
  }

  return config;
}

/**
 * Validate eval configuration.
 * Returns error message if invalid, null if valid.
 */
function validateConfig(config: EvalConfig): string | null {
  if (!config.task) {
    return 'Missing required argument: --task';
  }

  if (config.timeout <= 0 || isNaN(config.timeout)) {
    return 'Invalid timeout value';
  }

  if (config.maxSteps <= 0 || isNaN(config.maxSteps)) {
    return 'Invalid max-steps value';
  }

  // Validate permission mode
  const validModes = ['auto-approve', 'auto-deny'];
  if (!validModes.includes(config.permissionMode) && !config.permissionMode.startsWith('allowlist:')) {
    return `Invalid permission mode: ${config.permissionMode}. Must be 'auto-approve', 'auto-deny', or 'allowlist:/path'`;
  }

  // Validate allowlist file if specified
  if (config.permissionMode.startsWith('allowlist:')) {
    const allowlistPath = config.permissionMode.substring('allowlist:'.length);
    if (!fs.existsSync(allowlistPath)) {
      return `Allowlist file not found: ${allowlistPath}`;
    }
  }

  return null;
}

// ============================================================================
// Main Eval Mode Runner
// ============================================================================

/**
 * Run eval mode - executes a task headlessly and outputs JSON results.
 * This function never returns normally - it always calls process.exit().
 */
export async function runEvalMode(config: EvalConfig): Promise<never> {
  console.log('[Eval Mode] Starting eval mode...');

  // Use environment variables for API keys instead of secure storage
  // This enables running in containers/CI where secure storage is unavailable
  process.env.OPENWORK_PREFER_ENV_KEYS = '1';

  // Validate configuration
  const validationError = validateConfig(config);
  if (validationError) {
    console.error('[Eval Mode] Configuration error:', validationError);
    process.exit(EXIT_CONFIG_ERROR);
  }

  // Initialize metrics
  const metrics: EvalMetrics = {
    started_at: new Date(),
    tokens: { input: 0, output: 0, total: 0 },
    api_calls: 0,
    estimated_cost_usd: 0,
    actions: {
      total: 0,
      by_tool: {},
      sequence: [],
    },
    permissions: {
      requested: 0,
      approved: 0,
      denied: 0,
      details: [],
    },
  };

  // Task state
  let taskId = '';
  let sessionId = config.sessionId || '';
  let lastAgentResponse = '';
  let finalStatus: 'success' | 'failed' | 'timeout' | 'interrupted' | 'error' = 'error';
  let finalError: string | null = null;
  let exitCode = EXIT_RUNTIME_ERROR;
  let stepCount = 0;

  // Timeout handling
  let timeoutHandle: NodeJS.Timeout | null = null;
  let isTimedOut = false;

  // Initialize database (required for TaskManager)
  try {
    initializeDatabase();
  } catch (err) {
    console.error('[Eval Mode] Database initialization failed:', err);
    process.exit(EXIT_RUNTIME_ERROR);
  }

  // Parse permission mode for eval servers
  const permissionConfig: EvalPermissionConfig = {
    mode: config.permissionMode as 'auto-approve' | 'auto-deny',
    onPermissionRequest: (request) => {
      metrics.permissions.requested++;
      const approved = permissionConfig.mode === 'auto-approve';
      if (approved) {
        metrics.permissions.approved++;
      } else {
        metrics.permissions.denied++;
      }
      metrics.permissions.details.push({
        timestamp: new Date().toISOString(),
        type: request.type,
        operation: request.fileOperation,
        path: request.filePath,
        approved,
      });
    },
  };

  // Handle allowlist mode
  if (config.permissionMode.startsWith('allowlist:')) {
    const allowlistPath = config.permissionMode.substring('allowlist:'.length);
    permissionConfig.mode = allowlistPath;
  }

  // Start eval permission servers
  console.log('[Eval Mode] Starting permission servers...');
  const permissionServer = startEvalPermissionServer(permissionConfig);
  const questionServer = startEvalQuestionServer(permissionConfig);

  // Create task manager
  const taskManager = new TaskManager();

  // Helper to write output and exit
  const writeOutputAndExit = (code: number) => {
    // Clear timeout if set
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }

    // Build output
    const completedAt = new Date();
    const output: EvalOutput = {
      schema_version: '1.0',
      task_id: taskId,
      session_id: sessionId,
      input: {
        instruction: config.task,
        working_dir: config.workingDir,
        browser_start_url: config.browserStartUrl,
        provider: config.provider,
        model: config.model,
      },
      outcome: {
        status: finalStatus,
        exit_code: code,
        error: finalError,
      },
      timing: {
        started_at: metrics.started_at.toISOString(),
        completed_at: completedAt.toISOString(),
        duration_ms: completedAt.getTime() - metrics.started_at.getTime(),
        timeout_ms: config.timeout * 1000,
      },
      resources: {
        tokens: metrics.tokens,
        api_calls: metrics.api_calls,
        estimated_cost_usd: metrics.estimated_cost_usd,
      },
      actions: {
        total: metrics.actions.total,
        by_tool: metrics.actions.by_tool,
        sequence: config.verbose ? metrics.actions.sequence : [],
      },
      final_state: {
        browser: { url: null, title: null },
        agent_response: lastAgentResponse,
      },
      permissions: metrics.permissions,
    };

    // Write output
    const jsonOutput = JSON.stringify(output, null, 2);
    if (config.output) {
      try {
        // Ensure directory exists
        const outputDir = path.dirname(config.output);
        if (!fs.existsSync(outputDir)) {
          fs.mkdirSync(outputDir, { recursive: true });
        }
        fs.writeFileSync(config.output, jsonOutput);
        console.log(`[Eval Mode] Output written to: ${config.output}`);
      } catch (err) {
        console.error('[Eval Mode] Failed to write output file:', err);
        // Fall back to stdout
        console.log(jsonOutput);
      }
    } else {
      console.log(jsonOutput);
    }

    // Cleanup
    permissionServer.close();
    questionServer.close();
    closeDatabase();

    process.exit(code);
  };

  // Set up timeout
  timeoutHandle = setTimeout(() => {
    console.log(`[Eval Mode] Timeout reached (${config.timeout}s)`);
    isTimedOut = true;
    finalStatus = 'timeout';
    finalError = `Task timed out after ${config.timeout} seconds`;
    exitCode = EXIT_TIMEOUT;

    // Cancel the task
    taskManager.cancelTask(taskId).catch((err) => {
      console.error('[Eval Mode] Failed to cancel task on timeout:', err);
    }).finally(() => {
      writeOutputAndExit(exitCode);
    });
  }, config.timeout * 1000);

  // Create task callbacks
  const callbacks: TaskCallbacks = {
    onMessage: (message: OpenCodeMessage) => {
      if (isTimedOut) return;

      // Track API calls from step_start
      if (message.type === 'step_start') {
        metrics.api_calls++;
      }

      // Track tokens from step_finish
      if (message.type === 'step_finish' && message.part.tokens) {
        metrics.tokens.input += message.part.tokens.input;
        metrics.tokens.output += message.part.tokens.output;
        metrics.tokens.total = metrics.tokens.input + metrics.tokens.output;
      }

      // Track tool usage
      if (message.type === 'tool_call' || message.type === 'tool_use') {
        stepCount++;
        metrics.actions.total++;

        const toolName = message.type === 'tool_call'
          ? message.part.tool
          : (message as import('@accomplish/shared').OpenCodeToolUseMessage).part.tool;

        metrics.actions.by_tool[toolName] = (metrics.actions.by_tool[toolName] || 0) + 1;

        if (config.verbose) {
          const actionRecord: ActionRecord = {
            timestamp: new Date().toISOString(),
            tool: toolName,
          };

          if (message.type === 'tool_call') {
            actionRecord.input = message.part.input;
          } else {
            const toolUseMsg = message as import('@accomplish/shared').OpenCodeToolUseMessage;
            actionRecord.input = toolUseMsg.part.state?.input;
            actionRecord.output = toolUseMsg.part.state?.output;
            actionRecord.status = toolUseMsg.part.state?.status;
          }

          metrics.actions.sequence.push(actionRecord);
        }

        // Check max steps
        if (stepCount >= config.maxSteps) {
          console.log(`[Eval Mode] Max steps reached (${config.maxSteps})`);
          finalStatus = 'failed';
          finalError = `Maximum steps (${config.maxSteps}) exceeded`;
          exitCode = EXIT_MAX_STEPS;

          taskManager.cancelTask(taskId).catch((err) => {
            console.error('[Eval Mode] Failed to cancel task on max steps:', err);
          }).finally(() => {
            writeOutputAndExit(exitCode);
          });
        }
      }

      // Capture agent text response
      if (message.type === 'text' && message.part.text) {
        lastAgentResponse = message.part.text;
      }
    },

    onProgress: (progress: TaskProgressEvent) => {
      if (isTimedOut) return;
      console.log(`[Eval Mode] Progress: ${progress.stage} - ${progress.message || ''}`);
    },

    onPermissionRequest: (request: PermissionRequest) => {
      if (isTimedOut) return;
      // Permission requests are handled by the eval permission servers
      // This callback is for internal permissions from the adapter
      console.log(`[Eval Mode] Permission request: ${request.type} - ${request.fileOperation || request.question || ''}`);
    },

    onComplete: (result: TaskResult) => {
      if (isTimedOut) return;
      console.log(`[Eval Mode] Task completed with status: ${result.status}`);

      sessionId = result.sessionId || sessionId;

      if (result.status === 'success') {
        finalStatus = 'success';
        exitCode = EXIT_SUCCESS;
      } else if (result.status === 'interrupted') {
        finalStatus = 'interrupted';
        exitCode = EXIT_FAILED;
      } else {
        finalStatus = 'failed';
        finalError = result.error || 'Task failed';
        exitCode = EXIT_FAILED;
      }

      writeOutputAndExit(exitCode);
    },

    onError: (error: Error) => {
      if (isTimedOut) return;
      console.error(`[Eval Mode] Task error:`, error.message);

      finalStatus = 'error';
      finalError = error.message;
      exitCode = EXIT_RUNTIME_ERROR;

      writeOutputAndExit(exitCode);
    },

    onStatusChange: (status) => {
      if (isTimedOut) return;
      console.log(`[Eval Mode] Status change: ${status}`);
    },

    onDebug: (log) => {
      if (config.verbose) {
        console.log(`[Eval Mode Debug] ${log.type}: ${log.message}`);
      }
    },

    onTodoUpdate: (todos: TodoItem[]) => {
      if (config.verbose) {
        const inProgress = todos.filter(t => t.status === 'in_progress').length;
        const completed = todos.filter(t => t.status === 'completed').length;
        console.log(`[Eval Mode] Todos: ${completed}/${todos.length} completed, ${inProgress} in progress`);
      }
    },
  };

  // Start the task
  try {
    console.log(`[Eval Mode] Starting task: "${config.task.substring(0, 100)}${config.task.length > 100 ? '...' : ''}"`);

    const task = await taskManager.startTask(
      `eval_${Date.now()}`,
      {
        prompt: config.task,
        workingDirectory: config.workingDir,
        sessionId: config.sessionId || undefined,
      },
      callbacks
    );

    taskId = task.id;
    console.log(`[Eval Mode] Task started with ID: ${taskId}`);
  } catch (err) {
    console.error('[Eval Mode] Failed to start task:', err);
    finalStatus = 'error';
    finalError = err instanceof Error ? err.message : String(err);
    writeOutputAndExit(EXIT_RUNTIME_ERROR);
  }

  // Keep the process running until task completes or times out
  // The callbacks will call writeOutputAndExit when done
  return new Promise<never>(() => {});
}
