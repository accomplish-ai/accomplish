import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import type {
  OpenCodeStepStartMessage,
  OpenCodeTextMessage,
  OpenCodeToolCallMessage,
  OpenCodeToolUseMessage,
  OpenCodeStepFinishMessage,
  OpenCodeErrorMessage,
} from '@accomplish/agent-core';

const mockApp = {
  isPackaged: false,
  getAppPath: vi.fn(() => '/mock/app/path'),
  getPath: vi.fn((name: string) => `/mock/path/${name}`),
};

vi.mock('electron', () => ({
  app: mockApp,
}));

const mockFs = {
  existsSync: vi.fn(() => true),
  readdirSync: vi.fn(() => []),
  readFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
};

vi.mock('fs', () => ({
  default: mockFs,
  existsSync: mockFs.existsSync,
  readdirSync: mockFs.readdirSync,
  readFileSync: mockFs.readFileSync,
  mkdirSync: mockFs.mkdirSync,
  writeFileSync: mockFs.writeFileSync,
}));

class MockPty extends EventEmitter {
  pid = 12345;
  killed = false;

  write = vi.fn();
  kill = vi.fn(() => {
    this.killed = true;
  });

  simulateData(data: string) {
    const callbacks = this.listeners('data');
    callbacks.forEach((cb) => (cb as (data: string) => void)(data));
  }

  simulateExit(exitCode: number, signal?: number) {
    const callbacks = this.listeners('exit');
    callbacks.forEach((cb) => (cb as (params: { exitCode: number; signal?: number }) => void)({ exitCode, signal }));
  }

  onData(callback: (data: string) => void) {
    this.on('data', callback);
    return { dispose: () => this.off('data', callback) };
  }

  onExit(callback: (params: { exitCode: number; signal?: number }) => void) {
    this.on('exit', callback);
    return { dispose: () => this.off('exit', callback) };
  }
}

const mockPtyInstance = new MockPty();
const mockPtySpawn = vi.fn(() => mockPtyInstance);

vi.mock('node-pty', () => ({
  spawn: mockPtySpawn,
}));

const mockPtyInstanceRef = { current: null as MockPty | null };

