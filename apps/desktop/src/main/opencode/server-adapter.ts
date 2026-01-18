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
    console.log('[OpenCode Server] startTask called');
    this.emit('debug', { type: 'info', message: 'startTask called' });

    if (this.isDisposed) {
      throw new Error('Adapter has been disposed and cannot start new tasks');
    }

    console.log('[OpenCode Server] Checking CLI availability...');
    this.emit('debug', { type: 'info', message: 'Checking CLI availability...' });

    const cliAvailable = await isOpenCodeServerAvailable();
    if (!cliAvailable) {
      throw new OpenCodeServerError('OpenCode CLI is not available');
    }

    console.log('[OpenCode Server] CLI is available');
    this.emit('debug', { type: 'info', message: 'CLI is available' });

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
    // Log the currently selected model
    const selectedModel = getSelectedModel();
    console.log('[OpenCode Server] Selected model from settings:', JSON.stringify(selectedModel));
    this.emit('debug', { type: 'info', message: `Selected model: ${JSON.stringify(selectedModel)}` });

    console.log('[OpenCode Server] Syncing API keys...');
    this.emit('debug', { type: 'info', message: 'Syncing API keys...' });
    await syncApiKeysToOpenCodeAuth();

    // Generate config
    console.log('[OpenCode Server] Generating config...');
    this.emit('debug', { type: 'info', message: 'Generating config...' });
    const configPath = await generateOpenCodeConfig();
    console.log('[OpenCode Server] Config generated at:', configPath);
    this.emit('debug', { type: 'info', message: `Config generated at: ${configPath}` });

    // Read and log the generated config for debugging
    try {
      const fs = await import('fs');
      const configContent = fs.readFileSync(configPath, 'utf-8');
      const parsedConfig = JSON.parse(configContent);
      console.log('[OpenCode Server] Config model:', parsedConfig.model);
      this.emit('debug', { type: 'info', message: `Config default model: ${parsedConfig.model || 'not set'}` });
    } catch (e) {
      console.warn('[OpenCode Server] Could not read config:', e);
    }

    // Start the server if not running
    if (!this.serverReady) {
      console.log('[OpenCode Server] Starting server...');
      this.emit('debug', { type: 'info', message: 'Starting server...' });
      await this.startServer(config.workingDirectory);
      console.log('[OpenCode Server] Server started successfully');
      this.emit('debug', { type: 'info', message: 'Server started successfully' });
    }

    // Create or get session
    console.log('[OpenCode Server] Creating session...');
    this.emit('debug', { type: 'info', message: 'Creating session...' });
    const sessionId = config.sessionId || await this.createSession();
    this.currentSessionId = sessionId;
    console.log('[OpenCode Server] Session created:', sessionId);
    this.emit('debug', { type: 'info', message: `Session created: ${sessionId}` });

    // Subscribe to SSE events
    console.log('[OpenCode Server] Subscribing to SSE events...');
    this.emit('debug', { type: 'info', message: 'Subscribing to SSE events...' });
    this.subscribeToEvents();

    // Send the message
    console.log('[OpenCode Server] Sending initial message...');
    this.emit('debug', { type: 'info', message: 'Sending initial message...' });
    await this.sendMessage(config.prompt);
    console.log('[OpenCode Server] Initial message sent');
    this.emit('debug', { type: 'info', message: 'Initial message sent' });

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

          // Also fetch the OpenAPI spec to debug available routes
          try {
            const docResponse = await fetch(`http://localhost:${this.serverPort}/doc`, {
              method: 'GET',
              signal: AbortSignal.timeout(2000),
            });
            if (docResponse.ok) {
              const spec = await docResponse.json();
              const paths = Object.keys(spec.paths || {}).filter(p => p.includes('session'));
              console.log('[OpenCode Server] Session-related endpoints:', paths);
              this.emit('debug', { type: 'info', message: `Available session endpoints: ${paths.join(', ')}` });
            }
          } catch (e) {
            console.log('[OpenCode Server] Could not fetch OpenAPI spec');
          }

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
   * Preload an Ollama model to ensure it's in memory before creating a session
   * This works around OpenCode's tendency to use cached/default models
   */
  private async preloadOllamaModel(modelName: string, baseUrl?: string): Promise<void> {
    const ollamaHost = baseUrl || process.env.OLLAMA_HOST || 'http://localhost:11434';

    console.log('[OpenCode Server] Preloading Ollama model:', modelName, 'at', ollamaHost);
    this.emit('debug', { type: 'info', message: `Preloading Ollama model: ${modelName}` });

    try {
      // First, try to set the default model in OpenCode's config
      if (this.serverPort) {
        try {
          const configResponse = await fetch(`http://localhost:${this.serverPort}/config`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              provider: 'ollama',
              model: modelName,
            }),
            signal: AbortSignal.timeout(5000),
          });
          if (configResponse.ok) {
            console.log('[OpenCode Server] Config updated with model:', modelName);
            this.emit('debug', { type: 'info', message: `Config updated: ${modelName}` });
          }
        } catch (e) {
          console.log('[OpenCode Server] Could not update config:', e);
        }
      }

      // Send a minimal chat request to load the model into memory
      const response = await fetch(`${ollamaHost}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: modelName,
          messages: [{ role: 'user', content: 'hi' }],
          stream: false,
          options: { num_predict: 1 }, // Generate minimal response
        }),
        signal: AbortSignal.timeout(60000), // 60s timeout for model loading
      });

      if (response.ok) {
        console.log('[OpenCode Server] Model preloaded successfully:', modelName);
        this.emit('debug', { type: 'info', message: `Model preloaded: ${modelName}` });
      } else {
        const error = await response.text();
        console.warn('[OpenCode Server] Model preload warning:', error);
        this.emit('debug', { type: 'warning', message: `Model preload issue: ${error}` });
      }
    } catch (error) {
      console.warn('[OpenCode Server] Model preload failed:', error);
      this.emit('debug', { type: 'warning', message: `Model preload failed: ${(error as Error).message}` });
      // Don't throw - continue anyway, OpenCode might still work
    }
  }

  /**
   * Create a new session
   */
  private async createSession(): Promise<string> {
    const selectedModel = getSelectedModel();
    console.log('[OpenCode Server] Selected model from settings:', JSON.stringify(selectedModel));
    this.emit('debug', { type: 'info', message: `Selected model: ${JSON.stringify(selectedModel)}` });

    const body: Record<string, unknown> = {};

    // Add model if specified
    if (selectedModel?.model) {
      let modelId = selectedModel.model;
      console.log('[OpenCode Server] Raw model from settings:', modelId);
      console.log('[OpenCode Server] Provider:', selectedModel.provider);

      // For Ollama, preload the model first to ensure it's in memory
      if (selectedModel.provider === 'ollama') {
        const ollamaModelName = selectedModel.model.split('/').pop() || selectedModel.model;
        await this.preloadOllamaModel(ollamaModelName, selectedModel.baseUrl);
        modelId = `ollama/${ollamaModelName}`;
        console.log('[OpenCode Server] Ollama model ID:', modelId);
      } else if (selectedModel.provider === 'zai') {
        const id = selectedModel.model.split('/').pop();
        modelId = `zai-coding-plan/${id}`;
      } else if (selectedModel.provider === 'deepseek') {
        const id = selectedModel.model.split('/').pop();
        modelId = `deepseek/${id}`;
      }

      console.log('[OpenCode Server] Final modelId for session:', modelId);
      body.model = modelId;
    } else {
      console.log('[OpenCode Server] WARNING: No model selected!');
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
   * Subscribe to SSE events at /event endpoint
   * Per OpenCode docs: GET /event returns server-sent events stream
   */
  private subscribeToEvents(): void {
    if (!this.serverPort || !this.currentSessionId) {
      console.error('[OpenCode Server] Cannot subscribe: no port or session');
      return;
    }

    this.abortController = new AbortController();

    // Connect to global SSE endpoint /event
    const eventUrl = `http://localhost:${this.serverPort}/event`;
    console.log('[OpenCode Server] Connecting to SSE:', eventUrl);
    this.emit('debug', { type: 'info', message: `Connecting to SSE: ${eventUrl}` });

    this.connectSSE(eventUrl, false);
  }

  /**
   * Poll the session for updates (messages, status changes)
   * We poll GET /session/{id} which returns the full session including messages
   */
  private async pollSessionForUpdates(): Promise<void> {
    const pollInterval = 300; // Poll every 300ms for responsiveness
    let lastMessageCount = 0;
    let lastMessageContent = '';
    let consecutiveIdleCount = 0;
    let debugLogCount = 0;

    while (!this.hasCompleted && !this.isDisposed && !this.abortController?.signal.aborted) {
      try {
        // Fetch full session details (should include messages)
        const sessionResponse = await fetch(
          `http://localhost:${this.serverPort}/session/${this.currentSessionId}`,
          {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(5000),
          }
        );

        if (!sessionResponse.ok) {
          console.error('[OpenCode Server] Failed to fetch session:', sessionResponse.status);
          await new Promise(r => setTimeout(r, pollInterval));
          continue;
        }

        const session = await sessionResponse.json() as Record<string, unknown>;

        // Debug: Log the full session structure on first few polls
        if (debugLogCount < 3) {
          const sessionStr = JSON.stringify(session, null, 2);
          console.log('[OpenCode Server] Full session:', sessionStr.substring(0, 3000));
          this.emit('debug', { type: 'info', message: `Session keys: ${Object.keys(session).join(', ')}` });

          // Check for nested objects that might contain messages
          for (const key of Object.keys(session)) {
            const val = session[key];
            if (val && typeof val === 'object') {
              if (Array.isArray(val)) {
                this.emit('debug', { type: 'info', message: `  ${key}: array[${val.length}]` });
              } else {
                this.emit('debug', { type: 'info', message: `  ${key}: object with keys ${Object.keys(val as object).join(', ')}` });
              }
            }
          }
          debugLogCount++;
        }

        // Try to find messages in various possible locations
        let messages: Array<Record<string, unknown>> = [];
        let status = 'unknown';

        // Check direct properties
        if (Array.isArray(session.messages)) {
          messages = session.messages as Array<Record<string, unknown>>;
        } else if (Array.isArray(session.parts)) {
          messages = session.parts as Array<Record<string, unknown>>;
        } else if (Array.isArray(session.history)) {
          messages = session.history as Array<Record<string, unknown>>;
        }

        // Check for status/busy
        if (typeof session.busy === 'boolean') {
          status = session.busy ? 'busy' : 'idle';
        } else if (typeof session.status === 'string') {
          status = session.status as string;
        } else if (typeof session.state === 'string') {
          status = session.state as string;
        }

        // If no messages found directly, check if there's a nested structure
        if (messages.length === 0 && debugLogCount <= 3) {
          this.emit('debug', { type: 'info', message: `No messages found yet. Status: ${status}` });
        }

        // Check for new messages
        if (messages.length > lastMessageCount) {
          console.log('[OpenCode Server] New messages detected:', messages.length - lastMessageCount);
          this.emit('debug', { type: 'info', message: `New messages: ${messages.length - lastMessageCount}` });

          // Process new messages
          for (let i = lastMessageCount; i < messages.length; i++) {
            const msg = messages[i];
            const role = msg.role as string;
            const parts = msg.parts as Array<Record<string, unknown>> | undefined;
            const msgId = (msg.id || msg.messageId || `msg_${i}`) as string;

            if (role === 'assistant' && parts) {
              for (const part of parts) {
                this.handlePolledPart(msgId, part);
              }
            }
          }
          lastMessageCount = messages.length;
        }

        // Check for updates to the last message (streaming text)
        if (messages.length > 0) {
          const lastMsg = messages[messages.length - 1];
          const role = lastMsg.role as string;
          const parts = lastMsg.parts as Array<Record<string, unknown>> | undefined;
          const msgId = (lastMsg.id || lastMsg.messageId || 'last') as string;

          if (role === 'assistant' && parts) {
            const textParts = parts.filter(p => p.type === 'text');
            const currentText = textParts.map(p => (p.text || '') as string).join('');

            if (currentText !== lastMessageContent) {
              console.log('[OpenCode Server] Text updated, length:', currentText.length);
              this.emit('debug', { type: 'info', message: `Text updated: ${currentText.length} chars` });

              // Emit text delta
              this.emit('text-delta', {
                messageId: msgId,
                content: currentText,
                isComplete: status === 'idle',
              });

              lastMessageContent = currentText;
            }
          }
        }

        // Check if session is idle (done processing)
        if (status === 'idle') {
          consecutiveIdleCount++;
          if (consecutiveIdleCount >= 2) {
            console.log('[OpenCode Server] Session is idle, completing...');
            this.emit('debug', { type: 'info', message: 'Session idle, completing' });

            // Emit final text as complete
            if (lastMessageContent) {
              const lastMsg = messages[messages.length - 1];
              const msgId = (lastMsg?.id || lastMsg?.messageId || 'final') as string;
              this.emit('text-delta', {
                messageId: msgId,
                content: lastMessageContent,
                isComplete: true,
              });
            }

            this.hasCompleted = true;
            this.emit('complete', {
              status: 'success',
              sessionId: this.currentSessionId || undefined,
            });
            return;
          }
        } else {
          consecutiveIdleCount = 0;
        }

        // Log status periodically
        if (status !== 'idle') {
          this.emit('debug', { type: 'info', message: `Session status: ${status}, messages: ${messages.length}` });
        }

      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          console.log('[OpenCode Server] Polling aborted');
          return;
        }
        console.error('[OpenCode Server] Polling error:', error);
        this.emit('debug', { type: 'error', message: `Polling error: ${(error as Error).message}` });
      }

      await new Promise(r => setTimeout(r, pollInterval));
    }
  }

  /**
   * Handle a part from polled session data
   */
  private handlePolledPart(messageId: string, part: Record<string, unknown>): void {
    const partType = part.type as string;
    console.log('[OpenCode Server] Processing polled part:', partType);

    switch (partType) {
      case 'text':
        // Text parts are handled by the streaming text detection above
        break;

      case 'tool':
        const toolName = (part.tool || part.name || 'unknown') as string;
        const toolState = part.state as Record<string, unknown> | undefined;

        console.log('[OpenCode Server] Tool:', toolName, 'status:', toolState?.status);
        this.emit('tool-use', toolName, toolState?.input);
        this.emit('progress', { stage: 'tool-use', message: `Using ${toolName}` });

        if (toolState?.status === 'completed' || toolState?.status === 'error') {
          this.emit('tool-result', (toolState?.output || '') as string);
        }
        break;
    }
  }

  /**
   * Connect to SSE endpoint at /event and process events
   * Per OpenCode docs: GET /event returns server-sent events stream
   * First event is `server.connected`, then bus events
   */
  private async connectSSE(url: string, _isRetry: boolean = false): Promise<void> {
    try {
      console.log('[OpenCode Server] Connecting to SSE endpoint:', url);
      this.emit('debug', { type: 'info', message: `Connecting to SSE: ${url}` });

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'text/event-stream',
          'Cache-Control': 'no-cache',
        },
        signal: this.abortController?.signal,
      });

      console.log('[OpenCode Server] SSE response status:', response.status);
      const contentType = response.headers.get('content-type');
      this.emit('debug', { type: 'info', message: `SSE response: ${response.status}, content-type: ${contentType}` });

      if (!response.ok) {
        throw new OpenCodeServerError(`SSE connection failed: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new OpenCodeServerError('No response body for SSE');
      }

      console.log('[OpenCode Server] SSE connected, waiting for events...');
      this.emit('debug', { type: 'info', message: 'SSE connected, listening for events...' });

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          console.log('[OpenCode Server] SSE stream ended');
          this.emit('debug', { type: 'info', message: 'SSE stream ended' });
          break;
        }

        const chunk = decoder.decode(value, { stream: true });
        // Log first 200 chars of chunk for debugging
        if (chunk.length > 0) {
          console.log('[OpenCode Server] SSE chunk:', chunk.substring(0, 200));
          this.emit('debug', { type: 'info', message: `SSE data: ${chunk.substring(0, 100)}...` });
        }
        buffer += chunk;

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
      this.emit('debug', { type: 'error', message: `SSE error: ${(error as Error).message}` });
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

      case 'session.status':
        // Session status update (busy/idle)
        const statusProps = data.properties as Record<string, unknown> || data;
        const statusInfo = statusProps.status as Record<string, unknown> || {};
        const statusType = statusInfo.type as string;

        console.log('[OpenCode Server] Session status:', statusType);
        this.emit('debug', { type: 'info', message: `Session status: ${statusType}` });

        if (statusType === 'idle') {
          console.log('[OpenCode Server] Session is idle, completing...');
          this.finalizeStreaming();
          this.hasCompleted = true;
          this.emit('complete', {
            status: 'success',
            sessionId: this.currentSessionId || undefined,
          });
        }
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
        // Extract error from properties
        const errorProps = data.properties as Record<string, unknown> || data;
        const errorData = errorProps.error as Record<string, unknown> || {};
        const errorName = errorData.name as string || 'Error';
        const errorDetails = errorData.data as Record<string, unknown> || {};
        const errorMessage = (errorDetails.message || errorData.message || 'Session error') as string;

        console.error('[OpenCode Server] Session error:', errorName, errorMessage);
        this.emit('debug', { type: 'error', message: `${errorName}: ${errorMessage}` });

        this.hasCompleted = true;
        this.emit('complete', {
          status: 'error',
          sessionId: this.currentSessionId || undefined,
          error: `${errorName}: ${errorMessage}`,
        });
        break;

      default:
        console.log('[OpenCode Server] Unhandled event type:', eventType);
    }
  }

  /**
   * Handle message.updated event
   * Event structure: { type, properties: { info: { id, role, ... } } }
   */
  private handleMessageUpdated(data: Record<string, unknown>): void {
    const props = data.properties as Record<string, unknown> || data;
    const info = props.info as Record<string, unknown> || props;

    const messageId = info.id as string;
    const role = info.role as string;

    console.log('[OpenCode Server] Message updated:', messageId, 'role:', role);
    this.emit('debug', { type: 'info', message: `Message: ${messageId}, role: ${role}` });

    if (role === 'assistant') {
      this.currentMessageId = messageId;
    }
  }

  /**
   * Handle message.part.updated event (streaming text deltas)
   * Event structure: { type, properties: { part: { type, text, ... }, messageID, ... } }
   */
  private handleMessagePartUpdated(data: Record<string, unknown>): void {
    const props = data.properties as Record<string, unknown> || data;
    const part = props.part as Record<string, unknown> || props;
    const partType = part.type as string;
    const messageId = (props.messageID || part.messageID || this.currentMessageId) as string;

    console.log('[OpenCode Server] Part updated:', partType, 'messageId:', messageId);
    this.emit('debug', { type: 'info', message: `Part: ${partType}` });

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
        // Text update - contains the current full text content (accumulated)
        // This is NOT a delta - it's the complete text at this point in time
        const fullText = (part.text || '') as string;

        // Track streaming state
        this.streamingMessageId = messageId;
        this.streamingText = fullText;

        // Emit as text-delta (the frontend updateStreamingMessage handles this)
        // NOTE: isComplete is false here - we'll set it to true in finalizeStreaming
        // when the session becomes idle or step-finish is received
        // NOTE: We do NOT emit a 'message' event here because text-delta already
        // creates/updates the message in the frontend store. Emitting both would
        // cause duplicate messages.
        this.emit('text-delta', {
          messageId,
          content: fullText,
          isComplete: false,
        });

        console.log('[OpenCode Server] Text updated, length:', fullText.length);
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
      // Emit final text via text-delta (the frontend updateStreamingMessage handles this)
      // NOTE: We do NOT emit a 'message' event here because text-delta already
      // creates/updates the message in the frontend store. Emitting both would
      // cause duplicate messages.
      this.emit('text-delta', {
        messageId: this.streamingMessageId,
        content: this.streamingText,
        isComplete: true,
      });
    }

    this.streamingMessageId = null;
    this.streamingText = '';
  }

  /**
   * Send a message to the session asynchronously
   * Uses POST /session/:id/prompt_async which returns 204 No Content
   * The response will come via SSE events
   *
   * Per API docs, body can include: { messageID?, model?, agent?, noReply?, system?, tools?, parts }
   */
  private async sendMessage(prompt: string): Promise<void> {
    if (!this.serverPort || !this.currentSessionId) {
      throw new OpenCodeServerError('No active server or session');
    }

    console.log('[OpenCode Server] Sending async message to session:', this.currentSessionId);
    this.emit('debug', { type: 'info', message: `Sending message: ${prompt.substring(0, 100)}...` });

    // Build message body
    // Note: Model is set in the config file and session creation, not in individual messages.
    // The prompt_async API expects model as an object, not a string, so we don't include it here.
    const messageBody: Record<string, unknown> = {
      parts: [{ type: 'text', text: prompt }],
      agent: ACCOMPLISH_AGENT_NAME,
    };

    const response = await fetch(
      `http://localhost:${this.serverPort}/session/${this.currentSessionId}/prompt_async`,
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

    console.log('[OpenCode Server] Async message sent (204 expected)');
    this.emit('debug', { type: 'info', message: 'Async message sent, waiting for SSE events...' });
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
