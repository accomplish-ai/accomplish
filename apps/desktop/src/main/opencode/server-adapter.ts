import { EventEmitter } from 'events';
import { app } from 'electron';
import { spawn, ChildProcess } from 'child_process';
import { getOpenCodeCliPath, isOpenCodeBundled, getBundledOpenCodeVersion } from './cli-path';
import { getAllApiKeys, getBedrockCredentials } from '../store/secureStorage';
import { getSelectedModel } from '../store/appSettings';
import { generateOpenCodeConfig, ACCOMPLISH_AGENT_NAME, syncApiKeysToOpenCodeAuth } from './config-generator';
import { getExtendedNodePath } from '../utils/system-path';
import { getBundledNodePaths, logBundledNodeInfo } from '../utils/bundled-node';
import type {
  TaskConfig,
  Task,
  TaskMessage,
  TaskResult,
  OpenCodeMessage,
  PermissionRequest,
} from '@accomplish/shared';

/**
 * Error thrown when OpenCode server is not available
 */
export class OpenCodeServerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OpenCodeServerError';
  }
}

/**
 * Check if OpenCode CLI is available (bundled or installed)
 */
export async function isOpenCodeServerAvailable(): Promise<boolean> {
  return isOpenCodeBundled();
}

/**
 * Get OpenCode CLI version
 */
export async function getOpenCodeServerVersion(): Promise<string | null> {
  return getBundledOpenCodeVersion();
}

export interface OpenCodeServerAdapterEvents {
  message: [OpenCodeMessage];
  'text-delta': [{ messageId: string; content: string; isComplete: boolean }];
  'tool-use': [string, unknown];
  'tool-result': [string];
  'permission-request': [PermissionRequest];
  progress: [{ stage: string; message?: string }];
  complete: [TaskResult];
  error: [Error];
  debug: [{ type: string; message: string; data?: unknown }];
}

/**
 * SSE Event parsed from the stream
 */
interface SSEEvent {
  type: string;
  data: unknown;
}

/**
 * OpenCode Server Adapter
 * Uses `opencode serve` HTTP API with SSE for real-time streaming
 */
export class OpenCodeServerAdapter extends EventEmitter<OpenCodeServerAdapterEvents> {
  private serverProcess: ChildProcess | null = null;
  private serverPort: number | null = null;
  private serverReady: boolean = false;
  private currentSessionId: string | null = null;
  private currentTaskId: string | null = null;
  private currentMessageId: string | null = null;
  private messages: TaskMessage[] = [];
  private hasCompleted: boolean = false;
  private isDisposed: boolean = false;
  private wasInterrupted: boolean = false;
  private abortController: AbortController | null = null;

  // Streaming state for text deltas
  private streamingMessageId: string | null = null;
  private streamingText: string = '';

  /**
   * Create a new OpenCodeServerAdapter instance
   * @param taskId - Optional task ID for this adapter instance (used for logging)
   */
  constructor(taskId?: string) {
    super();
    this.currentTaskId = taskId || null;
  }