vi.mock('@accomplish/agent-core', async () => {
  const { EventEmitter } = await import('events');
  const nodePty = await import('node-pty');

  class MockStreamParser extends EventEmitter {
    private buffer: string = '';

    feed(chunk: string) {
      this.buffer += chunk;
      this.parseBuffer();
    }

    private parseBuffer() {
      while (this.buffer.length > 0) {
        const startIdx = this.buffer.indexOf('{');
        if (startIdx === -1) {
          this.buffer = '';
          return;
        }
        if (startIdx > 0) {
          this.buffer = this.buffer.substring(startIdx);
        }
        let depth = 0;
        let inString = false;
        let escaped = false;
        for (let i = 0; i < this.buffer.length; i++) {
          const ch = this.buffer[i];
          if (escaped) {
            escaped = false;
            continue;
          }
          if (ch === '\\' && inString) {
            escaped = true;
            continue;
          }
          if (ch === '"') {
            inString = !inString;
            continue;
          }
          if (!inString) {
            if (ch === '{') depth++;
            else if (ch === '}') {
              depth--;
              if (depth === 0) {
                const jsonStr = this.buffer.substring(0, i + 1);
                this.buffer = this.buffer.substring(i + 1).replace(/^\s+/, '');
                try {
                  const msg = JSON.parse(jsonStr);
                  this.emit('message', msg);
                } catch {
                }
                break;
              }
            }
          }
        }
        if (depth > 0) {
          return;
        }
      }
    }

    flush() {
      if (this.buffer.trim()) {
        try {
          const msg = JSON.parse(this.buffer.trim());
          this.emit('message', msg);
        } catch {
        }
      }
      this.buffer = '';
    }

    reset() {
      this.buffer = '';
    }
  }

  class MockCompletionEnforcer {
    private callbacks: { onComplete?: () => void; onDebug?: (type: string, msg: string) => void } = {};
    private toolsUsed = false;
    private completeTaskCalled = false;
    private attempts = 0;
    private maxAttempts = 20;

    constructor(callbacks: { onComplete?: () => void; onDebug?: (type: string, msg: string) => void } = {}, maxAttempts = 20) {
      this.callbacks = callbacks;
      this.maxAttempts = maxAttempts;
    }
    handleMessage() {}
    handleStepFinish(reason: string) {
      if (reason === 'tool_use') {
        return 'continue';
      }
      if (this.toolsUsed && !this.completeTaskCalled) {
        this.attempts++;
        if (this.attempts > this.maxAttempts) {
          return 'complete';
        }
        if (this.callbacks.onDebug) {
          this.callbacks.onDebug('continuation', `Scheduled continuation (attempt ${this.attempts})`);
        }
        return 'pending';
      }
      return 'complete';
    }
    markToolsUsed() {
      this.toolsUsed = true;
    }
    forceComplete() {}
    reset() {
      this.toolsUsed = false;
      this.completeTaskCalled = false;
      this.attempts = 0;
    }
    updateTodos() {}
    handleCompleteTaskDetection() {
      this.completeTaskCalled = true;
      return true;
    }
    handleProcessExit() {
      if (this.callbacks.onComplete) {
        this.callbacks.onComplete();
      }
      return Promise.resolve();
    }
    shouldComplete() { return true; }
    getState() { return 'DONE'; }
    getContinuationAttempts() { return this.attempts; }
  }

  class MockLogWatcher extends EventEmitter {
    start() { return Promise.resolve(); }
    stop() { return Promise.resolve(); }
    static getErrorMessage(error: { message?: string }) {
      return error.message || 'Unknown error';
    }
  }

  class MockOpenCodeCliNotFoundError extends Error {
    constructor() {
      super(
        'OpenCode CLI is not available. The bundled CLI may be missing or corrupted. Please reinstall the application.'
      );
      this.name = 'OpenCodeCliNotFoundError';
    }
  }

  class MockOpenCodeAdapter extends EventEmitter {
    private ptyProcess: pty.IPty | null = null;
    private streamParser: MockStreamParser;
    private logWatcher: MockLogWatcher | null = null;
    private currentSessionId: string | null = null;
    private currentTaskId: string | null = null;
    private messages: unknown[] = [];
    private hasCompleted: boolean = false;
    private isDisposed: boolean = false;
    private wasInterrupted: boolean = false;
    private completionEnforcer: MockCompletionEnforcer;
    private options: AdapterOptionsMock;

    constructor(options: AdapterOptionsMock, taskId?: string) {
      super();
      this.options = options;
      this.currentTaskId = taskId || null;
      this.streamParser = new MockStreamParser();
      this.completionEnforcer = this.createCompletionEnforcer();
      this.setupStreamParsing();
      this.logWatcher = new MockLogWatcher();
    }

    private createCompletionEnforcer(): MockCompletionEnforcer {
      const callbacks = {
        onComplete: () => {
          this.hasCompleted = true;
          this.emit('complete', {
            status: 'success',
            sessionId: this.currentSessionId || undefined,
          });
        },
        onDebug: (type: string, message: string) => {
          this.emit('debug', { type, message });
        },
      };
      return new MockCompletionEnforcer(callbacks);
    }

    private setupStreamParsing(): void {
      this.streamParser.on('message', (message: OpenCodeMessageMock) => {
        this.handleMessage(message);
      });

      this.streamParser.on('error', (error: Error) => {
        this.emit('debug', { type: 'parse-warning', message: error.message });
      });
    }

    private handleMessage(message: OpenCodeMessageMock): void {
      switch (message.type) {
        case 'step_start':
          this.currentSessionId = message.part?.sessionID;
          const modelDisplayName = this.options.getModelDisplayName?.('model') || 'AI';
          this.emit('progress', {
            stage: 'connecting',
            message: `Connecting to ${modelDisplayName}...`,
            modelName: modelDisplayName,
          });
          break;

        case 'text':
          if (!this.currentSessionId && message.part?.sessionID) {
            this.currentSessionId = message.part.sessionID;
          }
          this.emit('message', message);
          break;

        case 'tool_call':
          this.handleToolCall(message.part?.tool || 'unknown', message.part?.input, message.part?.sessionID);
          break;

        case 'tool_use':
          const toolUseName = message.part?.tool || 'unknown';
          const toolUseInput = message.part?.state?.input;
          const toolUseOutput = message.part?.state?.output || '';

          this.handleToolCall(toolUseName, toolUseInput, message.part?.sessionID);
          this.emit('message', message);

          const toolUseStatus = message.part?.state?.status;
          if (toolUseStatus === 'completed' || toolUseStatus === 'error') {
            this.emit('tool-result', toolUseOutput);
          }

          if (toolUseName === 'AskUserQuestion') {
            this.handleAskUserQuestion(toolUseInput as AskUserQuestionInputMock);
          }
          break;

        case 'tool_result':
          const toolOutput = message.part?.output || '';
          this.emit('tool-result', toolOutput);
          break;

        case 'step_finish':
          if (message.part?.reason === 'error') {
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

          const action = this.completionEnforcer.handleStepFinish(message.part?.reason || '');
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
      }
    }

    private handleToolCall(toolName: string, toolInput: unknown, _sessionID?: string): void {
      this.completionEnforcer.markToolsUsed();

      if (toolName === 'complete_task' || toolName.endsWith('_complete_task')) {
        this.completionEnforcer.handleCompleteTaskDetection();
      }

      if (toolName === 'todowrite' || toolName.endsWith('_todowrite')) {
        const input = toolInput as { todos?: TodoItemMock[] };
        if (input?.todos && Array.isArray(input.todos) && input.todos.length > 0) {
          this.emit('todo:update', input.todos);
          this.completionEnforcer.updateTodos();
        }
      }

      this.emit('tool-use', toolName, toolInput);
      this.emit('progress', {
        stage: 'tool-use',
        message: `Using ${toolName}`,
      });

      if (toolName === 'AskUserQuestion') {
        this.handleAskUserQuestion(toolInput as AskUserQuestionInputMock);
      }
    }

    private handleAskUserQuestion(input: AskUserQuestionInputMock): void {
      const question = input.questions?.[0];
      if (!question) return;

      const permissionRequest = {
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
        this.hasCompleted = true;
        this.emit('complete', {
          status: 'interrupted',
          sessionId: this.currentSessionId || undefined,
        });
        this.currentTaskId = null;
        return;
      }

      if (code === 0 && !this.hasCompleted) {
        this.completionEnforcer.handleProcessExit().catch(() => {
          this.hasCompleted = true;
          this.emit('complete', {
            status: 'error',
            sessionId: this.currentSessionId || undefined,
            error: 'Failed to complete',
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

    async startTask(config: TaskConfigMock): Promise<TaskMock> {
      if (this.isDisposed) {
        throw new Error('Adapter has been disposed and cannot start new tasks');
      }

      const taskId = config.taskId || this.generateTaskId();
      this.currentTaskId = taskId;
      this.currentSessionId = null;
      this.messages = [];
      this.streamParser.reset();
      this.hasCompleted = false;
      this.wasInterrupted = false;
      this.completionEnforcer.reset();

      if (this.options.onBeforeStart) {
        await this.options.onBeforeStart();
      }

      const startMsg = `Starting: mock command`;
      this.emit('debug', { type: 'info', message: startMsg });

      this.emit('progress', { stage: 'loading', message: 'Loading agent...' });

      this.ptyProcess = nodePty.spawn('/bin/sh', ['-c', 'echo mock'], {
        name: 'xterm-256color',
        cols: 32000,
        rows: 30,
        cwd: config.workingDirectory || this.options.tempPath,
      });

      this.ptyProcess.onData((data: string) => {
        const cleanData = data
          .replace(/\x1B\[[0-9;?]*[a-zA-Z]/g, '')
          .replace(/\x1B\][^\x07]*\x07/g, '')
          .replace(/\x1B\][^\x1B]*\x1B\\/g, '');
        if (cleanData.trim()) {
          this.emit('debug', { type: 'stdout', message: cleanData });
          this.streamParser.feed(cleanData);
        }
      });

      this.ptyProcess.onExit(({ exitCode }) => {
        this.handleProcessExit(exitCode);
      });

      return {
        id: taskId,
        prompt: config.prompt,
        status: 'running',
        messages: [],
        createdAt: new Date().toISOString(),
        startedAt: new Date().toISOString(),
      };
    }

    async resumeSession(sessionId: string, prompt: string): Promise<TaskMock> {
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
    }

    async cancelTask(): Promise<void> {
      if (this.ptyProcess) {
        this.ptyProcess.kill();
        this.ptyProcess = null;
      }
    }

    async interruptTask(): Promise<void> {
      if (!this.ptyProcess) {
        return;
      }
      this.wasInterrupted = true;
      this.ptyProcess.write('\x03');
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

      this.isDisposed = true;

      if (this.ptyProcess) {
        try {
          this.ptyProcess.kill();
        } catch {
          // ignore
        }
        this.ptyProcess = null;
      }

      this.currentSessionId = null;
      this.currentTaskId = null;
      this.messages = [];
      this.hasCompleted = true;

      this.streamParser.reset();
      this.removeAllListeners();
    }

    private generateTaskId(): string {
      return `task_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    }

    private generateRequestId(): string {
      return `req_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    }
  }

  interface AdapterOptionsMock {
    platform: string;
    isPackaged: boolean;
    tempPath: string;
    getCliCommand: () => { command: string; args: string[] };
    buildEnvironment: (taskId: string) => Promise<NodeJS.ProcessEnv>;
    buildCliArgs: (config: TaskConfigMock) => Promise<string[]>;
    onBeforeStart?: () => Promise<void>;
    getModelDisplayName?: (modelId: string) => string;
  }

  interface TaskConfigMock {
    prompt: string;
    taskId?: string;
    sessionId?: string;
    workingDirectory?: string;
  }

  interface TaskMock {
    id: string;
    prompt: string;
    status: string;
    messages: unknown[];
    createdAt: string;
    startedAt: string;
  }

  interface OpenCodeMessageMock {
    type: string;
    part?: {
      sessionID?: string;
      tool?: string;
      input?: unknown;
      output?: string;
      state?: { status?: string; input?: unknown; output?: string };
      reason?: string;
    };
    error?: string;
  }

  interface AskUserQuestionInputMock {
    questions?: Array<{
      question: string;
      header?: string;
      options?: Array<{ label: string; description?: string }>;
      multiSelect?: boolean;
    }>;
  }

  interface TodoItemMock {
    id: string;
    content: string;
    status: string;
    priority?: string;
  }

  return {
    StreamParser: MockStreamParser,
    OpenCodeLogWatcher: MockLogWatcher,
    createLogWatcher: vi.fn(() => new MockLogWatcher()),
    CompletionEnforcer: MockCompletionEnforcer,
    OpenCodeCliNotFoundError: MockOpenCodeCliNotFoundError,
    OpenCodeAdapter: MockOpenCodeAdapter,
    getSelectedModel: vi.fn(() => ({ model: 'claude-3-opus-20240229' })),
    getAzureFoundryConfig: vi.fn(() => null),
    getOpenAiBaseUrl: vi.fn(() => ''),
    getActiveProviderModel: vi.fn(() => null),
    getConnectedProvider: vi.fn(() => null),
    getAzureEntraToken: vi.fn(() => Promise.resolve({ success: true, token: 'mock-token' })),
    getModelDisplayName: vi.fn((model: string) => model),
    resolveCliPath: vi.fn(() => ({ cliPath: '/mock/opencode/cli' })),
    isCliAvailable: vi.fn(() => true),
    ensureDevBrowserServer: vi.fn(() => Promise.resolve()),
  };
});

vi.mock('child_process', () => ({
  execSync: vi.fn(() => '/usr/local/bin/opencode'),
}));

vi.mock('@main/store/secureStorage', () => ({
  getAllApiKeys: vi.fn(() => Promise.resolve({
    anthropic: 'test-anthropic-key',
    openai: 'test-openai-key',
  })),
  getBedrockCredentials: vi.fn(() => null),
}));

vi.mock('@main/opencode/config-generator', () => ({
  generateOpenCodeConfig: vi.fn(() => Promise.resolve('/mock/config/path')),
  syncApiKeysToOpenCodeAuth: vi.fn(() => Promise.resolve()),
  getMcpToolsPath: vi.fn(() => '/mock/mcp-tools'),
  ACCOMPLISH_AGENT_NAME: 'accomplish',
}));

vi.mock('@main/opencode/electron-options', () => ({
  createElectronAdapterOptions: vi.fn(() => ({
    platform: 'darwin',
    isPackaged: false,
    tempPath: '/mock/temp',
    getCliCommand: () => ({ command: '/mock/opencode/cli', args: [] }),
    buildEnvironment: (_taskId: string) => Promise.resolve({ PATH: '/usr/bin' }),
    buildCliArgs: (config: { prompt: string; sessionId?: string }) => Promise.resolve(['run', '--format', 'json', config.prompt]),
    onBeforeStart: () => Promise.resolve(),
    getModelDisplayName: (model: string) => model,
  })),
  createElectronTaskManagerOptions: vi.fn(() => ({})),
  buildEnvironment: vi.fn((_taskId: string) => Promise.resolve({ PATH: '/usr/bin' })),
  buildCliArgs: vi.fn((config: { prompt: string }) => Promise.resolve(['run', '--format', 'json', config.prompt])),
  getCliCommand: vi.fn(() => ({ command: '/mock/opencode/cli', args: [] })),
  isCliAvailable: vi.fn(() => Promise.resolve(true)),
  onBeforeStart: vi.fn(() => Promise.resolve()),
  onBeforeTaskStart: vi.fn(() => Promise.resolve()),
  getOpenCodeCliPath: vi.fn(() => ({ command: '/mock/opencode/cli', args: [] })),
  isOpenCodeBundled: vi.fn(() => true),
  getBundledOpenCodeVersion: vi.fn(() => '1.0.0'),
}));

vi.mock('@main/utils/system-path', () => ({
  getExtendedNodePath: vi.fn((basePath: string) => basePath || '/usr/bin'),
}));

vi.mock('@main/utils/bundled-node', () => ({
  getBundledNodePaths: vi.fn(() => null),
  logBundledNodeInfo: vi.fn(),
}));

vi.mock('@main/permission-api', () => ({
  PERMISSION_API_PORT: 9999,
}));

describe('OpenCode Adapter Module', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let OpenCodeAdapter: any;
  let isOpenCodeCliInstalled: typeof import('@main/opencode').isOpenCodeCliInstalled;
  let getOpenCodeCliVersion: typeof import('@main/opencode').getOpenCodeCliVersion;
  let OpenCodeCliNotFoundError: typeof import('@main/opencode').OpenCodeCliNotFoundError;

  function createTestAdapter(taskId?: string) {
    const options = {
      platform: 'darwin',
      isPackaged: false,
      tempPath: '/mock/temp',
      getCliCommand: () => ({ command: '/mock/opencode/cli', args: [] }),
      buildEnvironment: (_taskId: string) => Promise.resolve({ PATH: '/usr/bin' }),
      buildCliArgs: (config: { prompt: string; sessionId?: string }) => Promise.resolve(['run', '--format', 'json', config.prompt]),
      onBeforeStart: () => Promise.resolve(),
      getModelDisplayName: (model: string) => model,
    };
    return new OpenCodeAdapter(options, taskId);
  }

  beforeEach(async () => {
    vi.clearAllMocks();

    Object.assign(mockPtyInstance, new MockPty());
    mockPtyInstance.killed = false;
    mockPtyInstance.removeAllListeners();

    const desktopModule = await import('@main/opencode');
    const agentCoreModule = await import('@accomplish/agent-core');
    OpenCodeAdapter = (agentCoreModule as unknown as { OpenCodeAdapter: unknown }).OpenCodeAdapter;
    isOpenCodeCliInstalled = desktopModule.isOpenCodeCliInstalled;
    getOpenCodeCliVersion = desktopModule.getOpenCodeCliVersion;
    OpenCodeCliNotFoundError = desktopModule.OpenCodeCliNotFoundError;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  describe('OpenCodeAdapter Class', () => {
    describe('Constructor', () => {
      it('should create adapter instance with optional task ID', () => {

        const adapter = createTestAdapter('test-task-123');

        expect(adapter.getTaskId()).toBe('test-task-123');
        expect(adapter.isAdapterDisposed()).toBe(false);
      });

      it('should create adapter instance without task ID', () => {

        const adapter = createTestAdapter();

        expect(adapter.getTaskId()).toBeNull();
      });
    });

    describe('startTask()', () => {
      it('should spawn PTY process with correct arguments', async () => {

        const adapter = createTestAdapter('test-task');
        const config = {
          prompt: 'Test prompt',
          taskId: 'test-task-123',
        };

        const task = await adapter.startTask(config);

        expect(mockPtySpawn).toHaveBeenCalled();
        expect(task.id).toBe('test-task-123');
        expect(task.prompt).toBe('Test prompt');
        expect(task.status).toBe('running');
      });

      it('should generate task ID if not provided', async () => {

        const adapter = createTestAdapter();
        const config = { prompt: 'Test prompt' };

        const task = await adapter.startTask(config);

        expect(task.id).toMatch(/^task_\d+_[a-z0-9]+$/);
      });

      it('should emit debug events during startup', async () => {

        const adapter = createTestAdapter();
        const debugEvents: Array<{ type: string; message: string }> = [];
        adapter.on('debug', (log) => debugEvents.push(log));

        await adapter.startTask({ prompt: 'Test' });

        expect(debugEvents.length).toBeGreaterThan(0);
        expect(debugEvents.some((e) => e.type === 'info')).toBe(true);
      });

      it('should throw error if adapter is disposed', async () => {

        const adapter = createTestAdapter();
        adapter.dispose();

        await expect(adapter.startTask({ prompt: 'Test' })).rejects.toThrow(
          'Adapter has been disposed'
        );
      });
    });

    describe('Event Emission', () => {
      it('should emit message event when receiving text message', async () => {

        const adapter = createTestAdapter();
        const messages: unknown[] = [];
        adapter.on('message', (msg) => messages.push(msg));

        await adapter.startTask({ prompt: 'Test' });

        const textMessage: OpenCodeTextMessage = {
          type: 'text',
          part: {
            id: 'msg-1',
            sessionID: 'session-123',
            messageID: 'message-123',
            type: 'text',
            text: 'Hello, I am assisting you.',
          },
        };

        mockPtyInstance.simulateData(JSON.stringify(textMessage) + '\n');

        expect(messages.length).toBe(1);
        expect(messages[0]).toMatchObject({ type: 'text' });
      });

      it('should emit progress event on step_start message', async () => {

        const adapter = createTestAdapter();
        const progressEvents: Array<{ stage: string; message?: string }> = [];
        adapter.on('progress', (p) => progressEvents.push(p));

        await adapter.startTask({ prompt: 'Test' });

        expect(progressEvents.length).toBe(1);
        expect(progressEvents[0].stage).toBe('loading');

        const stepStartMessage: OpenCodeStepStartMessage = {
          type: 'step_start',
          part: {
            id: 'step-1',
            sessionID: 'session-123',
            messageID: 'message-123',
            type: 'step-start',
          },
        };

        mockPtyInstance.simulateData(JSON.stringify(stepStartMessage) + '\n');

        expect(progressEvents.length).toBe(2);
        expect(progressEvents[1].stage).toBe('connecting');
      });

      it('should emit tool-use event on tool_call message', async () => {

        const adapter = createTestAdapter();
        const toolEvents: Array<[string, unknown]> = [];
        adapter.on('tool-use', (name, input) => toolEvents.push([name, input]));

        await adapter.startTask({ prompt: 'Test' });

        const toolCallMessage: OpenCodeToolCallMessage = {
          type: 'tool_call',
          part: {
            id: 'tool-1',
            sessionID: 'session-123',
            messageID: 'message-123',
            type: 'tool-call',
            tool: 'Bash',
            input: { command: 'ls -la' },
          },
        };

        mockPtyInstance.simulateData(JSON.stringify(toolCallMessage) + '\n');

        expect(toolEvents.length).toBe(1);
        expect(toolEvents[0][0]).toBe('Bash');
        expect(toolEvents[0][1]).toEqual({ command: 'ls -la' });
      });

      it('should emit tool-use and tool-result events on tool_use message', async () => {

        const adapter = createTestAdapter();
        const toolUseEvents: Array<[string, unknown]> = [];
        const toolResultEvents: string[] = [];
        adapter.on('tool-use', (name, input) => toolUseEvents.push([name, input]));
        adapter.on('tool-result', (output) => toolResultEvents.push(output));

        await adapter.startTask({ prompt: 'Test' });

        const toolUseMessage: OpenCodeToolUseMessage = {
          type: 'tool_use',
          part: {
            id: 'tool-1',
            sessionID: 'session-123',
            messageID: 'message-123',
            type: 'tool',
            tool: 'Read',
            state: {
              status: 'completed',
              input: { path: '/test/file.txt' },
              output: 'File contents here',
            },
          },
        };

        mockPtyInstance.simulateData(JSON.stringify(toolUseMessage) + '\n');

        expect(toolUseEvents.length).toBe(1);
        expect(toolUseEvents[0][0]).toBe('Read');
        expect(toolResultEvents.length).toBe(1);
        expect(toolResultEvents[0]).toBe('File contents here');
      });

      it('should emit complete event on step_finish with stop reason when complete_task was called', async () => {

        const adapter = createTestAdapter();
        const completeEvents: Array<{ status: string; sessionId?: string }> = [];
        adapter.on('complete', (result) => completeEvents.push(result));

        await adapter.startTask({ prompt: 'Test' });

        // Using 'blocked' status to skip verification flow (which only triggers on 'success')
        const toolCallMessage: OpenCodeToolCallMessage = {
          type: 'tool_call',
          part: {
            tool: 'complete_task',
            input: { status: 'blocked', summary: 'Done', original_request_summary: 'Test' },
          },
        };
        mockPtyInstance.simulateData(JSON.stringify(toolCallMessage) + '\n');

        const stepFinishMessage: OpenCodeStepFinishMessage = {
          type: 'step_finish',
          part: {
            id: 'step-1',
            sessionID: 'session-123',
            messageID: 'message-123',
            type: 'step-finish',
            reason: 'stop',
          },
        };

        mockPtyInstance.simulateData(JSON.stringify(stepFinishMessage) + '\n');

        expect(completeEvents.length).toBe(1);
        expect(completeEvents[0].status).toBe('success');
      });

      it('should schedule continuation on step_finish when complete_task was not called', async () => {

        const adapter = createTestAdapter();
        const completeEvents: Array<{ status: string; sessionId?: string }> = [];
        const debugEvents: Array<{ type: string; message: string }> = [];
        adapter.on('complete', (result) => completeEvents.push(result));
        adapter.on('debug', (event) => debugEvents.push(event));

        await adapter.startTask({ prompt: 'Test' });

        // Simulate session ID being set (normally happens via step_start)
        const stepStartMessage = {
          type: 'step_start',
          part: {
            sessionID: 'session-123',
          },
        };
        mockPtyInstance.simulateData(JSON.stringify(stepStartMessage) + '\n');

        // Simulate a tool call so the tool-use guard doesn't skip continuation
        const toolCallMessage: OpenCodeToolCallMessage = {
          type: 'tool_call',
          part: {
            id: 'tool-1',
            sessionID: 'session-123',
            messageID: 'message-123',
            type: 'tool-call',
            tool: 'Bash',
            input: { command: 'ls' },
          },
        };
        mockPtyInstance.simulateData(JSON.stringify(toolCallMessage) + '\n');

        const stepFinishMessage: OpenCodeStepFinishMessage = {
          type: 'step_finish',
          part: {
            id: 'step-1',
            sessionID: 'session-123',
            messageID: 'message-123',
            type: 'step-finish',
            reason: 'stop',
          },
        };

        mockPtyInstance.simulateData(JSON.stringify(stepFinishMessage) + '\n');

        expect(completeEvents.length).toBe(0);
        expect(debugEvents.some(e => e.type === 'continuation')).toBe(true);
      });

      it('should emit complete after max continuation attempts without complete_task', async () => {

        const adapter = createTestAdapter();
        const completeEvents: Array<{ status: string; sessionId?: string }> = [];
        adapter.on('complete', (result) => completeEvents.push(result));

        await adapter.startTask({ prompt: 'Test' });

        // Simulate a tool call so the tool-use guard doesn't skip continuation
        const toolCallMessage: OpenCodeToolCallMessage = {
          type: 'tool_call',
          part: {
            id: 'tool-1',
            sessionID: 'session-123',
            messageID: 'message-123',
            type: 'tool-call',
            tool: 'Bash',
            input: { command: 'ls' },
          },
        };
        mockPtyInstance.simulateData(JSON.stringify(toolCallMessage) + '\n');

        const stepFinishMessage: OpenCodeStepFinishMessage = {
          type: 'step_finish',
          part: {
            id: 'step-1',
            sessionID: 'session-123',
            messageID: 'message-123',
            type: 'step-finish',
            reason: 'stop',
          },
        };

        // Simulate 21 stop events (max attempts is 20).
        // In the real flow, continuation happens after process exit,
        // but for unit testing we simulate multiple step_finish messages.
        // The CompletionEnforcer defaults to maxContinuationAttempts=20.
        for (let i = 0; i < 21; i++) {
          mockPtyInstance.simulateData(JSON.stringify(stepFinishMessage) + '\n');
        }

        expect(completeEvents.length).toBe(1);
        expect(completeEvents[0].status).toBe('success');
      });

      it('should not emit complete event on step_finish with tool_use reason', async () => {

        const adapter = createTestAdapter();
        const completeEvents: Array<{ status: string }> = [];
        adapter.on('complete', (result) => completeEvents.push(result));

        await adapter.startTask({ prompt: 'Test' });

        const stepFinishMessage: OpenCodeStepFinishMessage = {
          type: 'step_finish',
          part: {
            id: 'step-1',
            sessionID: 'session-123',
            messageID: 'message-123',
            type: 'step-finish',
            reason: 'tool_use',
          },
        };

        mockPtyInstance.simulateData(JSON.stringify(stepFinishMessage) + '\n');

        expect(completeEvents.length).toBe(0);
      });

      it('should emit complete with error status on error message', async () => {

        const adapter = createTestAdapter();
        const completeEvents: Array<{ status: string; error?: string }> = [];
        adapter.on('complete', (result) => completeEvents.push(result));

        await adapter.startTask({ prompt: 'Test' });

        const errorMessage: OpenCodeErrorMessage = {
          type: 'error',
          error: 'Something went wrong',
        };

        mockPtyInstance.simulateData(JSON.stringify(errorMessage) + '\n');

        expect(completeEvents.length).toBe(1);
        expect(completeEvents[0].status).toBe('error');
        expect(completeEvents[0].error).toBe('Something went wrong');
      });

      it('should emit permission-request event for AskUserQuestion tool', async () => {

        const adapter = createTestAdapter('test-task');
        const permissionRequests: unknown[] = [];
        adapter.on('permission-request', (req) => permissionRequests.push(req));

        await adapter.startTask({ prompt: 'Test' });

        const toolCallMessage: OpenCodeToolCallMessage = {
          type: 'tool_call',
          part: {
            id: 'tool-1',
            sessionID: 'session-123',
            messageID: 'message-123',
            type: 'tool-call',
            tool: 'AskUserQuestion',
            input: {
              questions: [
                {
                  question: 'Do you want to proceed?',
                  options: [
                    { label: 'Yes', description: 'Proceed with action' },
                    { label: 'No', description: 'Cancel' },
                  ],
                },
              ],
            },
          },
        };

        mockPtyInstance.simulateData(JSON.stringify(toolCallMessage) + '\n');

        expect(permissionRequests.length).toBe(1);
        const req = permissionRequests[0] as { question: string; options: Array<{ label: string }> };
        expect(req.question).toBe('Do you want to proceed?');
        expect(req.options).toHaveLength(2);
      });

      it('should emit todo:update for non-empty todos', async () => {

        const adapter = createTestAdapter();
        const todoEvents: unknown[][] = [];
        adapter.on('todo:update', (todos) => todoEvents.push(todos));

        await adapter.startTask({ prompt: 'Test' });

        const toolCallMessage: OpenCodeToolCallMessage = {
          type: 'tool_call',
          part: {
            id: 'tool-1',
            sessionID: 'session-123',
            messageID: 'message-123',
            type: 'tool-call',
            tool: 'todowrite',
            input: {
              todos: [
                { id: 'todo-1', content: 'First task', status: 'pending' },
                { id: 'todo-2', content: 'Second task', status: 'in_progress' },
              ],
            },
          },
        };

        mockPtyInstance.simulateData(JSON.stringify(toolCallMessage) + '\n');

        expect(todoEvents.length).toBe(1);
        expect(todoEvents[0]).toHaveLength(2);
      });

      it('should NOT emit todo:update for empty todos array', async () => {

        const adapter = createTestAdapter();
        const todoEvents: unknown[][] = [];
        adapter.on('todo:update', (todos) => todoEvents.push(todos));

        await adapter.startTask({ prompt: 'Test' });

        const toolCallMessage: OpenCodeToolCallMessage = {
          type: 'tool_call',
          part: {
            id: 'tool-1',
            sessionID: 'session-123',
            messageID: 'message-123',
            type: 'tool-call',
            tool: 'todowrite',
            input: {
              todos: [],
            },
          },
        };

        mockPtyInstance.simulateData(JSON.stringify(toolCallMessage) + '\n');

        expect(todoEvents.length).toBe(0);
      });
    });

    describe('Stream Parser Integration', () => {
      it('should handle multiple JSON messages in single data chunk', async () => {

        const adapter = createTestAdapter();
        const messages: unknown[] = [];
        adapter.on('message', (msg) => messages.push(msg));

        await adapter.startTask({ prompt: 'Test' });

        const message1: OpenCodeTextMessage = {
          type: 'text',
          part: { id: '1', sessionID: 's', messageID: 'm', type: 'text', text: 'First' },
        };
        const message2: OpenCodeTextMessage = {
          type: 'text',
          part: { id: '2', sessionID: 's', messageID: 'm', type: 'text', text: 'Second' },
        };

        mockPtyInstance.simulateData(
          JSON.stringify(message1) + '\n' + JSON.stringify(message2) + '\n'
        );

        expect(messages.length).toBe(2);
      });

      it('should handle split JSON messages across data chunks', async () => {

        const adapter = createTestAdapter();
        const messages: unknown[] = [];
        adapter.on('message', (msg) => messages.push(msg));

        await adapter.startTask({ prompt: 'Test' });

        const fullMessage: OpenCodeTextMessage = {
          type: 'text',
          part: { id: '1', sessionID: 's', messageID: 'm', type: 'text', text: 'Complete message' },
        };
        const jsonStr = JSON.stringify(fullMessage);
        const splitPoint = Math.floor(jsonStr.length / 2);

        mockPtyInstance.simulateData(jsonStr.substring(0, splitPoint));
        mockPtyInstance.simulateData(jsonStr.substring(splitPoint) + '\n');

        expect(messages.length).toBe(1);
      });

      it('should skip non-JSON lines without crashing', async () => {

        const adapter = createTestAdapter();
        const messages: unknown[] = [];
        const debugEvents: unknown[] = [];
        adapter.on('message', (msg) => messages.push(msg));
        adapter.on('debug', (d) => debugEvents.push(d));

        await adapter.startTask({ prompt: 'Test' });

        const validMessage: OpenCodeTextMessage = {
          type: 'text',
          part: { id: '1', sessionID: 's', messageID: 'm', type: 'text', text: 'Valid' },
        };

        mockPtyInstance.simulateData('Shell banner: Welcome to zsh\n');
        mockPtyInstance.simulateData(JSON.stringify(validMessage) + '\n');

        expect(messages.length).toBe(1);
      });

      it('should strip ANSI escape codes from data', async () => {

        const adapter = createTestAdapter();
        const messages: unknown[] = [];
        adapter.on('message', (msg) => messages.push(msg));

        await adapter.startTask({ prompt: 'Test' });

        const validMessage: OpenCodeTextMessage = {
          type: 'text',
          part: { id: '1', sessionID: 's', messageID: 'm', type: 'text', text: 'Valid' },
        };

        const ansiWrapped = '\x1B[32m' + JSON.stringify(validMessage) + '\x1B[0m\n';
        mockPtyInstance.simulateData(ansiWrapped);

        expect(messages.length).toBe(1);
      });
    });

    describe('Process Exit Handling', () => {
      it('should emit complete on normal exit (code 0)', async () => {

        const adapter = createTestAdapter();
        const completeEvents: Array<{ status: string }> = [];
        adapter.on('complete', (result) => completeEvents.push(result));

        await adapter.startTask({ prompt: 'Test' });

        mockPtyInstance.simulateExit(0);

        expect(completeEvents.length).toBe(1);
        expect(completeEvents[0].status).toBe('success');
      });

      it('should emit error on non-zero exit code', async () => {

        const adapter = createTestAdapter();
        const errorEvents: Error[] = [];
        adapter.on('error', (err) => errorEvents.push(err));

        await adapter.startTask({ prompt: 'Test' });

        mockPtyInstance.simulateExit(1);

        expect(errorEvents.length).toBe(1);
        expect(errorEvents[0].message).toContain('exited with code 1');
      });

      it('should emit interrupted status when interrupted', async () => {

        const adapter = createTestAdapter();
        const completeEvents: Array<{ status: string }> = [];
        adapter.on('complete', (result) => completeEvents.push(result));

        await adapter.startTask({ prompt: 'Test' });

        await adapter.interruptTask();
        mockPtyInstance.simulateExit(0);

        expect(completeEvents.length).toBe(1);
        expect(completeEvents[0].status).toBe('interrupted');
      });

      it('should not emit duplicate complete events', async () => {

        const adapter = createTestAdapter();
        const completeEvents: Array<{ status: string }> = [];
        adapter.on('complete', (result) => completeEvents.push(result));

        await adapter.startTask({ prompt: 'Test' });

        // Using 'blocked' status to skip verification flow (which only triggers on 'success')
        const toolCallMessage: OpenCodeToolCallMessage = {
          type: 'tool_call',
          part: {
            tool: 'complete_task',
            input: { status: 'blocked', summary: 'Done', original_request_summary: 'Test' },
          },
        };
        mockPtyInstance.simulateData(JSON.stringify(toolCallMessage) + '\n');

        const stepFinish: OpenCodeStepFinishMessage = {
          type: 'step_finish',
          part: {
            id: 'step-1',
            sessionID: 'session-123',
            messageID: 'message-123',
            type: 'step-finish',
            reason: 'stop',
          },
        };
        mockPtyInstance.simulateData(JSON.stringify(stepFinish) + '\n');

        mockPtyInstance.simulateExit(0);

        expect(completeEvents.length).toBe(1);
      });
    });

    describe('sendResponse()', () => {
      it('should write response to PTY', async () => {

        const adapter = createTestAdapter();
        await adapter.startTask({ prompt: 'Test' });

        await adapter.sendResponse('user input');

        expect(mockPtyInstance.write).toHaveBeenCalledWith('user input\n');
      });

      it('should throw error if no active process', async () => {

        const adapter = createTestAdapter();

        await expect(adapter.sendResponse('input')).rejects.toThrow('No active process');
      });
    });

    describe('cancelTask()', () => {
      it('should kill PTY process', async () => {

        const adapter = createTestAdapter();
        await adapter.startTask({ prompt: 'Test' });

        await adapter.cancelTask();

        expect(mockPtyInstance.kill).toHaveBeenCalled();
      });
    });

    describe('interruptTask()', () => {
      it('should send Ctrl+C to PTY', async () => {

        const adapter = createTestAdapter();
        await adapter.startTask({ prompt: 'Test' });

        await adapter.interruptTask();

        expect(mockPtyInstance.write).toHaveBeenCalledWith('\x03');
      });

      it('should handle interrupt when no active process', async () => {

        const adapter = createTestAdapter();

        await adapter.interruptTask();

        expect(mockPtyInstance.write).not.toHaveBeenCalled();
      });
    });

    describe('dispose()', () => {
      it('should cleanup PTY process and state', async () => {

        const adapter = createTestAdapter('test-task');
        await adapter.startTask({ prompt: 'Test' });

        adapter.dispose();

        expect(adapter.isAdapterDisposed()).toBe(true);
        expect(adapter.getTaskId()).toBeNull();
        expect(adapter.getSessionId()).toBeNull();
        expect(mockPtyInstance.kill).toHaveBeenCalled();
      });

      it('should be idempotent (safe to call multiple times)', () => {

        const adapter = createTestAdapter();

        adapter.dispose();
        adapter.dispose();
        adapter.dispose();

        expect(adapter.isAdapterDisposed()).toBe(true);
      });

      it('should remove all event listeners', async () => {

        const adapter = createTestAdapter();
        let messageCount = 0;
        adapter.on('message', () => messageCount++);
        await adapter.startTask({ prompt: 'Test' });

        adapter.dispose();
        adapter.emit('message', {} as OpenCodeTextMessage);

        expect(messageCount).toBe(0);
      });
    });

    describe('Session Management', () => {
      it('should track session ID from step_start message', async () => {

        const adapter = createTestAdapter();
        await adapter.startTask({ prompt: 'Test' });

        const stepStart: OpenCodeStepStartMessage = {
          type: 'step_start',
          part: {
            id: 'step-1',
            sessionID: 'session-abc-123',
            messageID: 'message-123',
            type: 'step-start',
          },
        };

        mockPtyInstance.simulateData(JSON.stringify(stepStart) + '\n');

        expect(adapter.getSessionId()).toBe('session-abc-123');
      });

      it('should support resuming sessions', async () => {

        const adapter = createTestAdapter();

        const task = await adapter.resumeSession('existing-session', 'Continue task');

        expect(task.prompt).toBe('Continue task');
        expect(mockPtySpawn).toHaveBeenCalled();
      });
    });

    describe('Session Resumption ANSI Filtering', () => {
      it('should filter ANSI codes in resumed session data', async () => {

        const adapter = createTestAdapter();
        const messages: unknown[] = [];
        adapter.on('message', (msg) => messages.push(msg));

        await adapter.resumeSession('existing-session', 'Continue task');

        const validMessage: OpenCodeTextMessage = {
          type: 'text',
          part: { id: '1', sessionID: 's', messageID: 'm', type: 'text', text: 'Resumed' },
        };

        const ansiWrapped = '\x1B[32m' + JSON.stringify(validMessage) + '\x1B[0m\n';
        mockPtyInstance.simulateData(ansiWrapped);

        expect(messages.length).toBe(1);
      });

      it('should emit debug events in resumed session', async () => {

        const adapter = createTestAdapter();
        const debugEvents: Array<{ type: string; message: string }> = [];
        adapter.on('debug', (event) => debugEvents.push(event));

        await adapter.resumeSession('existing-session', 'Continue task');

        const validMessage: OpenCodeTextMessage = {
          type: 'text',
          part: { id: '1', sessionID: 's', messageID: 'm', type: 'text', text: 'Test' },
        };

        mockPtyInstance.simulateData(JSON.stringify(validMessage) + '\n');

        expect(debugEvents.some(e => e.type === 'stdout')).toBe(true);
      });

      it('should handle Windows PowerShell ANSI sequences in resumed session', async () => {

        const adapter = createTestAdapter();
        const messages: unknown[] = [];
        adapter.on('message', (msg) => messages.push(msg));

        await adapter.resumeSession('existing-session', 'Continue task');

        const validMessage: OpenCodeTextMessage = {
          type: 'text',
          part: { id: '1', sessionID: 's', messageID: 'm', type: 'text', text: 'Windows' },
        };

        // DEC mode sequences (cursor visibility) and OSC sequences (window titles)
        const windowsAnsi = '\x1B[?25l\x1B]0;PowerShell\x07' + JSON.stringify(validMessage) + '\x1B[?25h\n';
        mockPtyInstance.simulateData(windowsAnsi);

        expect(messages.length).toBe(1);
      });

      it('should not feed empty data to parser in resumed session', async () => {

        const adapter = createTestAdapter();
        const messages: unknown[] = [];
        adapter.on('message', (msg) => messages.push(msg));

        await adapter.resumeSession('existing-session', 'Continue task');

        // Only ANSI codes (no actual content)
        mockPtyInstance.simulateData('\x1B[32m\x1B[0m');
        mockPtyInstance.simulateData('   \n');

        expect(messages.length).toBe(0);
      });
    });
  });

  describe('Factory Functions', () => {
    describe('isOpenCodeCliInstalled()', () => {
      it('should return boolean indicating CLI availability', async () => {

        const result = await isOpenCodeCliInstalled();

        expect(typeof result).toBe('boolean');
      });
    });

    describe('getOpenCodeCliVersion()', () => {
      it('should return version string or null', async () => {

        const result = await getOpenCodeCliVersion();

        expect(result === null || typeof result === 'string').toBe(true);
      });
    });
  });

  describe('OpenCodeCliNotFoundError', () => {
    it('should have correct error name', () => {
      const error = new OpenCodeCliNotFoundError();

      expect(error.name).toBe('OpenCodeCliNotFoundError');
    });

    it('should have descriptive message', () => {
      const error = new OpenCodeCliNotFoundError();

      expect(error.message).toContain('OpenCode CLI is not available');
      expect(error.message).toContain('reinstall');
    });
  });
});
