import * as pty from 'node-pty';
import { EventEmitter } from 'events';
import { app } from 'electron';
import fs from 'fs';
import { StreamParser } from './stream-parser';
import { OpenCodeLogWatcher, createLogWatcher, OpenCodeLogError } from './log-watcher';
import { CompletionEnforcer, CompletionEnforcerCallbacks } from './completion';
import {
  getOpenCodeCliPath,
  isOpenCodeBundled,
  getBundledOpenCodeVersion,
} from './cli-path';
import { getAllApiKeys, getBedrockCredentials } from '../store/secureStorage';
import { getSelectedModel } from '../store/appSettings';
import { getActiveProviderModel } from '../store/providerSettings';
import { generateOpenCodeConfig, ACCOMPLISH_AGENT_NAME, syncApiKeysToOpenCodeAuth } from './config-generator';
import { getExtendedNodePath } from '../utils/system-path';
import { getBundledNodePaths, logBundledNodeInfo } from '../utils/bundled-node';
import path from 'path';
import type {
  TaskConfig,
  Task,
  TaskMessage,
  TaskResult,
  OpenCodeMessage,
  PermissionRequest,
} from '@accomplish/shared';

/**
 * Error thrown when OpenCode CLI is not available
 */
export class OpenCodeCliNotFoundError extends Error {
  constructor() {
    super(
      'OpenCode CLI is not available. The bundled CLI may be missing or corrupted. Please reinstall the application.'
    );
    this.name = 'OpenCodeCliNotFoundError';
  }
}

/**
 * Check if OpenCode CLI is available (bundled or installed)
 */
export async function isOpenCodeCliInstalled(): Promise<boolean> {
  return isOpenCodeBundled();
}

/**
 * Get OpenCode CLI version
 */
export async function getOpenCodeCliVersion(): Promise<string | null> {
  return getBundledOpenCodeVersion();
}

export interface OpenCodeAdapterEvents {
  message: [OpenCodeMessage];
  'tool-use': [string, unknown];
  'tool-result': [string];
  'permission-request': [PermissionRequest];
  progress: [{ stage: string; message?: string }];
  complete: [TaskResult];
  error: [Error];
  debug: [{ type: string; message: string; data?: unknown }];
}

export class OpenCodeAdapter extends EventEmitter<OpenCodeAdapterEvents> {
  private ptyProcess: pty.IPty | null = null;
  private streamParser: StreamParser;
  private logWatcher: OpenCodeLogWatcher | null = null;
  private currentSessionId: string | null = null;
  private currentTaskId: string | null = null;
  private messages: TaskMessage[] = [];
  private hasCompleted: boolean = false;
  private isDisposed: boolean = false;
  private wasInterrupted: boolean = false;
  private completionEnforcer: CompletionEnforcer;
  private lastWorkingDirectory: string | undefined;

  /**
   * Create a new OpenCodeAdapter instance
   * @param taskId - Optional task ID for this adapter instance (used for logging)
   */
  constructor(taskId?: string) {
    super();
    this.currentTaskId = taskId || null;
    this.streamParser = new StreamParser();
    this.completionEnforcer = this.createCompletionEnforcer();
    this.setupStreamParsing();
    this.setupLogWatcher();
  }

  /**
   * Create the CompletionEnforcer with callbacks that delegate to adapter methods.
   */
  private createCompletionEnforcer(): CompletionEnforcer {
    const callbacks: CompletionEnforcerCallbacks = {
      onStartVerification: async (prompt: string) => {
        await this.spawnSessionResumption(prompt);
      },
      onStartContinuation: async (prompt: string) => {
        await this.spawnSessionResumption(prompt);
      },
      onComplete: () => {
        this.hasCompleted = true;
        this.emit('complete', {
          status: 'success',
          sessionId: this.currentSessionId || undefined,
        });
      },
      onDebug: (type: string, message: string, data?: unknown) => {
        this.emit('debug', { type, message, data });
      },
    };
    return new CompletionEnforcer(callbacks);
  }

  /**
   * Set up the log watcher to detect errors from OpenCode CLI logs.
   * The CLI doesn't always output errors as JSON to stdout (e.g., throttling errors),
   * so we monitor the log files directly.
   */
  private setupLogWatcher(): void {
    this.logWatcher = createLogWatcher();

    this.logWatcher.on('error', (error: OpenCodeLogError) => {
      // Only handle errors if we have an active task that hasn't completed
      if (!this.hasCompleted && this.ptyProcess) {
        console.log('[OpenCode Adapter] Log watcher detected error:', error.errorName);

        const errorMessage = OpenCodeLogWatcher.getErrorMessage(error);

        // Emit debug event so the error appears in the app's debug panel
        this.emit('debug', {
          type: 'error',
          message: `[${error.errorName}] ${errorMessage}`,
          data: {
            errorName: error.errorName,
            statusCode: error.statusCode,
            providerID: error.providerID,
            modelID: error.modelID,
            message: error.message,
          },
        });

        this.hasCompleted = true;
        this.emit('complete', {
          status: 'error',
          sessionId: this.currentSessionId || undefined,
          error: errorMessage,
        });

        // Kill the PTY process since we've detected an error
        if (this.ptyProcess) {
          try {
            this.ptyProcess.kill();
          } catch (err) {
            console.warn('[OpenCode Adapter] Error killing PTY after log error:', err);
          }
          this.ptyProcess = null;
        }
      }
    });
  }

