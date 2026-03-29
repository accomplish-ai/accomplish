import * as crypto from 'crypto';
import * as pty from 'node-pty';
import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';

import { StreamParser } from './StreamParser.js';
import { OpenCodeLogWatcher, createLogWatcher, OpenCodeLogError } from './OpenCodeLogWatcher.js';
import { classifyProcessError } from '../utils/process-error-classifier.js';
import {
  CompletionEnforcer,
  CompletionEnforcerCallbacks,
} from '../../opencode/completion/index.js';
import type { TaskConfig, Task, TaskMessage, TaskResult } from '../../common/types/task.js';
import type { OpenCodeMessage } from '../../common/types/opencode.js';
import type { PermissionRequest } from '../../common/types/permission.js';
import type { TodoItem } from '../../common/types/todo.js';
import type { SandboxConfig, SandboxProvider } from '../../common/types/sandbox.js';
import type { BrowserFramePayload } from '../../common/types/browser-view.js';
import { DEFAULT_SANDBOX_CONFIG } from '../../common/types/sandbox.js';
import { DisabledSandboxProvider } from '../../sandbox/disabled-provider.js';
import { serializeError } from '../../utils/error.js';
import { getOAuthProviderDisplayName, isOAuthProviderId } from '../../common/types/connector.js';
import { CONNECTOR_AUTH_REQUIRED_MARKER } from '../../common/constants.js';
import { createConsoleLogger } from '../../utils/logging.js';
import {
  generateTaskId,
  generateMessageId,
  buildPtySpawnArgs,
  isStartTaskTool,
  isExemptTool,
  isRequestConnectorAuthTool,
  isNonTaskContinuationTool,
  appendToCircularBuffer,
} from './adapter/adapter-utils.js';
import { parseBrowserFrames } from './adapter/browser-frame-parser.js';
import { buildPlanMessage, type StartTaskInput } from './adapter/message-synthesis.js';

const log = createConsoleLogger({ prefix: 'OpenCodeAdapter' });

const LOG_TRUNCATION_LIMIT = 500;

/** Windows STATUS_CONTROL_C_EXIT — exit code produced when a process is
 *  terminated via Ctrl+C (0xC000013A). On Windows this is not an error;
 *  treat it the same as a clean exit (code === 0). */
export const WINDOWS_CTRL_C_EXIT_CODE = -1073741510;

export const isNormalExit = (code: number | null, platform?: string): boolean =>
  code === 0 || (platform === 'win32' && code === WINDOWS_CTRL_C_EXIT_CODE);

interface ConnectorAuthPauseInput {
  providerId?: string;
  message?: string;
  label?: string;
  pendingLabel?: string;
  successText?: string;
}

export class OpenCodeCliNotFoundError extends Error {
  constructor() {
    super(
      'OpenCode CLI is not available. The bundled CLI may be missing or corrupted. Please reinstall the application.',
    );
    this.name = 'OpenCodeCliNotFoundError';
  }
}

export interface AdapterOptions {
  platform: NodeJS.Platform;
  isPackaged: boolean;
  tempPath: string;
  getCliCommand: () => { command: string; args: string[] };
  buildEnvironment: (taskId: string) => Promise<NodeJS.ProcessEnv>;
  buildCliArgs: (config: TaskConfig) => Promise<string[]>;
  onBeforeStart?: () => Promise<void>;
  getModelDisplayName?: (modelId: string) => string;
  /**
   * Lazy sandbox factory, called once per adapter instance.
   * When present, overrides sandboxProvider and sandboxConfig.
   */
  sandboxFactory?: () => { provider: SandboxProvider; config: SandboxConfig };
  /** Optional sandbox provider for restricting agent FS/network access */
  sandboxProvider?: SandboxProvider;
  /** Sandbox configuration used when sandboxProvider is set */
  sandboxConfig?: SandboxConfig;
}