  /**
   * Start a new task with OpenCode Server
   */
  async startTask(config: TaskConfig): Promise<Task> {
    if (this.isDisposed) {
      throw new Error('Adapter has been disposed and cannot start new tasks');
    }

    const cliAvailable = await isOpenCodeServerAvailable();
    if (!cliAvailable) {
      throw new OpenCodeServerError('OpenCode CLI is not available');
    }

    const taskId = config.taskId || this.generateTaskId();
    this.currentTaskId = taskId;
    this.currentSessionId = null;
    this.currentMessageId = null;
    this.messages = [];
    this.hasCompleted = false;
    this.wasInterrupted = false;
    this.streamingMessageId = null;
    this.streamingText = '';

    // Sync API keys
    await syncApiKeysToOpenCodeAuth();

    // Generate config
    console.log('[OpenCode Server] Generating config...');
    const configPath = await generateOpenCodeConfig();
    console.log('[OpenCode Server] Config generated at:', configPath);

    // Start the server if not running
    if (!this.serverReady) {
      await this.startServer(config.workingDirectory);
    }

    // Create or get session
    const sessionId = config.sessionId || await this.createSession();
    this.currentSessionId = sessionId;

    // Subscribe to SSE events
    this.subscribeToEvents();

    // Send the message
    await this.sendMessage(config.prompt);

    this.emit('progress', { stage: 'init', message: 'Task started' });

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
   * Start the OpenCode server
   */
  private async startServer(workingDirectory?: string): Promise<void> {
    // Find an available port
    this.serverPort = await this.findAvailablePort();

    const { command, args: baseArgs } = getOpenCodeCliPath();
    const env = await this.buildEnvironment();
    const safeCwd = workingDirectory || app.getPath('temp');

    const serverArgs = [...baseArgs, 'serve', '--port', String(this.serverPort)];

    console.log('[OpenCode Server] Starting server on port', this.serverPort);
    console.log('[OpenCode Server] Command:', command, serverArgs.join(' '));
    this.emit('debug', { type: 'info', message: `Starting server on port ${this.serverPort}` });

    return new Promise((resolve, reject) => {
      this.serverProcess = spawn(command, serverArgs, {
        cwd: safeCwd,
        env: env as NodeJS.ProcessEnv,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let startupOutput = '';
      const startupTimeout = setTimeout(() => {
        reject(new OpenCodeServerError('Server startup timeout'));
      }, 30000);

      this.serverProcess.stdout?.on('data', (data: Buffer) => {
        const output = data.toString();
        startupOutput += output;
        console.log('[OpenCode Server stdout]:', output);
        this.emit('debug', { type: 'stdout', message: output });

        // Check if server is ready (look for port binding message)
        if (output.includes('listening') || output.includes('started') || output.includes(String(this.serverPort))) {
          clearTimeout(startupTimeout);
          this.serverReady = true;
          console.log('[OpenCode Server] Server is ready');
          this.emit('debug', { type: 'info', message: 'Server is ready' });
          resolve();
        }
      });

      this.serverProcess.stderr?.on('data', (data: Buffer) => {
        const output = data.toString();
        console.error('[OpenCode Server stderr]:', output);
        this.emit('debug', { type: 'stderr', message: output });
      });

      this.serverProcess.on('error', (err) => {
        clearTimeout(startupTimeout);
        console.error('[OpenCode Server] Process error:', err);
        this.emit('error', err);
        reject(err);
      });

      this.serverProcess.on('exit', (code, signal) => {
        console.log('[OpenCode Server] Process exited:', code, signal);
        this.emit('debug', { type: 'exit', message: `Server exited with code ${code}` });
        this.serverReady = false;
        this.serverProcess = null;

        if (!this.hasCompleted && !this.isDisposed) {
          this.emit('complete', {
            status: code === 0 ? 'success' : 'error',
            sessionId: this.currentSessionId || undefined,
            error: code !== 0 ? `Server exited with code ${code}` : undefined,
          });
        }
      });

      // Also try to detect ready state by polling the health endpoint
      this.pollServerReady().then(() => {
        clearTimeout(startupTimeout);
        this.serverReady = true;
        resolve();
      }).catch(() => {
        // Polling failed, rely on stdout detection
      });
    });
  }

  /**
   * Poll the server health endpoint until ready
   */
  private async pollServerReady(): Promise<void> {
    const maxAttempts = 30;
    const delay = 500;

    for (let i = 0; i < maxAttempts; i++) {
      try {
        const response = await fetch(`http://localhost:${this.serverPort}/health`, {
          method: 'GET',
          signal: AbortSignal.timeout(1000),
        });
        if (response.ok) {
          console.log('[OpenCode Server] Health check passed');
          return;
        }
      } catch {
        // Server not ready yet
      }
      await new Promise(r => setTimeout(r, delay));
    }
    throw new Error('Server health check timeout');
  }

  /**
   * Find an available port
   */
  private async findAvailablePort(): Promise<number> {
    // Start with a random port in the range 40000-50000
    const basePort = 40000 + Math.floor(Math.random() * 10000);

    // Try to find an available port
    for (let port = basePort; port < basePort + 100; port++) {
      try {
        const response = await fetch(`http://localhost:${port}/health`, {
          method: 'GET',
          signal: AbortSignal.timeout(100),
        });
        // Port is in use
      } catch {
        // Port is likely available
        return port;
      }
    }

    return basePort; // Fallback
  }

  /**
   * Create a new session
   */
  private async createSession(): Promise<string> {
    const selectedModel = getSelectedModel();

    const body: Record<string, unknown> = {};

    // Add model if specified
    if (selectedModel?.model) {
      let modelId = selectedModel.model;
      if (selectedModel.provider === 'zai') {
        const id = selectedModel.model.split('/').pop();
        modelId = `zai-coding-plan/${id}`;
      } else if (selectedModel.provider === 'deepseek') {
        const id = selectedModel.model.split('/').pop();
        modelId = `deepseek/${id}`;
      }
      body.model = modelId;
    }

    // Add agent
    body.agent = ACCOMPLISH_AGENT_NAME;

    console.log('[OpenCode Server] Creating session with:', body);
    this.emit('debug', { type: 'info', message: `Creating session`, data: body });

    const response = await fetch(`http://localhost:${this.serverPort}/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new OpenCodeServerError(`Failed to create session: ${error}`);
    }

    const data = await response.json() as { id: string };
    console.log('[OpenCode Server] Session created:', data.id);
    this.emit('debug', { type: 'info', message: `Session created: ${data.id}` });

    return data.id;
  }

  /**
   * Subscribe to SSE events
   */
  private subscribeToEvents(): void {
    if (!this.serverPort || !this.currentSessionId) {
      console.error('[OpenCode Server] Cannot subscribe: no port or session');
      return;
    }

    this.abortController = new AbortController();

    const eventUrl = `http://localhost:${this.serverPort}/session/${this.currentSessionId}/event`;
    console.log('[OpenCode Server] Subscribing to SSE:', eventUrl);
    this.emit('debug', { type: 'info', message: `Subscribing to SSE: ${eventUrl}` });

    this.connectSSE(eventUrl);
  }

  /**
   * Connect to SSE endpoint and process events
   */
  private async connectSSE(url: string): Promise<void> {
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Accept': 'text/event-stream' },
        signal: this.abortController?.signal,
      });

      if (!response.ok) {
        throw new OpenCodeServerError(`SSE connection failed: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new OpenCodeServerError('No response body for SSE');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process complete SSE events
        const events = this.parseSSEBuffer(buffer);
        buffer = events.remaining;

        for (const event of events.events) {
          this.handleSSEEvent(event);
        }
      }
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        console.log('[OpenCode Server] SSE connection aborted');
        return;
      }
      console.error('[OpenCode Server] SSE error:', error);
      this.emit('error', error as Error);
    }
  }

  /**
   * Parse SSE buffer into events
   */
  private parseSSEBuffer(buffer: string): { events: SSEEvent[]; remaining: string } {
    const events: SSEEvent[] = [];
    const lines = buffer.split('\n');
    let remaining = '';
    let currentEvent: { type?: string; data?: string } = {};

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Check if this is the last incomplete line
      if (i === lines.length - 1 && !buffer.endsWith('\n')) {
        remaining = line;
        break;
      }

      if (line === '') {
        // Empty line signals end of event
        if (currentEvent.data) {
          try {
            const data = JSON.parse(currentEvent.data);
            events.push({
              type: currentEvent.type || data.type || 'message',
              data,
            });
          } catch (e) {
            console.warn('[OpenCode Server] Failed to parse SSE data:', currentEvent.data);
          }
        }
        currentEvent = {};
      } else if (line.startsWith('event:')) {
        currentEvent.type = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        const data = line.slice(5).trim();
        currentEvent.data = currentEvent.data ? currentEvent.data + data : data;
      }
    }

    return { events, remaining };
  }

  /**
   * Handle an SSE event
   */
  private handleSSEEvent(event: SSEEvent): void {
    const data = event.data as Record<string, unknown>;
    const eventType = event.type || (data.type as string);

    console.log('[OpenCode Server] SSE event:', eventType);
    this.emit('debug', { type: 'sse-event', message: `Event: ${eventType}`, data });

    switch (eventType) {
      case 'session.updated':
      case 'session.created':
        // Session events
        if (data.id) {
          this.currentSessionId = data.id as string;
        }
        break;

      case 'message.updated':
        this.handleMessageUpdated(data);
        break;

      case 'message.part.updated':
        this.handleMessagePartUpdated(data);
        break;

      case 'session.idle':
        // Session is idle (no more processing)
        console.log('[OpenCode Server] Session idle');
        this.finalizeStreaming();
        this.hasCompleted = true;
        this.emit('complete', {
          status: 'success',
          sessionId: this.currentSessionId || undefined,
        });
        break;

      case 'session.error':
        console.error('[OpenCode Server] Session error:', data);
        this.hasCompleted = true;
        this.emit('complete', {
          status: 'error',
          sessionId: this.currentSessionId || undefined,
          error: (data.error as string) || 'Session error',
        });
        break;

      default:
        console.log('[OpenCode Server] Unhandled event type:', eventType);
    }
  }

  /**
   * Handle message.updated event
   */
  private handleMessageUpdated(data: Record<string, unknown>): void {
    const messageId = data.id as string;
    const role = data.role as string;

    if (role === 'assistant') {
      this.currentMessageId = messageId;
    }
  }

  /**
   * Handle message.part.updated event (streaming text deltas)
   */
  private handleMessagePartUpdated(data: Record<string, unknown>): void {
    const part = data.part as Record<string, unknown> || data;
    const partType = part.type as string;
    const messageId = (part.messageID || data.messageID || this.currentMessageId) as string;

    console.log('[OpenCode Server] Part updated:', partType, 'messageId:', messageId);

    switch (partType) {
      case 'text-start':
        // Start of text streaming
        this.streamingMessageId = messageId;
        this.streamingText = '';
        console.log('[OpenCode Server] Text streaming started for message:', messageId);
        break;

      case 'text-delta':
        // Incremental text chunk
        const deltaText = (part.text || part.delta || '') as string;

        if (this.streamingMessageId !== messageId) {
          this.streamingMessageId = messageId;
          this.streamingText = '';
        }

        this.streamingText += deltaText;

        this.emit('text-delta', {
          messageId,
          content: this.streamingText,
          isComplete: false,
        });

        console.log('[OpenCode Server] Text delta, accumulated length:', this.streamingText.length);
        break;

      case 'text':
        // Complete text (may be sent instead of deltas, or as final)
        const fullText = (part.text || '') as string;

        // Emit as complete text
        this.emit('text-delta', {
          messageId,
          content: fullText,
          isComplete: true,
        });

        // Also emit as message for backward compatibility
        const textMessage: OpenCodeMessage = {
          type: 'text',
          timestamp: Date.now(),
          sessionID: this.currentSessionId || undefined,
          part: {
            id: part.id as string || this.generateMessageId(),
            sessionID: this.currentSessionId || '',
            messageID: messageId,
            type: 'text',
            text: fullText,
          },
        } as OpenCodeMessage;
        this.emit('message', textMessage);

        // Clear streaming state
        this.streamingMessageId = null;
        this.streamingText = '';
        break;

      case 'tool':
      case 'tool-call':
        const toolName = (part.tool || part.name || 'unknown') as string;
        const partState = part.state as Record<string, unknown> | undefined;
        const toolInput = part.input || partState?.input;
        const toolOutput = part.output || partState?.output;
        const toolStatus = part.status || partState?.status;

        console.log('[OpenCode Server] Tool:', toolName, 'status:', toolStatus);

        this.emit('tool-use', toolName, toolInput);
        this.emit('progress', { stage: 'tool-use', message: `Using ${toolName}` });

        // Emit as message for backward compatibility
        const toolMessage: OpenCodeMessage = {
          type: 'tool_use',
          timestamp: Date.now(),
          sessionID: this.currentSessionId || undefined,
          part: {
            id: part.id as string || this.generateMessageId(),
            sessionID: this.currentSessionId || '',
            messageID: messageId,
            type: 'tool',
            tool: toolName,
            state: {
              status: toolStatus as 'pending' | 'running' | 'completed' | 'error' || 'running',
              input: toolInput,
              output: toolOutput as string,
            },
          },
        } as OpenCodeMessage;
        this.emit('message', toolMessage);

        if (toolStatus === 'completed' || toolStatus === 'error') {
          this.emit('tool-result', (toolOutput || '') as string);
        }

        // Handle AskUserQuestion
        if (toolName === 'AskUserQuestion') {
          this.handleAskUserQuestion(toolInput as AskUserQuestionInput);
        }
        break;

      case 'step-start':
        this.emit('progress', { stage: 'init', message: 'Processing' });
        break;

      case 'step-finish':
        const reason = part.reason as string;
        if (reason === 'stop' || reason === 'end_turn') {
          this.finalizeStreaming();
        }
        break;

      default:
        console.log('[OpenCode Server] Unhandled part type:', partType);
    }
  }

  /**
   * Finalize any in-progress streaming
   */
  private finalizeStreaming(): void {
    if (this.streamingMessageId && this.streamingText) {
      this.emit('text-delta', {
        messageId: this.streamingMessageId,
        content: this.streamingText,
        isComplete: true,
      });

      // Also emit as message
      const textMessage: OpenCodeMessage = {
        type: 'text',
        timestamp: Date.now(),
        sessionID: this.currentSessionId || undefined,
        part: {
          id: this.generateMessageId(),
          sessionID: this.currentSessionId || '',
          messageID: this.streamingMessageId,
          type: 'text',
          text: this.streamingText,
        },
      } as OpenCodeMessage;
      this.emit('message', textMessage);
    }

    this.streamingMessageId = null;
    this.streamingText = '';
  }

  /**
   * Send a message to the session
   * Uses the OpenCode API format: { parts: [{ type: 'text', text: '...' }] }
   */
  private async sendMessage(prompt: string): Promise<void> {
    if (!this.serverPort || !this.currentSessionId) {
      throw new OpenCodeServerError('No active server or session');
    }

    console.log('[OpenCode Server] Sending message to session:', this.currentSessionId);
    this.emit('debug', { type: 'info', message: `Sending message: ${prompt.substring(0, 100)}...` });

    // OpenCode API expects message in parts format
    const messageBody = {
      parts: [{ type: 'text', text: prompt }],
    };

    const response = await fetch(
      `http://localhost:${this.serverPort}/session/${this.currentSessionId}/message`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(messageBody),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new OpenCodeServerError(`Failed to send message: ${error}`);
    }

    console.log('[OpenCode Server] Message sent successfully');
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
   */
  async sendResponse(response: string): Promise<void> {
    if (!this.serverPort || !this.currentSessionId) {
      throw new Error('No active server or session');
    }

    // Send as a new message
    await this.sendMessage(response);
    console.log('[OpenCode Server] Response sent');
  }

  /**
   * Cancel the current task
   */
  async cancelTask(): Promise<void> {
    this.abortController?.abort();
    this.abortController = null;

    if (this.serverProcess) {
      this.serverProcess.kill();
      this.serverProcess = null;
    }

    this.serverReady = false;
  }

  /**
   * Interrupt the current task
   */
  async interruptTask(): Promise<void> {
    this.wasInterrupted = true;
    this.abortController?.abort();

    // Could send an interrupt signal to the server if supported
    console.log('[OpenCode Server] Task interrupted');

    this.emit('complete', {
      status: 'interrupted',
      sessionId: this.currentSessionId || undefined,
    });
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
   */
  dispose(): void {
    if (this.isDisposed) return;

    console.log(`[OpenCode Server] Disposing adapter for task ${this.currentTaskId}`);
    this.isDisposed = true;

    this.abortController?.abort();
    this.abortController = null;

    if (this.serverProcess) {
      try {
        this.serverProcess.kill();
      } catch (error) {
        console.error('[OpenCode Server] Error killing server:', error);
      }
      this.serverProcess = null;
    }

    this.serverReady = false;
    this.currentSessionId = null;
    this.currentTaskId = null;
    this.currentMessageId = null;
    this.messages = [];
    this.hasCompleted = true;
    this.streamingMessageId = null;
    this.streamingText = '';

    this.removeAllListeners();
    console.log('[OpenCode Server] Adapter disposed');
  }

  /**
   * Build environment variables
   */
  private async buildEnvironment(): Promise<NodeJS.ProcessEnv> {
    const env: NodeJS.ProcessEnv = { ...process.env };

    if (app.isPackaged) {
      env.ELECTRON_RUN_AS_NODE = '1';
      logBundledNodeInfo();

      const bundledNode = getBundledNodePaths();
      if (bundledNode) {
        const delimiter = process.platform === 'win32' ? ';' : ':';
        env.PATH = `${bundledNode.binDir}${delimiter}${env.PATH || ''}`;
        env.NODE_BIN_PATH = bundledNode.binDir;
      }

      if (process.platform === 'darwin') {
        env.PATH = getExtendedNodePath(env.PATH);
      }
    }

    const apiKeys = await getAllApiKeys();
    if (apiKeys.anthropic) env.ANTHROPIC_API_KEY = apiKeys.anthropic;
    if (apiKeys.openai) env.OPENAI_API_KEY = apiKeys.openai;
    if (apiKeys.google) env.GOOGLE_GENERATIVE_AI_API_KEY = apiKeys.google;
    if (apiKeys.xai) env.XAI_API_KEY = apiKeys.xai;
    if (apiKeys.deepseek) env.DEEPSEEK_API_KEY = apiKeys.deepseek;
    if (apiKeys.zai) env.ZAI_API_KEY = apiKeys.zai;

    const bedrockCredentials = getBedrockCredentials();
    if (bedrockCredentials) {
      if (bedrockCredentials.authType === 'accessKeys') {
        env.AWS_ACCESS_KEY_ID = bedrockCredentials.accessKeyId;
        env.AWS_SECRET_ACCESS_KEY = bedrockCredentials.secretAccessKey;
        if (bedrockCredentials.sessionToken) {
          env.AWS_SESSION_TOKEN = bedrockCredentials.sessionToken;
        }
      } else if (bedrockCredentials.authType === 'profile') {
        env.AWS_PROFILE = bedrockCredentials.profileName;
      }
      if (bedrockCredentials.region) {
        env.AWS_REGION = bedrockCredentials.region;
      }
    }

    const selectedModel = getSelectedModel();
    if (selectedModel?.provider === 'ollama' && selectedModel.baseUrl) {
      env.OLLAMA_HOST = selectedModel.baseUrl;
    }

    if (process.env.OPENCODE_CONFIG) {
      env.OPENCODE_CONFIG = process.env.OPENCODE_CONFIG;
    }

    if (this.currentTaskId) {
      env.ACCOMPLISH_TASK_ID = this.currentTaskId;
    }

    return env;
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

  private generateTaskId(): string {
    return `task_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
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
 * Factory function to create a new server adapter instance
 */
export function createServerAdapter(taskId?: string): OpenCodeServerAdapter {
  return new OpenCodeServerAdapter(taskId);
}