  /**
   * Start a new task with OpenCode CLI
   */
  async startTask(config: TaskConfig): Promise<Task> {
    // Check if adapter has been disposed
    if (this.isDisposed) {
      throw new Error('Adapter has been disposed and cannot start new tasks');
    }

    // Check if OpenCode CLI is installed before attempting to start
    const cliInstalled = await isOpenCodeCliInstalled();
    if (!cliInstalled) {
      throw new OpenCodeCliNotFoundError();
    }

    const taskId = config.taskId || this.generateTaskId();
    this.currentTaskId = taskId;
    this.currentSessionId = null;
    this.messages = [];
    this.streamParser.reset();
    this.hasCompleted = false;
    this.wasInterrupted = false;
    this.completionEnforcer.reset();
    this.lastWorkingDirectory = config.workingDirectory;

    // Start the log watcher to detect errors that aren't output as JSON
    if (this.logWatcher) {
      await this.logWatcher.start();
    }

    // Sync API keys to OpenCode CLI's auth.json (for DeepSeek, Z.AI support)
    await syncApiKeysToOpenCodeAuth();

    // Generate OpenCode config file with MCP settings and agent
    console.log('[OpenCode CLI] Generating OpenCode config with MCP settings and agent...');
    const configPath = await generateOpenCodeConfig();
    console.log('[OpenCode CLI] Config generated at:', configPath);

    const cliArgs = await this.buildCliArgs(config);

    // Get the bundled CLI path
    const { command, args: baseArgs } = getOpenCodeCliPath();
    const startMsg = `Starting: ${command} ${[...baseArgs, ...cliArgs].join(' ')}`;
    console.log('[OpenCode CLI]', startMsg);
    this.emit('debug', { type: 'info', message: startMsg });

    // Build environment with API keys
    const env = await this.buildEnvironment();

    const allArgs = [...baseArgs, ...cliArgs];
    const cmdMsg = `Command: ${command}`;
    const argsMsg = `Args: ${allArgs.join(' ')}`;
    // Use temp directory as default cwd to avoid TCC permission prompts.
    // Home directory (~/) triggers TCC when the CLI scans for projects/configs
    // because it lists Desktop, Documents, etc.
    const safeCwd = config.workingDirectory || app.getPath('temp');
    const cwdMsg = `Working directory: ${safeCwd}`;

    console.log('[OpenCode CLI]', cmdMsg);
    console.log('[OpenCode CLI]', argsMsg);
    console.log('[OpenCode CLI]', cwdMsg);

    this.emit('debug', { type: 'info', message: cmdMsg });
    this.emit('debug', { type: 'info', message: argsMsg, data: { args: allArgs } });
    this.emit('debug', { type: 'info', message: cwdMsg });

    // Always use PTY for proper terminal emulation
    // We spawn via shell because posix_spawnp doesn't interpret shebangs
    {
      const fullCommand = this.buildShellCommand(command, allArgs);

      const shellCmdMsg = `Full shell command: ${fullCommand}`;
      console.log('[OpenCode CLI]', shellCmdMsg);
      this.emit('debug', { type: 'info', message: shellCmdMsg });

      // Use platform-appropriate shell
      const shellCmd = this.getPlatformShell();
      const shellArgs = this.getShellArgs(fullCommand);
      const shellMsg = `Using shell: ${shellCmd} ${shellArgs.join(' ')}`;
      console.log('[OpenCode CLI]', shellMsg);
      this.emit('debug', { type: 'info', message: shellMsg });

      this.ptyProcess = pty.spawn(shellCmd, shellArgs, {
        name: 'xterm-256color',
        cols: 200,
        rows: 30,
        cwd: safeCwd,
        env: env as { [key: string]: string },
      });
      const pidMsg = `PTY Process PID: ${this.ptyProcess.pid}`;
      console.log('[OpenCode CLI]', pidMsg);
      this.emit('debug', { type: 'info', message: pidMsg });

      // Handle PTY data (combines stdout/stderr)
      this.ptyProcess.onData((data: string) => {
        // Filter out ANSI escape codes and control characters for cleaner parsing
        // Enhanced to handle Windows PowerShell sequences (cursor visibility, window titles)
        const cleanData = data
          .replace(/\x1B\[[0-9;?]*[a-zA-Z]/g, '')  // CSI sequences (added ? for DEC modes like cursor hide)
          .replace(/\x1B\][^\x07]*\x07/g, '')       // OSC sequences with BEL terminator (window titles)
          .replace(/\x1B\][^\x1B]*\x1B\\/g, '');    // OSC sequences with ST terminator
        if (cleanData.trim()) {
          // Truncate for console.log to avoid flooding terminal
          const truncated = cleanData.substring(0, 500) + (cleanData.length > 500 ? '...' : '');
          console.log('[OpenCode CLI stdout]:', truncated);
          // Send full data to debug panel
          this.emit('debug', { type: 'stdout', message: cleanData });

          this.streamParser.feed(cleanData);
        }
      });

      // Handle PTY exit
      this.ptyProcess.onExit(({ exitCode, signal }) => {
        const exitMsg = `PTY Process exited with code: ${exitCode}, signal: ${signal}`;
        console.log('[OpenCode CLI]', exitMsg);
        this.emit('debug', { type: 'exit', message: exitMsg, data: { exitCode, signal } });
        this.handleProcessExit(exitCode);
      });
    }