export interface OpenCodeAdapterEvents {
  message: [OpenCodeMessage];
  'tool-use': [string, unknown];
  'tool-result': [string];
  'permission-request': [PermissionRequest];
  progress: [{ stage: string; message?: string; modelName?: string }];
  complete: [TaskResult];
  error: [Error];
  debug: [{ type: string; message: string; data?: unknown }];
  'todo:update': [TodoItem[]];
  'auth-error': [{ providerId: string; message: string }];
  /** Live browser preview frame — emitted when the dev-browser-mcp tool writes a JSON frame to stdout.
   *  Contributed by samarthsinh2660 (PR #414) for ENG-695. */
  'browser-frame': [BrowserFramePayload];
  reasoning: [string];
  'tool-call-complete': [
    {
      toolName: string;
      toolInput: unknown;
      toolOutput: string;
      sessionId?: string;
    },
  ];
  'step-finish': [
    {
      reason: string;
      model?: string;
      tokens?: {
        input: number;
        output: number;
        reasoning: number;
        cache?: { read: number; write: number };
      };
      cost?: number;
    },
  ];
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
  private currentModelId: string | null = null;
  private waitingTransitionTimer: ReturnType<typeof setTimeout> | null = null;
  private hasReceivedFirstTool: boolean = false;
  private startTaskCalled: boolean = false;
  private outputBuffer: string = '';
  /** Rolling buffer for reassembling split JSON lines from dev-browser-mcp stdout.
   *  Contributed by samarthsinh2660 (PR #414) for ENG-695. */
  private browserFrameBuffer: string = '';
  private static readonly OUTPUT_BUFFER_MAX = 4096;

  private appendToOutputBuffer(data: string): void {
    this.outputBuffer = appendToCircularBuffer(
      this.outputBuffer,
      data,
      OpenCodeAdapter.OUTPUT_BUFFER_MAX,
    );
  }

  /**
   * Scan stdout data for JSON-encoded browser frame messages written by dev-browser-mcp.
   * Each frame line has the shape: `{"type":"browser-frame","taskId":...,"pageName":...,"frame":...,"timestamp":...}`.
   *
   * Lines may be split across PTY data chunks, so we maintain a rolling buffer to reassemble them.
   * On match, emits the `'browser-frame'` event consumed by TaskManager → task-callbacks → renderer.
   *
   * Returns only the non-browser-frame lines so callers can safely feed the result into
   * `appendToOutputBuffer` / `StreamParser` without polluting them with large base64 payloads.
   *
   * Contributed by samarthsinh2660 (PR #414) for ENG-695.
   */
  private checkForBrowserFrame(data: string): string {
    const result = parseBrowserFrames(data, this.browserFrameBuffer, (payload) => {
      this.emit('browser-frame', payload);
    });
    this.browserFrameBuffer = result.buffer;
    return result.output;
  }

  private options: AdapterOptions;
  private sandboxProvider: SandboxProvider;
  private sandboxConfig: SandboxConfig;

  constructor(options: AdapterOptions, taskId?: string) {
    super();
    this.options = options;
    this.currentTaskId = taskId || null;
    // Prefer the lazy factory so runtime config changes (e.g. sandbox:set-config)
    // are picked up for each new task without recreating the TaskManager.
    if (options.sandboxFactory) {
      const { provider, config } = options.sandboxFactory();
      this.sandboxProvider = provider;
      this.sandboxConfig = config;
    } else {
      // Guard against fail-open: a non-disabled sandboxConfig requires an explicit provider.
      if (
        options.sandboxConfig &&
        options.sandboxConfig.mode !== 'disabled' &&
        !options.sandboxProvider
      ) {
        throw new Error(
          `sandboxProvider must be supplied when sandboxConfig.mode is "${options.sandboxConfig.mode}". ` +
            'Omitting it causes the task to run unsandboxed on the host.',
        );
      }
      this.sandboxProvider = options.sandboxProvider ?? new DisabledSandboxProvider();
      this.sandboxConfig = options.sandboxConfig ?? DEFAULT_SANDBOX_CONFIG;
    }
    this.streamParser = new StreamParser();
    this.completionEnforcer = this.createCompletionEnforcer();
    this.setupStreamParsing();
    this.setupLogWatcher();
  }

