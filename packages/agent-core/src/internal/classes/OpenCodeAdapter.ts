import * as pty from 'node-pty';
import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { StreamParser } from './StreamParser.js';
import { OpenCodeLogWatcher, createLogWatcher, OpenCodeLogError } from './OpenCodeLogWatcher.js';
import { CompletionEnforcer, CompletionEnforcerCallbacks } from '../../opencode/completion/index.js';
import type { TaskConfig, Task, TaskMessage, TaskResult } from '../../common/types/task.js';
import type { OpenCodeMessage } from '../../common/types/opencode.js';
import type { PermissionRequest } from '../../common/types/permission.js';
import type { TodoItem } from '../../common/types/todo.js';

export class OpenCodeCliNotFoundError extends Error {
  constructor() {
    super(
      'OpenCode CLI is not available. The bundled CLI may be missing or corrupted. Please reinstall the application.'
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
  private options: AdapterOptions;

  constructor(options: AdapterOptions, taskId?: string) {
    super();
    this.options = options;
    this.currentTaskId = taskId || null;
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
        console.log('[OpenCode Adapter] Log watcher detected error:', error.errorName);

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
          console.log('[OpenCode Adapter] Emitting auth-error for provider:', error.providerID);
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
            console.warn('[OpenCode Adapter] Error killing PTY after log error:', err);
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

    const taskId = config.taskId || this.generateTaskId();
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
    console.log('[OpenCode CLI]', startMsg);
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
          fs.writeFileSync(dummyPackageJson, JSON.stringify({ name: 'opencode-workspace', private: true }, null, 2));
          console.log('[OpenCode CLI] Created workspace package.json at:', dummyPackageJson);
        } catch (err) {
          console.warn('[OpenCode CLI] Could not create workspace package.json:', err);
        }
      }
    }

    console.log('[OpenCode CLI]', cmdMsg);
    console.log('[OpenCode CLI]', argsMsg);
    console.log('[OpenCode CLI]', cwdMsg);

    this.emit('debug', { type: 'info', message: cmdMsg });
    this.emit('debug', { type: 'info', message: argsMsg, data: { args: allArgs } });
    this.emit('debug', { type: 'info', message: cwdMsg });