    return {
      id: taskId,
      prompt: config.prompt,
      status: 'running',
      messages: [],
      createdAt: new Date().toISOString(),
      startedAt: new Date().toISOString(),
    };
  }

  /**
   * Resume an existing session
   */
  async resumeSession(sessionId: string, prompt: string): Promise<Task> {
    return this.startTask({
      prompt,
      sessionId,
    });
  }

  /**
   * Send user response for permission/question
   * Note: This requires the PTY to be active
   */
  async sendResponse(response: string): Promise<void> {
    if (!this.ptyProcess) {
      throw new Error('No active process');
    }

    this.ptyProcess.write(response + '\n');
    console.log('[OpenCode CLI] Response sent via PTY');
  }

  /**
   * Cancel the current task (hard kill)
   */
  async cancelTask(): Promise<void> {
    if (this.ptyProcess) {
      // Kill the PTY process
      this.ptyProcess.kill();
      this.ptyProcess = null;
    }
  }

  /**
   * Interrupt the current task (graceful Ctrl+C)
   * Sends SIGINT to allow the CLI to stop gracefully and wait for next input.
   * Unlike cancelTask(), this doesn't kill the process - it just interrupts the current operation.
   */
  async interruptTask(): Promise<void> {
    if (!this.ptyProcess) {
      console.log('[OpenCode CLI] No active process to interrupt');
      return;
    }

    // Mark as interrupted so we can handle the exit appropriately
    this.wasInterrupted = true;

    // Send Ctrl+C (ASCII 0x03) to the PTY to interrupt current operation
    this.ptyProcess.write('\x03');
    console.log('[OpenCode CLI] Sent Ctrl+C interrupt signal');

    // On Windows, batch files (.cmd) prompt "Terminate batch job (Y/N)?" after Ctrl+C.
    // We need to send "Y" to confirm termination, otherwise the process hangs.
    if (process.platform === 'win32') {
      setTimeout(() => {
        if (this.ptyProcess) {
          this.ptyProcess.write('Y\n');
          console.log('[OpenCode CLI] Sent Y to confirm batch termination');
        }
      }, 100);
    }
  }

  /**
   * Get the current session ID
   */
  getSessionId(): string | null {
    return this.currentSessionId;
  }

  /**
   * Get the current task ID
   */
  getTaskId(): string | null {
    return this.currentTaskId;
  }

  /**
   * Check if the adapter has been disposed
   */
  isAdapterDisposed(): boolean {
    return this.isDisposed;
  }

  /**
   * Dispose the adapter and clean up all resources
   * Called when task completes, is cancelled, or on app quit
   */
  dispose(): void {
    if (this.isDisposed) {
      return;
    }

    console.log(`[OpenCode Adapter] Disposing adapter for task ${this.currentTaskId}`);
    this.isDisposed = true;

    // Stop the log watcher
    if (this.logWatcher) {
      this.logWatcher.stop().catch((err) => {
        console.warn('[OpenCode Adapter] Error stopping log watcher:', err);
      });
    }

    // Kill PTY process if running
    if (this.ptyProcess) {
      try {
        this.ptyProcess.kill();
      } catch (error) {
        console.error('[OpenCode Adapter] Error killing PTY process:', error);
      }
      this.ptyProcess = null;
    }

    // Clear state
    this.currentSessionId = null;
    this.currentTaskId = null;
    this.messages = [];
    this.hasCompleted = true;

    // Reset stream parser
    this.streamParser.reset();

    // Remove all listeners
    this.removeAllListeners();

    console.log('[OpenCode Adapter] Adapter disposed');
  }

  /**
   * Build environment variables with all API keys
   */
  private async buildEnvironment(): Promise<NodeJS.ProcessEnv> {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
    };

    if (app.isPackaged) {
      // Run the bundled CLI with Electron acting as Node (no system Node required).
      env.ELECTRON_RUN_AS_NODE = '1';

      // Log bundled Node.js configuration
      logBundledNodeInfo();

      // Add bundled Node.js to PATH (highest priority)
      const bundledNode = getBundledNodePaths();
      if (bundledNode) {
        // Prepend bundled Node.js bin directory to PATH
        const delimiter = process.platform === 'win32' ? ';' : ':';
        env.PATH = `${bundledNode.binDir}${delimiter}${env.PATH || ''}`;
        // Also expose as NODE_BIN_PATH so agent can use it in bash commands
        env.NODE_BIN_PATH = bundledNode.binDir;
        console.log('[OpenCode CLI] Added bundled Node.js to PATH:', bundledNode.binDir);
      }

      // For packaged apps on macOS, also extend PATH to include common Node.js locations as fallback.
      // This avoids using login shell which triggers folder access permissions.
      if (process.platform === 'darwin') {
        env.PATH = getExtendedNodePath(env.PATH);
        console.log('[OpenCode CLI] Extended PATH for packaged app');
      }
    }

    // Load all API keys
    const apiKeys = await getAllApiKeys();

    if (apiKeys.anthropic) {
      env.ANTHROPIC_API_KEY = apiKeys.anthropic;
      console.log('[OpenCode CLI] Using Anthropic API key from settings');
    }
    if (apiKeys.openai) {
      env.OPENAI_API_KEY = apiKeys.openai;
      console.log('[OpenCode CLI] Using OpenAI API key from settings');
    }
    if (apiKeys.google) {
      env.GOOGLE_GENERATIVE_AI_API_KEY = apiKeys.google;
      console.log('[OpenCode CLI] Using Google API key from settings');
    }
    if (apiKeys.xai) {
      env.XAI_API_KEY = apiKeys.xai;
      console.log('[OpenCode CLI] Using xAI API key from settings');
    }
    if (apiKeys.deepseek) {
      env.DEEPSEEK_API_KEY = apiKeys.deepseek;
      console.log('[OpenCode CLI] Using DeepSeek API key from settings');
    }
    if (apiKeys.zai) {
      env.ZAI_API_KEY = apiKeys.zai;
      console.log('[OpenCode CLI] Using Z.AI API key from settings');
    }
    if (apiKeys.openrouter) {
      env.OPENROUTER_API_KEY = apiKeys.openrouter;
      console.log('[OpenCode CLI] Using OpenRouter API key from settings');
    }
    if (apiKeys.litellm) {
      env.LITELLM_API_KEY = apiKeys.litellm;
      console.log('[OpenCode CLI] Using LiteLLM API key from settings');
    }

    // Set Bedrock credentials if configured
    const bedrockCredentials = getBedrockCredentials();
    if (bedrockCredentials) {
      if (bedrockCredentials.authType === 'accessKeys') {
        env.AWS_ACCESS_KEY_ID = bedrockCredentials.accessKeyId;
        env.AWS_SECRET_ACCESS_KEY = bedrockCredentials.secretAccessKey;
        if (bedrockCredentials.sessionToken) {
          env.AWS_SESSION_TOKEN = bedrockCredentials.sessionToken;
        }
        console.log('[OpenCode CLI] Using Bedrock Access Key credentials');
      } else if (bedrockCredentials.authType === 'profile') {
        env.AWS_PROFILE = bedrockCredentials.profileName;
        console.log('[OpenCode CLI] Using Bedrock AWS Profile:', bedrockCredentials.profileName);
      }
      if (bedrockCredentials.region) {
        env.AWS_REGION = bedrockCredentials.region;
        console.log('[OpenCode CLI] Using Bedrock region:', bedrockCredentials.region);
      }
    }

    // Set Ollama host if configured (check new settings first, then legacy)
    const activeModel = getActiveProviderModel();
    const selectedModel = getSelectedModel();
    if (activeModel?.provider === 'ollama' && activeModel.baseUrl) {
      env.OLLAMA_HOST = activeModel.baseUrl;
      console.log('[OpenCode CLI] Using Ollama host from provider settings:', activeModel.baseUrl);
    } else if (selectedModel?.provider === 'ollama' && selectedModel.baseUrl) {
      env.OLLAMA_HOST = selectedModel.baseUrl;
      console.log('[OpenCode CLI] Using Ollama host from legacy settings:', selectedModel.baseUrl);
    }

    // Set LiteLLM base URL if configured (for debugging/logging purposes)
    if (activeModel?.provider === 'litellm' && activeModel.baseUrl) {
      console.log('[OpenCode CLI] LiteLLM active with base URL:', activeModel.baseUrl);
    }

    // Log config environment variable
    console.log('[OpenCode CLI] OPENCODE_CONFIG in env:', process.env.OPENCODE_CONFIG);
    if (process.env.OPENCODE_CONFIG) {
      env.OPENCODE_CONFIG = process.env.OPENCODE_CONFIG;
      console.log('[OpenCode CLI] Passing OPENCODE_CONFIG to subprocess:', env.OPENCODE_CONFIG);
    }

    // Pass task ID to environment for task-scoped page naming in parallel execution
    if (this.currentTaskId) {
      env.ACCOMPLISH_TASK_ID = this.currentTaskId;
      console.log('[OpenCode CLI] Task ID in environment:', this.currentTaskId);
    }

    this.emit('debug', { type: 'info', message: 'Environment configured with API keys' });

    return env;
  }

  private async buildCliArgs(config: TaskConfig): Promise<string[]> {
    // Try new provider settings first, fall back to legacy settings
    const activeModel = getActiveProviderModel();
    const selectedModel = activeModel || getSelectedModel();

    // OpenCode CLI uses: opencode run "message" --format json
    const args = [
      'run',
      config.prompt,
      '--format', 'json',
    ];

    // Add model selection if specified
    if (selectedModel?.model) {
      if (selectedModel.provider === 'zai') {
        // Z.AI Coding Plan uses 'zai-coding-plan' provider in OpenCode CLI
        const modelId = selectedModel.model.split('/').pop();
        args.push('--model', `zai-coding-plan/${modelId}`);
      } else if (selectedModel.provider === 'deepseek') {
        // DeepSeek uses 'deepseek' provider in OpenCode CLI
        const modelId = selectedModel.model.split('/').pop();
        args.push('--model', `deepseek/${modelId}`);
      } else if (selectedModel.provider === 'openrouter') {
        // OpenRouter models use format: openrouter/provider/model
        // The fullId is already in the correct format (e.g., openrouter/anthropic/claude-opus-4-5)
        args.push('--model', selectedModel.model);
      } else if (selectedModel.provider === 'ollama') {
        // Ollama models use format: ollama/model-name
        const modelId = selectedModel.model.replace(/^ollama\//, '');
        args.push('--model', `ollama/${modelId}`);
      } else if (selectedModel.provider === 'litellm') {
        // LiteLLM models use format: litellm/model-name
        const modelId = selectedModel.model.replace(/^litellm\//, '');
        args.push('--model', `litellm/${modelId}`);
      } else {
        args.push('--model', selectedModel.model);
      }
    }

    // Resume session if specified
    if (config.sessionId) {
      args.push('--session', config.sessionId);
    }

    // Use the Accomplish agent for browser automation guidance
    args.push('--agent', ACCOMPLISH_AGENT_NAME);

    return args;
  }

  private setupStreamParsing(): void {
    this.streamParser.on('message', (message: OpenCodeMessage) => {
      this.handleMessage(message);
    });

    // Handle parse errors gracefully to prevent crashes from non-JSON output
    // PTY combines stdout/stderr, so shell banners, warnings, etc. may appear
    this.streamParser.on('error', (error: Error) => {
      // Log but don't crash - non-JSON lines are expected from PTY (shell banners, warnings, etc.)
      console.warn('[OpenCode Adapter] Stream parse warning:', error.message);
      this.emit('debug', { type: 'parse-warning', message: error.message });
    });
  }

  private handleMessage(message: OpenCodeMessage): void {
    console.log('[OpenCode Adapter] Handling message type:', message.type);

    switch (message.type) {
      // Step start event
      case 'step_start':
        this.currentSessionId = message.part.sessionID;
        this.emit('progress', { stage: 'init', message: 'Task started' });
        break;

      // Text content event
      case 'text':
        if (!this.currentSessionId && message.part.sessionID) {
          this.currentSessionId = message.part.sessionID;
        }
        this.emit('message', message);

        if (message.part.text) {
          const taskMessage: TaskMessage = {
            id: this.generateMessageId(),
            type: 'assistant',
            content: message.part.text,
            timestamp: new Date().toISOString(),
          };
          this.messages.push(taskMessage);
        }
        break;

      // Tool call event
      case 'tool_call':
        const toolName = message.part.tool || 'unknown';
        const toolInput = message.part.input;

        console.log('[OpenCode Adapter] Tool call:', toolName);

        // COMPLETION ENFORCEMENT: Track complete_task tool calls
        // Tool name may be prefixed with MCP server name (e.g., "complete-task_complete_task")
        // so we use endsWith() for fuzzy matching
        if (toolName === 'complete_task' || toolName.endsWith('_complete_task')) {
          this.completionEnforcer.handleCompleteTaskDetection(toolInput);
        }

        this.emit('tool-use', toolName, toolInput);
        this.emit('progress', {
          stage: 'tool-use',
          message: `Using ${toolName}`,
        });

        // Check if this is AskUserQuestion (requires user input)
        if (toolName === 'AskUserQuestion') {
          this.handleAskUserQuestion(toolInput as AskUserQuestionInput);
        }
        break;

      // Tool use event - combined tool call and result from OpenCode CLI
      case 'tool_use':
        const toolUseMessage = message as import('@accomplish/shared').OpenCodeToolUseMessage;
        const toolUseName = toolUseMessage.part.tool || 'unknown';
        const toolUseInput = toolUseMessage.part.state?.input;
        const toolUseOutput = toolUseMessage.part.state?.output || '';

        // Track if complete_task was called (tool name may be prefixed with MCP server name)
        if (toolUseName === 'complete_task' || toolUseName.endsWith('_complete_task')) {
          this.completionEnforcer.handleCompleteTaskDetection(toolUseInput);
        }

        // For models that don't emit text messages (like Gemini), emit the tool description
        // as a thinking message so users can see what the AI is doing
        const toolDescription = (toolUseInput as { description?: string })?.description;
        if (toolDescription) {
          // Create a synthetic text message for the description
          const syntheticTextMessage: OpenCodeMessage = {
            type: 'text',
            timestamp: message.timestamp,
            sessionID: message.sessionID,
            part: {
              id: this.generateMessageId(),
              sessionID: toolUseMessage.part.sessionID,
              messageID: toolUseMessage.part.messageID,
              type: 'text',
              text: toolDescription,
            },
          } as import('@accomplish/shared').OpenCodeTextMessage;
          this.emit('message', syntheticTextMessage);
        }

        // Forward to handlers.ts for message processing (screenshots, etc.)
        this.emit('message', message);
        const toolUseStatus = toolUseMessage.part.state?.status;

        console.log('[OpenCode Adapter] Tool use:', toolUseName, 'status:', toolUseStatus);

        // Emit tool-use event for the call
        this.emit('tool-use', toolUseName, toolUseInput);
        this.emit('progress', {
          stage: 'tool-use',
          message: `Using ${toolUseName}`,
        });

        // If status is completed or error, also emit tool-result
        if (toolUseStatus === 'completed' || toolUseStatus === 'error') {
          this.emit('tool-result', toolUseOutput);
        }

        // Check if this is AskUserQuestion (requires user input)
        if (toolUseName === 'AskUserQuestion') {
          this.handleAskUserQuestion(toolUseInput as AskUserQuestionInput);
        }
        break;

      // Tool result event
      case 'tool_result':
        const toolOutput = message.part.output || '';
        console.log('[OpenCode Adapter] Tool result received, length:', toolOutput.length);
        this.emit('tool-result', toolOutput);
        break;

      // Step finish event
      // COMPLETION ENFORCEMENT: Previously emitted 'complete' immediately on stop/end_turn.
      // Now we delegate to CompletionEnforcer which may:
      // - Return 'complete' if complete_task was called and verified
      // - Return 'pending' if verification or continuation is needed (handled on process exit)
      // - Return 'continue' if more tool calls are expected (reason='tool_use')
      case 'step_finish':
        if (message.part.reason === 'error') {
          if (!this.hasCompleted) {
            this.hasCompleted = true;
            this.emit('complete', {
              status: 'error',
              sessionId: this.currentSessionId || undefined,
              error: 'Task failed',
            });
          }
          break;
        }

        // Delegate to completion enforcer for stop/end_turn handling
        const action = this.completionEnforcer.handleStepFinish(message.part.reason);
        console.log(`[OpenCode Adapter] step_finish action: ${action}`);

        if (action === 'complete' && !this.hasCompleted) {
          this.hasCompleted = true;
          this.emit('complete', {
            status: 'success',
            sessionId: this.currentSessionId || undefined,
          });
        }
        // 'pending' and 'continue' - don't emit complete, let handleProcessExit handle it
        break;

      // Error event
      case 'error':
        this.hasCompleted = true;
        this.emit('complete', {
          status: 'error',
          sessionId: this.currentSessionId || undefined,
          error: message.error,
        });
        break;

      default:
        // Cast to unknown to safely access type property for logging
        const unknownMessage = message as unknown as { type: string };
        console.log('[OpenCode Adapter] Unknown message type:', unknownMessage.type);
    }
  }

  private handleAskUserQuestion(input: AskUserQuestionInput): void {
    const question = input.questions?.[0];
    if (!question) return;

    const permissionRequest: PermissionRequest = {
      id: this.generateRequestId(),
      taskId: this.currentTaskId || '',
      type: 'question',
      question: question.question,
      options: question.options?.map((o) => ({
        label: o.label,
        description: o.description,
      })),
      multiSelect: question.multiSelect,
      createdAt: new Date().toISOString(),
    };

    this.emit('permission-request', permissionRequest);
  }

  /**
   * Escape a shell argument for safe execution.
   */
  private escapeShellArg(arg: string): string {
    if (process.platform === 'win32') {
      if (arg.includes(' ') || arg.includes('"')) {
        return `"${arg.replace(/"/g, '""')}"`;
      }
      return arg;
    } else {
      const needsEscaping = ["'", ' ', '$', '`', '\\', '"', '\n'].some(c => arg.includes(c));
      if (needsEscaping) {
        return `'${arg.replace(/'/g, "'\\''")}'`;
      }
      return arg;
    }
  }

  /**
   * Build a shell command string with properly escaped arguments.
   */
  private buildShellCommand(command: string, args: string[]): string {
    return [command, ...args].map(arg => this.escapeShellArg(arg)).join(' ');
  }

  /**
   * COMPLETION ENFORCEMENT: Process exit handler
   *
   * When the CLI process exits with code 0 and we haven't already completed:
   * 1. Delegate to CompletionEnforcer.handleProcessExit()
   * 2. Enforcer checks if verification or continuation is pending
   * 3. If so, it spawns a session resumption via callbacks
   * 4. If not, it calls onComplete() to emit the 'complete' event
   *
   * This allows the enforcer to chain multiple CLI invocations (verification,
   * continuation retries) while maintaining the same session context.
   */
  private handleProcessExit(code: number | null): void {
    // Clean up PTY process reference
    this.ptyProcess = null;

    // Handle interrupted tasks immediately (before completion enforcer)
    // This ensures user interrupts are respected regardless of completion state
    if (this.wasInterrupted && code === 0 && !this.hasCompleted) {
      console.log('[OpenCode CLI] Task was interrupted by user');
      this.hasCompleted = true;
      this.emit('complete', {
        status: 'interrupted',
        sessionId: this.currentSessionId || undefined,
      });
      this.currentTaskId = null;
      return;
    }

    // Delegate to completion enforcer for verification/continuation handling
    if (code === 0 && !this.hasCompleted) {
      this.completionEnforcer.handleProcessExit(code).catch((error) => {
        console.error('[OpenCode Adapter] Completion enforcer error:', error);
        this.hasCompleted = true;
        this.emit('complete', {
          status: 'error',
          sessionId: this.currentSessionId || undefined,
          error: `Failed to complete: ${error.message}`,
        });
      });
      return; // Let completion enforcer handle next steps
    }

    // Only emit complete/error if we haven't already received a result message
    if (!this.hasCompleted) {
      if (code !== null && code !== 0) {
        // Error exit
        this.emit('error', new Error(`OpenCode CLI exited with code ${code}`));
      }
    }

    this.currentTaskId = null;
  }

  /**
   * Spawn a session resumption task with the given prompt.
   * Used by CompletionEnforcer callbacks for continuation and verification.
   *
   * WHY SESSION RESUMPTION (not PTY write):
   * - OpenCode CLI supports --session-id to continue an existing conversation
   * - This preserves full context (previous messages, tool results, etc.)
   * - PTY write would just inject text without proper message framing
   * - Session resumption creates a clean new API call with the prompt as a user message
   *
   * The same session ID is reused, so verification/continuation prompts appear
   * as natural follow-up messages in the conversation.
   */
  private async spawnSessionResumption(prompt: string): Promise<void> {
    const sessionId = this.currentSessionId;
    if (!sessionId) {
      throw new Error('No session ID available for session resumption');
    }

    console.log(`[OpenCode Adapter] Starting session resumption with session ${sessionId}`);

    // Reset stream parser for new process but preserve other state
    this.streamParser.reset();

    // Build args for resumption - reuse same model/settings
    const config: TaskConfig = {
      prompt,
      sessionId: sessionId,
      workingDirectory: this.lastWorkingDirectory,
    };

    const cliArgs = await this.buildCliArgs(config);

    // Get the bundled CLI path
    const { command, args: baseArgs } = getOpenCodeCliPath();
    console.log('[OpenCode Adapter] Session resumption command:', command, [...baseArgs, ...cliArgs].join(' '));

    // Build environment
    const env = await this.buildEnvironment();

    const allArgs = [...baseArgs, ...cliArgs];
    const safeCwd = config.workingDirectory || app.getPath('temp');

    // Start new PTY process for session resumption
    const fullCommand = this.buildShellCommand(command, allArgs);

    const shellCmd = this.getPlatformShell();
    const shellArgs = this.getShellArgs(fullCommand);

    this.ptyProcess = pty.spawn(shellCmd, shellArgs, {
      name: 'xterm-256color',
      cols: 200,
      rows: 30,
      cwd: safeCwd,
      env: env as { [key: string]: string },
    });

    // Set up event handlers for new process
    this.ptyProcess.onData((data: string) => {
      // Filter out ANSI escape codes and control characters for cleaner parsing
      // Enhanced to handle Windows PowerShell sequences (cursor visibility, window titles)
      const cleanData = data
        .replace(/\x1B\[[0-9;?]*[a-zA-Z]/g, '')  // CSI sequences (added ? for DEC modes like cursor hide)
        .replace(/\x1B\][^\x07]*\x07/g, '')       // OSC sequences with BEL terminator (window titles)
        .replace(/\x1B\][^\x1B]*\x1B\\/g, '');    // OSC sequences with ST terminator
      if (cleanData.trim()) {
        // Truncate for console.log to avoid flooding terminal
        const truncated = cleanData.substring(0, 500) + (cleanData.length > 500 ? '...' : '');
        console.log('[OpenCode CLI stdout]:', truncated);
        // Send full data to debug panel
        this.emit('debug', { type: 'stdout', message: cleanData });

        this.streamParser.feed(cleanData);
      }
    });

    this.ptyProcess.onExit(({ exitCode }) => {
      this.handleProcessExit(exitCode);
    });
  }

  private generateTaskId(): string {
    return `task_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Get platform-appropriate shell command
   *
   * In packaged apps on macOS, we use /bin/sh instead of the user's shell
   * to avoid loading ANY user config files. Even non-login zsh loads ~/.zshenv
   * which may reference protected folders and trigger TCC permission dialogs.
   *
   * /bin/sh with -c flag doesn't load any user configuration.
   */
  private getPlatformShell(): string {
    if (process.platform === 'win32') {
      // Use PowerShell on Windows for better compatibility
      return 'powershell.exe';
    } else if (app.isPackaged && process.platform === 'darwin') {
      // In packaged macOS apps, use /bin/sh to avoid loading user shell configs
      // (zsh always loads ~/.zshenv, which may trigger TCC permissions)
      return '/bin/sh';
    } else {
      // In dev mode, use the user's shell for better compatibility
      const userShell = process.env.SHELL;
      if (userShell) {
        return userShell;
      }
      // Fallback chain: bash -> zsh -> sh
      if (fs.existsSync('/bin/bash')) return '/bin/bash';
      if (fs.existsSync('/bin/zsh')) return '/bin/zsh';
      return '/bin/sh';
    }
  }

  /**
   * Get shell arguments for running a command
   *
   * Note: We intentionally do NOT use login shell (-l) on macOS to avoid
   * triggering folder access permissions (TCC). Login shells load ~/.zprofile
   * and ~/.zshrc which may reference protected folders like Desktop/Documents.
   *
   * Instead, we extend PATH in buildEnvironment() using path_helper and common
   * Node.js installation paths. This is the proper macOS approach for GUI apps.
   */
  private getShellArgs(command: string): string[] {
    if (process.platform === 'win32') {
      // PowerShell: Use -EncodedCommand with Base64-encoded UTF-16LE to avoid
      // all escaping/parsing issues. This is the most reliable way to pass
      // complex commands with quotes, special characters, etc. to PowerShell.
      const encodedCommand = Buffer.from(command, 'utf16le').toString('base64');
      return ['-NoProfile', '-EncodedCommand', encodedCommand];
    } else {
      // Unix shells: -c to run command (no -l to avoid profile loading)
      return ['-c', command];
    }
  }
}

interface AskUserQuestionInput {
  questions?: Array<{
    question: string;
    header?: string;
    options?: Array<{ label: string; description?: string }>;
    multiSelect?: boolean;
  }>;
}

/**
 * Factory function to create a new adapter instance
 * Use this for the new per-task architecture via TaskManager
 */
export function createAdapter(taskId?: string): OpenCodeAdapter {
  return new OpenCodeAdapter(taskId);
}

/**
 * @deprecated Use TaskManager and createAdapter() instead.
 * Singleton instance kept for backward compatibility during migration.
 */
let adapterInstance: OpenCodeAdapter | null = null;

/**
 * @deprecated Use TaskManager and createAdapter() instead.
 * Get the legacy singleton adapter instance.
 */
export function getOpenCodeAdapter(): OpenCodeAdapter {
  if (!adapterInstance) {
    adapterInstance = new OpenCodeAdapter();
  }
  return adapterInstance;
}