  private createCompletionEnforcer(): CompletionEnforcer {
    const callbacks: CompletionEnforcerCallbacks = {
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

  private setupLogWatcher(): void {
    this.logWatcher = createLogWatcher();

    this.logWatcher.on('error', (error: OpenCodeLogError) => {
      if (!this.hasCompleted && this.ptyProcess) {
        log.info(`[OpenCode Adapter] Log watcher detected error: ${error.errorName}`);

        const errorMessage = OpenCodeLogWatcher.getErrorMessage(error);

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

        if (error.isAuthError && error.providerID) {
          log.info(`[OpenCode Adapter] Emitting auth-error for provider: ${error.providerID}`);
          this.emit('auth-error', {
            providerId: error.providerID,
            message: errorMessage,
          });
        }

        this.hasCompleted = true;
        this.emit('complete', {
          status: 'error',
          sessionId: this.currentSessionId || undefined,
          error: errorMessage,
        });

        if (this.ptyProcess) {
          try {
            this.ptyProcess.kill();
          } catch (err) {
            log.warn('[OpenCode Adapter] Error killing PTY after log error:', {
              error: String(err),
            });
          }
          this.ptyProcess = null;
        }
      }
    });
  }

  async startTask(config: TaskConfig): Promise<Task> {
    if (this.isDisposed) {
      throw new Error('Adapter has been disposed and cannot start new tasks');
    }

    const taskId = config.taskId || generateTaskId();
    this.currentTaskId = taskId;
    this.currentSessionId = null;
    this.currentModelId = config.modelId || null;
    this.messages = [];
    this.streamParser.reset();
    this.hasCompleted = false;
    this.wasInterrupted = false;
    this.completionEnforcer.reset();
    this.lastWorkingDirectory = config.workingDirectory;
    this.hasReceivedFirstTool = false;
    this.startTaskCalled = false;
    this.outputBuffer = '';
    if (this.waitingTransitionTimer) {
      clearTimeout(this.waitingTransitionTimer);
      this.waitingTransitionTimer = null;
    }

    if (this.logWatcher) {
      await this.logWatcher.start();
    }

    if (this.options.onBeforeStart) {
      await this.options.onBeforeStart();
    }

    const cliArgs = await this.options.buildCliArgs(config);

    const { command, args: baseArgs } = this.options.getCliCommand();
    const startMsg = `Starting: ${command} ${[...baseArgs, ...cliArgs].join(' ')}`;
    log.info(`[OpenCode CLI] ${startMsg}`);
    this.emit('debug', { type: 'info', message: startMsg });

    const env = await this.options.buildEnvironment(taskId);

    const allArgs = [...baseArgs, ...cliArgs];
    const cmdMsg = `Command: ${command}`;
    const argsMsg = `Args: ${allArgs.join(' ')}`;
    const safeCwd = config.workingDirectory || this.options.tempPath;
    const cwdMsg = `Working directory: ${safeCwd}`;

    if (this.options.isPackaged && this.options.platform === 'win32') {
      const dummyPackageJson = path.join(safeCwd, 'package.json');
      if (!fs.existsSync(dummyPackageJson)) {
        try {
          fs.writeFileSync(
            dummyPackageJson,
            JSON.stringify({ name: 'opencode-workspace', private: true }, null, 2),
          );
          log.info(`[OpenCode CLI] Created workspace package.json at: ${dummyPackageJson}`);
        } catch (err) {
          log.warn('[OpenCode CLI] Could not create workspace package.json:', {
            error: String(err),
          });
        }
      }
    }

    log.info(`[OpenCode CLI] ${cmdMsg}`);
    log.info(`[OpenCode CLI] ${argsMsg}`);
    log.info(`[OpenCode CLI] ${cwdMsg}`);

    this.emit('debug', { type: 'info', message: cmdMsg });
    this.emit('debug', { type: 'info', message: argsMsg, data: { args: allArgs } });
    this.emit('debug', { type: 'info', message: cwdMsg });

    {
      const { file: spawnFile, args: spawnArgs } = buildPtySpawnArgs(
        command,
        allArgs,
        this.options.platform,
        this.options.isPackaged,
      );

      const spawnMsg = `PTY spawn: ${spawnFile} ${spawnArgs.join(' ')}`;
      log.info(`[OpenCode CLI] ${spawnMsg}`);
      this.emit('debug', { type: 'info', message: spawnMsg });

      const sandboxedArgs = await this.sandboxProvider.wrapSpawnArgs(
        {
          file: spawnFile,
          args: spawnArgs,
          cwd: safeCwd,
          env: env,
        },
        this.sandboxConfig,
      );

      this.ptyProcess = pty.spawn(sandboxedArgs.file, sandboxedArgs.args, {
        name: 'xterm-256color',
        cols: 32000,
        rows: 30,
        cwd: sandboxedArgs.cwd,
        env: sandboxedArgs.env,
      });
      const pidMsg = `PTY Process PID: ${this.ptyProcess.pid}`;
      log.info(`[OpenCode CLI] ${pidMsg}`);
      this.emit('debug', { type: 'info', message: pidMsg });

      this.emit('progress', { stage: 'loading', message: 'Loading agent...' });

      this.ptyProcess.onData((data: string) => {
        /* eslint-disable no-control-regex */
        const cleanData = data
          .replace(/\x1B\[[0-9;?]*[a-zA-Z]/g, '')
          .replace(/\x1B\][^\x07]*\x07/g, '')
          .replace(/\x1B\][^\x1B]*\x1B\\/g, '');
        /* eslint-enable no-control-regex */
        // Check for embedded browser-frame JSON lines (even for split PTY chunks).
        // Use the returned value — browser-frame lines are stripped so they don't
        // pollute outputBuffer or StreamParser with large base64 payloads.
        const passthroughData = this.checkForBrowserFrame(cleanData);

        if (passthroughData.trim()) {
          const truncated =
            passthroughData.substring(0, LOG_TRUNCATION_LIMIT) +
            (passthroughData.length > LOG_TRUNCATION_LIMIT ? '...' : '');
          log.info(`[OpenCode CLI stdout]: ${truncated}`);
          this.emit('debug', { type: 'stdout', message: passthroughData });

          this.appendToOutputBuffer(passthroughData);

          this.streamParser.feed(passthroughData);
        }
      });

      this.ptyProcess.onExit(({ exitCode, signal }) => {
        const exitMsg = `PTY Process exited with code: ${exitCode}, signal: ${signal}`;
        log.info(`[OpenCode CLI] ${exitMsg}`);
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

  async resumeSession(sessionId: string, prompt: string): Promise<Task> {
    return this.startTask({
      prompt,
      sessionId,
    });
  }

  async sendResponse(response: string): Promise<void> {
    if (!this.ptyProcess) {
      throw new Error('No active process');
    }

    this.ptyProcess.write(response + '\n');
    log.info('[OpenCode CLI] Response sent via PTY');
  }

  async cancelTask(): Promise<void> {
    if (this.ptyProcess) {
      this.ptyProcess.kill();
      this.ptyProcess = null;
    }
  }

  async interruptTask(): Promise<void> {
    if (!this.ptyProcess) {
      log.info('[OpenCode CLI] No active process to interrupt');
      return;
    }

    this.wasInterrupted = true;

    this.ptyProcess.write('\x03');
    log.info('[OpenCode CLI] Sent Ctrl+C interrupt signal');

    if (this.options.platform === 'win32') {
      setTimeout(() => {
        if (this.ptyProcess) {
          this.ptyProcess.write('Y\n');
          log.info('[OpenCode CLI] Sent Y to confirm batch termination');
        }
      }, 100);
    }
  }

  getSessionId(): string | null {
    return this.currentSessionId;
  }

  getTaskId(): string | null {
    return this.currentTaskId;
  }

  get running(): boolean {
    return this.ptyProcess !== null && !this.hasCompleted;
  }

  isAdapterDisposed(): boolean {
    return this.isDisposed;
  }

  dispose(): void {
    if (this.isDisposed) {
      return;
    }

    log.info(`[OpenCode Adapter] Disposing adapter for task ${this.currentTaskId}`);
    this.isDisposed = true;
    this.browserFrameBuffer = '';

    if (this.logWatcher) {
      this.logWatcher.stop().catch((err) => {
        log.warn(`[OpenCode Adapter] Error stopping log watcher: ${err}`);
      });
    }

    if (this.ptyProcess) {
      try {
        this.ptyProcess.kill();
      } catch (error) {
        log.error(`[OpenCode Adapter] Error killing PTY process: ${error}`);
      }
      this.ptyProcess = null;
    }

    this.currentSessionId = null;
    this.currentTaskId = null;
    this.messages = [];
    this.hasCompleted = true;
    this.currentModelId = null;
    this.hasReceivedFirstTool = false;
    this.startTaskCalled = false;

    if (this.waitingTransitionTimer) {
      clearTimeout(this.waitingTransitionTimer);
      this.waitingTransitionTimer = null;
    }

    this.streamParser.reset();
    this.removeAllListeners();

    log.info('[OpenCode Adapter] Adapter disposed');
  }

  private setupStreamParsing(): void {
    this.streamParser.on('message', (message: OpenCodeMessage) => {
      this.handleMessage(message);
    });

    this.streamParser.on('error', (error: Error) => {
      log.warn(`[OpenCode Adapter] Stream parse warning: ${error.message}`);
      this.emit('debug', { type: 'parse-warning', message: error.message });
    });
  }

  private handleMessage(message: OpenCodeMessage): void {
    log.info(`[OpenCode Adapter] Handling message type: ${message.type}`);

    switch (message.type) {
      case 'step_start': {
        this.currentSessionId = message.part.sessionID;
        const modelDisplayName =
          this.currentModelId && this.options.getModelDisplayName
            ? this.options.getModelDisplayName(this.currentModelId)
            : 'AI';
        this.emit('progress', {
          stage: 'connecting',
          message: `Connecting to ${modelDisplayName}...`,
          modelName: modelDisplayName,
        });
        if (this.waitingTransitionTimer) {
          clearTimeout(this.waitingTransitionTimer);
        }
        this.waitingTransitionTimer = setTimeout(() => {
          if (!this.hasReceivedFirstTool && !this.hasCompleted) {
            this.emit('progress', { stage: 'waiting', message: 'Waiting for response...' });
          }
        }, 500);
        break;
      }

      case 'text':
        if (!this.currentSessionId && message.part.sessionID) {
          this.currentSessionId = message.part.sessionID;
        }
        if (!this.completionEnforcer.isInContinuation()) {
          this.emit('message', message);
        }

        if (message.part.text) {
          const taskMessage: TaskMessage = {
            id: generateMessageId(),
            type: 'assistant',
            content: message.part.text,
            timestamp: new Date().toISOString(),
          };
          this.messages.push(taskMessage);
          if (!this.completionEnforcer.isInContinuation()) {
            this.emit('reasoning', message.part.text);
          }
        }
        break;

      case 'tool_call':
        this.handleToolCall(
          message.part.tool || 'unknown',
          message.part.input,
          message.part.sessionID,
        );
        break;

      case 'tool_use': {
        const toolUseMessage =
          message as import('../../common/types/opencode.js').OpenCodeToolUseMessage;
        const toolUseName = toolUseMessage.part.tool || 'unknown';
        const toolUseInput = toolUseMessage.part.state?.input;
        const toolUseOutput = toolUseMessage.part.state?.output || '';

        this.handleToolCall(toolUseName, toolUseInput, toolUseMessage.part.sessionID);

        const toolDescription = (toolUseInput as { description?: string })?.description;
        if (toolDescription) {
          const syntheticTextMessage: OpenCodeMessage = {
            type: 'text',
            timestamp: message.timestamp,
            sessionID: message.sessionID,
            part: {
              id: generateMessageId(),
              sessionID: toolUseMessage.part.sessionID,
              messageID: toolUseMessage.part.messageID,
              type: 'text',
              text: toolDescription,
            },
          } as import('../../common/types/opencode.js').OpenCodeTextMessage;
          this.emit('message', syntheticTextMessage);
        }

        this.emit('message', message);
        const toolUseStatus = toolUseMessage.part.state?.status;

        log.info(`[OpenCode Adapter] Tool use: ${toolUseName} status: ${toolUseStatus}`);

        if (toolUseStatus === 'completed' || toolUseStatus === 'error') {
          if (
            isRequestConnectorAuthTool(toolUseName) &&
            toolUseOutput.includes(CONNECTOR_AUTH_REQUIRED_MARKER)
          ) {
            this.pauseForConnectorAuth(
              toolUseInput as ConnectorAuthPauseInput,
              toolUseMessage.part.sessionID,
            );
            break;
          }

          this.emit('tool-result', toolUseOutput);
          this.emit('tool-call-complete', {
            toolName: toolUseName,
            toolInput: toolUseInput,
            toolOutput: toolUseOutput,
            sessionId: this.currentSessionId || undefined,
          });
        }

        break;
      }

      case 'tool_result': {
        const toolOutput = message.part.output || '';
        log.info(`[OpenCode Adapter] Tool result received, length: ${toolOutput.length}`);
        this.emit('tool-result', toolOutput);
        break;
      }

      case 'step_finish': {
        this.emit('step-finish', {
          reason: message.part.reason,
          model: this.currentModelId || undefined,
          tokens: message.part.tokens,
          cost: message.part.cost,
        });
        if (message.part.reason === 'error') {
          if (!this.hasCompleted) {
            this.hasCompleted = true;
            const errorMessage = classifyProcessError(undefined, this.outputBuffer);
            this.emit('complete', {
              status: 'error',
              sessionId: this.currentSessionId || undefined,
              error: errorMessage,
            });
          }
          break;
        }

        const action = this.completionEnforcer.handleStepFinish(message.part.reason);
        log.info(`[OpenCode Adapter] step_finish action: ${action}`);

        if (action === 'complete' && !this.hasCompleted) {
          this.hasCompleted = true;
          this.emit('complete', {
            status: 'success',
            sessionId: this.currentSessionId || undefined,
          });
        }
        break;
      }

      case 'error':
        this.hasCompleted = true;
        this.emit('complete', {
          status: 'error',
          sessionId: this.currentSessionId || undefined,
          error: serializeError(message.error),
        });
        break;

      default: {
        const unknownMessage = message as unknown as { type: string };
        log.info(`[OpenCode Adapter] Unknown message type: ${unknownMessage.type}`);
      }
    }
  }

  private handleToolCall(toolName: string, toolInput: unknown, sessionID?: string): void {
    // Normalize rejected tool calls from local models (e.g. Ollama).
    // opencode returns toolName='invalid'/'unknown' with { tool: 'complete_task' } in input.
    // Detect and re-route to the canonical tool name so all bookkeeping runs correctly.
    if (toolName === 'invalid' || toolName === 'unknown') {
      const rejectedInput = toolInput as { tool?: string } | undefined;
      const rejectedTool = rejectedInput?.tool?.trim();
      if (
        rejectedTool &&
        rejectedTool !== toolName &&
        rejectedTool !== 'invalid' &&
        rejectedTool !== 'unknown'
      ) {
        this.handleToolCall(rejectedTool, toolInput, sessionID);
        return;
      }
      // rejectedTool is absent or resolves to an invalid name — stop here.
      this.emit('debug', {
        type: 'warning',
        message: `[OpenCode Adapter] Skipping unresolvable rejected tool call: toolName="${toolName}", rejectedTool="${rejectedTool}"`,
      });
      return;
    }

    if (isStartTaskTool(toolName)) {
      this.startTaskCalled = true;
      const startInput = toolInput as StartTaskInput;
      if (startInput?.needs_planning) {
        this.completionEnforcer.markTaskRequiresCompletion();
        if (startInput.goal && startInput.steps) {
          this.emit(
            'message',
            buildPlanMessage(startInput, sessionID || this.currentSessionId || '', () =>
              generateMessageId(),
            ),
          );
          log.info('[OpenCode Adapter] Emitted synthetic plan message');
          const todos: TodoItem[] = startInput.steps.map((step, i) => ({
            id: String(i + 1),
            content: step,
            status: i === 0 ? 'in_progress' : 'pending',
            priority: 'medium',
          }));
          if (todos.length > 0) {
            this.emit('todo:update', todos);
            this.completionEnforcer.updateTodos(todos);
          }
        }
      }
    }

    if (!this.startTaskCalled && !isExemptTool(toolName)) {
      this.emit('debug', {
        type: 'warning',
        message: `Tool "${toolName}" called before start_task - plan may not be captured`,
      });
    }

    if (!this.hasReceivedFirstTool) {
      this.hasReceivedFirstTool = true;
      if (this.waitingTransitionTimer) {
        clearTimeout(this.waitingTransitionTimer);
        this.waitingTransitionTimer = null;
      }
    }

    this.completionEnforcer.markToolsUsed(!isNonTaskContinuationTool(toolName));

    // Intercept invalid tool calls where model tried to call complete_task but opencode rejected it.
    // This happens with local models (e.g. Ollama) that don't support function calling natively —
    // opencode returns toolName='invalid' with { tool: 'complete_task' } in the input, causing
    // CompletionEnforcer to never detect completion and enter a "Retrying..." loop.
    if (toolName === 'invalid' || toolName === 'unknown') {
      const invalidInput = toolInput as { tool?: string; status?: string; summary?: string };
      if (
        invalidInput?.tool === 'complete_task' ||
        (typeof invalidInput?.tool === 'string' && invalidInput.tool.endsWith('_complete_task'))
      ) {
        this.completionEnforcer.handleCompleteTaskDetection({
          status: invalidInput.status ?? 'success',
          summary: invalidInput.summary ?? 'Task completed.',
        });
        return;
      }
    }

    if (toolName === 'complete_task' || toolName.endsWith('_complete_task')) {
      this.completionEnforcer.handleCompleteTaskDetection(toolInput);
      const completeInput = toolInput as { summary?: string };
      if (completeInput?.summary && this.completionEnforcer.shouldComplete()) {
        this.emit('message', {
          type: 'text',
          part: {
            type: 'text',
            text: completeInput.summary,
            sessionID: sessionID || this.currentSessionId || '',
          },
        } as OpenCodeMessage);
        this.messages.push({
          id: generateMessageId(),
          type: 'assistant',
          content: completeInput.summary,
          timestamp: new Date().toISOString(),
        });
      }
    }

    if (toolName === 'todowrite' || toolName.endsWith('_todowrite')) {
      const input = toolInput as { todos?: Array<Partial<TodoItem> & { content: string }> };
      if (input?.todos && Array.isArray(input.todos) && input.todos.length > 0) {
        // OpenCode's todowrite doesn't include an id field — synthesize a unique one
        const todos: TodoItem[] = input.todos.map((todo) => ({
          id: todo.id || crypto.randomUUID(),
          content: todo.content,
          status: (todo.status as TodoItem['status']) || 'pending',
          priority: (todo.priority as TodoItem['priority']) || 'medium',
        }));
        this.emit('todo:update', todos);
        this.completionEnforcer.updateTodos(todos);
      }
    }

    this.emit('tool-use', toolName, toolInput);
    this.emit('progress', {
      stage: 'tool-use',
      message: `Using ${toolName}`,
    });
  }

  private handleProcessExit(code: number | null): void {
    this.ptyProcess = null;

    if (this.wasInterrupted && isNormalExit(code, this.options.platform) && !this.hasCompleted) {
      log.info('[OpenCode CLI] Task was interrupted by user');
      this.hasCompleted = true;
      this.emit('complete', {
        status: 'interrupted',
        sessionId: this.currentSessionId || undefined,
      });
      this.currentTaskId = null;
      return;
    }

    if (isNormalExit(code, this.options.platform) && !this.hasCompleted) {
      // Normalize Windows Ctrl+C exit code to 0 so the completion enforcer treats it as a clean exit
      const normalizedCode = code === WINDOWS_CTRL_C_EXIT_CODE ? 0 : (code ?? 0);
      this.completionEnforcer.handleProcessExit(normalizedCode).catch((error) => {
        log.error(`[OpenCode Adapter] Completion enforcer error: ${error}`);
        this.hasCompleted = true;
        this.emit('complete', {
          status: 'error',
          sessionId: this.currentSessionId || undefined,
          error: `Failed to complete: ${error.message}`,
        });
      });
      return;
    }

    if (!this.hasCompleted && !isNormalExit(code, this.options.platform)) {
      // Treat null (abnormal PTY termination) and non-zero non-normal codes as errors
      const errorMessage = classifyProcessError(code ?? undefined, this.outputBuffer);
      this.emit('error', new Error(errorMessage));
    }

    this.currentTaskId = null;
  }

  private async spawnSessionResumption(prompt: string): Promise<void> {
    const sessionId = this.currentSessionId;
    if (!sessionId) {
      throw new Error('No session ID available for session resumption');
    }

    log.info(`[OpenCode Adapter] Starting session resumption with session ${sessionId}`);

    this.streamParser.reset();
    this.outputBuffer = '';

    const config: TaskConfig = {
      prompt,
      sessionId: sessionId,
      workingDirectory: this.lastWorkingDirectory,
    };

    const cliArgs = await this.options.buildCliArgs(config);

    const { command, args: baseArgs } = this.options.getCliCommand();
    log.info(
      `[OpenCode Adapter] Session resumption command: ${command} ${[...baseArgs, ...cliArgs].join(' ')}`,
    );

    const env = await this.options.buildEnvironment(this.currentTaskId || 'default');

    const allArgs = [...baseArgs, ...cliArgs];
    const safeCwd = config.workingDirectory || this.options.tempPath;

    const { file: spawnFile, args: spawnArgs } = buildPtySpawnArgs(
      command,
      allArgs,
      this.options.platform,
      this.options.isPackaged,
    );

    const sandboxedArgs = await this.sandboxProvider.wrapSpawnArgs(
      {
        file: spawnFile,
        args: spawnArgs,
        cwd: safeCwd,
        env: env,
      },
      this.sandboxConfig,
    );

    this.ptyProcess = pty.spawn(sandboxedArgs.file, sandboxedArgs.args, {
      name: 'xterm-256color',
      cols: 32000,
      rows: 30,
      cwd: sandboxedArgs.cwd,
      env: sandboxedArgs.env,
    });

    this.ptyProcess.onData((data: string) => {
      /* eslint-disable no-control-regex */
      const cleanData = data
        .replace(/\x1B\[[0-9;?]*[a-zA-Z]/g, '')
        .replace(/\x1B\][^\x07]*\x07/g, '')
        .replace(/\x1B\][^\x1B]*\x1B\\/g, '');
      /* eslint-enable no-control-regex */
      // Route through checkForBrowserFrame so continuation PTY frames are not dropped
      const passthroughData = this.checkForBrowserFrame(cleanData);
      if (passthroughData.trim()) {
        const truncated =
          passthroughData.substring(0, LOG_TRUNCATION_LIMIT) +
          (passthroughData.length > LOG_TRUNCATION_LIMIT ? '...' : '');
        log.info(`[OpenCode CLI stdout]: ${truncated}`);
        this.emit('debug', { type: 'stdout', message: passthroughData });

        this.appendToOutputBuffer(passthroughData);

        this.streamParser.feed(passthroughData);
      }
    });

    this.ptyProcess.onExit(({ exitCode }) => {
      this.handleProcessExit(exitCode);
    });
  }

  private pauseForConnectorAuth(input: ConnectorAuthPauseInput, sessionId?: string): void {
    if (this.hasCompleted) {
      return;
    }

    if (!this.currentSessionId && sessionId) {
      this.currentSessionId = sessionId;
    }

    if (!input.providerId) {
      this.hasCompleted = true;
      this.emit('complete', {
        status: 'error',
        sessionId: this.currentSessionId || undefined,
        error:
          'The agent requested connector authentication without specifying which connector to authenticate.',
      });
      return;
    }

    if (!isOAuthProviderId(input.providerId)) {
      this.hasCompleted = true;
      this.emit('complete', {
        status: 'error',
        sessionId: this.currentSessionId || undefined,
        error: `The agent requested connector authentication for an unsupported connector provider: ${input.providerId}.`,
      });
      return;
    }

    const providerId = input.providerId;
    const providerName = getOAuthProviderDisplayName(providerId);
    const pauseMessage =
      input.message?.trim() ||
      `I need ${providerName} connected to continue. Click Authenticate ${providerName}.`;

    log.info('[OpenCode Adapter] Pausing for connector auth', {
      providerId,
      hasCustomMessage: Boolean(input.message?.trim()),
    });

    if (this.waitingTransitionTimer) {
      clearTimeout(this.waitingTransitionTimer);
      this.waitingTransitionTimer = null;
    }

    const effectiveSessionId = this.currentSessionId || sessionId || '';

    // Emit a synthetic text message so the user sees the pause reason
    const syntheticMessage: OpenCodeMessage = {
      type: 'text',
      timestamp: Date.now(),
      sessionID: effectiveSessionId,
      part: {
        id: generateMessageId(),
        sessionID: effectiveSessionId,
        messageID: generateMessageId(),
        type: 'text',
        text: pauseMessage,
      },
    } as import('../../common/types/opencode.js').OpenCodeTextMessage;
    this.emit('message', syntheticMessage);

    this.hasCompleted = true;
    this.emit('complete', {
      status: 'success',
      sessionId: this.currentSessionId || undefined,
      pauseReason: 'auth',
      pauseAction: {
        type: 'oauth-connect',
        providerId,
        label: input.label?.trim() || `Authenticate ${providerName}`,
        pendingLabel: input.pendingLabel?.trim() || `Authenticating ${providerName}...`,
        successText: input.successText?.trim() || `${providerName} is connected.`,
      },
    });

    if (this.ptyProcess) {
      try {
        this.ptyProcess.kill();
      } catch (error) {
        log.warn(`[OpenCode Adapter] Error killing PTY during connector auth pause: ${error}`);
      }
      this.ptyProcess = null;
    }
  }
}

export function createAdapter(options: AdapterOptions, taskId?: string): OpenCodeAdapter {
  return new OpenCodeAdapter(options, taskId);
}