    {
      const fullCommand = this.buildShellCommand(command, allArgs);

      const shellCmdMsg = `Full shell command: ${fullCommand}`;
      console.log('[OpenCode CLI]', shellCmdMsg);
      this.emit('debug', { type: 'info', message: shellCmdMsg });

      const shellCmd = this.getPlatformShell();
      const shellArgs = this.getShellArgs(fullCommand);
      const shellMsg = `Using shell: ${shellCmd} ${shellArgs.join(' ')}`;
      console.log('[OpenCode CLI]', shellMsg);
      this.emit('debug', { type: 'info', message: shellMsg });

      this.ptyProcess = pty.spawn(shellCmd, shellArgs, {
        name: 'xterm-256color',
        cols: 32000,
        rows: 30,
        cwd: safeCwd,
        env: env as { [key: string]: string },
      });
      const pidMsg = `PTY Process PID: ${this.ptyProcess.pid}`;
      console.log('[OpenCode CLI]', pidMsg);
      this.emit('debug', { type: 'info', message: pidMsg });

      this.emit('progress', { stage: 'loading', message: 'Loading agent...' });

      this.ptyProcess.onData((data: string) => {
        const cleanData = data
          .replace(/\x1B\[[0-9;?]*[a-zA-Z]/g, '')
          .replace(/\x1B\][^\x07]*\x07/g, '')
          .replace(/\x1B\][^\x1B]*\x1B\\/g, '');
        if (cleanData.trim()) {
          const truncated = cleanData.substring(0, 500) + (cleanData.length > 500 ? '...' : '');
          console.log('[OpenCode CLI stdout]:', truncated);
          this.emit('debug', { type: 'stdout', message: cleanData });

          this.streamParser.feed(cleanData);
        }
      });

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
    console.log('[OpenCode CLI] Response sent via PTY');
  }

  async cancelTask(): Promise<void> {
    if (this.ptyProcess) {
      this.ptyProcess.kill();
      this.ptyProcess = null;
    }
  }

  async interruptTask(): Promise<void> {
    if (!this.ptyProcess) {
      console.log('[OpenCode CLI] No active process to interrupt');
      return;
    }

    this.wasInterrupted = true;

    this.ptyProcess.write('\x03');
    console.log('[OpenCode CLI] Sent Ctrl+C interrupt signal');

    if (this.options.platform === 'win32') {
      setTimeout(() => {
        if (this.ptyProcess) {
          this.ptyProcess.write('Y\n');
          console.log('[OpenCode CLI] Sent Y to confirm batch termination');
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

    console.log(`[OpenCode Adapter] Disposing adapter for task ${this.currentTaskId}`);
    this.isDisposed = true;

    if (this.logWatcher) {
      this.logWatcher.stop().catch((err) => {
        console.warn('[OpenCode Adapter] Error stopping log watcher:', err);
      });
    }

    if (this.ptyProcess) {
      try {
        this.ptyProcess.kill();
      } catch (error) {
        console.error('[OpenCode Adapter] Error killing PTY process:', error);
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

    console.log('[OpenCode Adapter] Adapter disposed');
  }

  private escapeShellArg(arg: string): string {
    if (this.options.platform === 'win32') {
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

  private buildShellCommand(command: string, args: string[]): string {
    const escapedCommand = this.escapeShellArg(command);
    const escapedArgs = args.map(arg => this.escapeShellArg(arg));
    return [escapedCommand, ...escapedArgs].join(' ');
  }

  private setupStreamParsing(): void {
    this.streamParser.on('message', (message: OpenCodeMessage) => {
      this.handleMessage(message);
    });

    this.streamParser.on('error', (error: Error) => {
      console.warn('[OpenCode Adapter] Stream parse warning:', error.message);
      this.emit('debug', { type: 'parse-warning', message: error.message });
    });
  }

  private handleMessage(message: OpenCodeMessage): void {
    console.log('[OpenCode Adapter] Handling message type:', message.type);

    switch (message.type) {
      case 'step_start':
        this.currentSessionId = message.part.sessionID;
        const modelDisplayName = this.currentModelId && this.options.getModelDisplayName
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

      case 'tool_call':
        this.handleToolCall(message.part.tool || 'unknown', message.part.input, message.part.sessionID);
        break;

      case 'tool_use':
        const toolUseMessage = message as import('../../common/types/opencode.js').OpenCodeToolUseMessage;
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
              id: this.generateMessageId(),
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

        console.log('[OpenCode Adapter] Tool use:', toolUseName, 'status:', toolUseStatus);

        if (toolUseStatus === 'completed' || toolUseStatus === 'error') {
          this.emit('tool-result', toolUseOutput);
        }

        if (toolUseName === 'AskUserQuestion') {
          this.handleAskUserQuestion(toolUseInput as AskUserQuestionInput);
        }
        break;

      case 'tool_result':
        const toolOutput = message.part.output || '';
        console.log('[OpenCode Adapter] Tool result received, length:', toolOutput.length);
        this.emit('tool-result', toolOutput);
        break;

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

        const action = this.completionEnforcer.handleStepFinish(message.part.reason);
        console.log(`[OpenCode Adapter] step_finish action: ${action}`);

        if (action === 'complete' && !this.hasCompleted) {
          this.hasCompleted = true;
          this.emit('complete', {
            status: 'success',
            sessionId: this.currentSessionId || undefined,
          });
        }
        break;

      case 'error':
        this.hasCompleted = true;
        this.emit('complete', {
          status: 'error',
          sessionId: this.currentSessionId || undefined,
          error: message.error,
        });
        break;

      default:
        const unknownMessage = message as unknown as { type: string };
        console.log('[OpenCode Adapter] Unknown message type:', unknownMessage.type);
    }
  }

  private handleToolCall(toolName: string, toolInput: unknown, sessionID?: string): void {
    console.log('[OpenCode Adapter] Tool call:', toolName);

    if (this.isStartTaskTool(toolName)) {
      this.startTaskCalled = true;
      const startInput = toolInput as StartTaskInput;
      if (startInput?.goal && startInput?.steps) {
        this.emitPlanMessage(startInput, sessionID || this.currentSessionId || '');
        const todos: TodoItem[] = startInput.steps.map((step, i) => ({
          id: String(i + 1),
          content: step,
          status: i === 0 ? 'in_progress' : 'pending',
          priority: 'medium',
        }));
        if (todos.length > 0) {
          this.emit('todo:update', todos);
          this.completionEnforcer.updateTodos(todos);
          console.log('[OpenCode Adapter] Created todos from start_task steps');
        }
      }
    }

    if (!this.startTaskCalled && !this.isExemptTool(toolName)) {
      console.warn(`[OpenCode Adapter] Tool "${toolName}" called before start_task`);
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

    this.completionEnforcer.markToolsUsed();

    if (toolName === 'complete_task' || toolName.endsWith('_complete_task')) {
      this.completionEnforcer.handleCompleteTaskDetection(toolInput);
    }

    if (toolName === 'todowrite' || toolName.endsWith('_todowrite')) {
      const input = toolInput as { todos?: TodoItem[] };
      if (input?.todos && Array.isArray(input.todos) && input.todos.length > 0) {
        this.emit('todo:update', input.todos);
        this.completionEnforcer.updateTodos(input.todos);
      }
    }

    this.emit('tool-use', toolName, toolInput);
    this.emit('progress', {
      stage: 'tool-use',
      message: `Using ${toolName}`,
    });

    if (toolName === 'AskUserQuestion') {
      this.handleAskUserQuestion(toolInput as AskUserQuestionInput);
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

  private handleProcessExit(code: number | null): void {
    this.ptyProcess = null;

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
      return;
    }

    if (!this.hasCompleted) {
      if (code !== null && code !== 0) {
        this.emit('error', new Error(`OpenCode CLI exited with code ${code}`));
      }
    }

    this.currentTaskId = null;
  }

  private async spawnSessionResumption(prompt: string): Promise<void> {
    const sessionId = this.currentSessionId;
    if (!sessionId) {
      throw new Error('No session ID available for session resumption');
    }

    console.log(`[OpenCode Adapter] Starting session resumption with session ${sessionId}`);

    this.streamParser.reset();

    const config: TaskConfig = {
      prompt,
      sessionId: sessionId,
      workingDirectory: this.lastWorkingDirectory,
    };

    const cliArgs = await this.options.buildCliArgs(config);

    const { command, args: baseArgs } = this.options.getCliCommand();
    console.log('[OpenCode Adapter] Session resumption command:', command, [...baseArgs, ...cliArgs].join(' '));

    const env = await this.options.buildEnvironment(this.currentTaskId || 'default');

    const allArgs = [...baseArgs, ...cliArgs];
    const safeCwd = config.workingDirectory || this.options.tempPath;

    const fullCommand = this.buildShellCommand(command, allArgs);

    const shellCmd = this.getPlatformShell();
    const shellArgs = this.getShellArgs(fullCommand);

    this.ptyProcess = pty.spawn(shellCmd, shellArgs, {
      name: 'xterm-256color',
      cols: 32000,
      rows: 30,
      cwd: safeCwd,
      env: env as { [key: string]: string },
    });

    this.ptyProcess.onData((data: string) => {
      const cleanData = data
        .replace(/\x1B\[[0-9;?]*[a-zA-Z]/g, '')
        .replace(/\x1B\][^\x07]*\x07/g, '')
        .replace(/\x1B\][^\x1B]*\x1B\\/g, '');
      if (cleanData.trim()) {
        const truncated = cleanData.substring(0, 500) + (cleanData.length > 500 ? '...' : '');
        console.log('[OpenCode CLI stdout]:', truncated);
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

  private isStartTaskTool(toolName: string): boolean {
    return toolName === 'start_task' || toolName.endsWith('_start_task');
  }

  private isExemptTool(toolName: string): boolean {
    if (toolName === 'todowrite' || toolName.endsWith('_todowrite')) {
      return true;
    }
    if (this.isStartTaskTool(toolName)) {
      return true;
    }
    return false;
  }

  private emitPlanMessage(input: StartTaskInput, sessionId: string): void {
    const verificationSection = input.verification?.length
      ? `\n\n**Verification:**\n${input.verification.map((v, i) => `${i + 1}. ${v}`).join('\n')}`
      : '';
    const skillsSection = input.skills?.length
      ? `\n\n**Skills:** ${input.skills.join(', ')}`
      : '';
    const planText = `**Plan:**\n\n**Goal:** ${input.goal}\n\n**Steps:**\n${input.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}${verificationSection}${skillsSection}`;

    const syntheticMessage: OpenCodeMessage = {
      type: 'text',
      timestamp: Date.now(),
      sessionID: sessionId,
      part: {
        id: this.generateMessageId(),
        sessionID: sessionId,
        messageID: this.generateMessageId(),
        type: 'text',
        text: planText,
      },
    } as import('../../common/types/opencode.js').OpenCodeTextMessage;

    this.emit('message', syntheticMessage);
    console.log('[OpenCode Adapter] Emitted synthetic plan message');
  }

  private getPlatformShell(): string {
    if (this.options.platform === 'win32') {
      return 'cmd.exe';
    } else if (this.options.isPackaged && this.options.platform === 'darwin') {
      return '/bin/sh';
    } else {
      const userShell = process.env.SHELL;
      if (userShell) {
        return userShell;
      }
      if (fs.existsSync('/bin/bash')) return '/bin/bash';
      if (fs.existsSync('/bin/zsh')) return '/bin/zsh';
      return '/bin/sh';
    }
  }

  private getShellArgs(command: string): string[] {
    if (this.options.platform === 'win32') {
      return ['/s', '/c', command];
    } else {
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

interface StartTaskInput {
  original_request: string;
  goal: string;
  steps: string[];
  verification: string[];
  skills: string[];
}

export function createAdapter(options: AdapterOptions, taskId?: string): OpenCodeAdapter {
  return new OpenCodeAdapter(options, taskId);
}
