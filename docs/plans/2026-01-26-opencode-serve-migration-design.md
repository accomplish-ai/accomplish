# OpenCode Serve Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the PTY-per-task model (`opencode run` via `node-pty`) with a single persistent `opencode serve` process communicating via `@opencode-ai/sdk` over HTTP + SSE.

**Architecture:** A `ServerManager` spawns and maintains one `opencode serve` child process. An `EventRouter` subscribes to the SSE event stream and maps SDK events to existing IPC channels. The `TaskManager` creates SDK sessions instead of adapter instances. The renderer is unchanged — all IPC channels and data shapes remain identical.

**Tech Stack:** Electron, TypeScript, `@opencode-ai/sdk`, `child_process.spawn`, SSE

---

## Pre-Implementation Context

### Current files (main process, `apps/desktop/src/main/`):

| File | Role | Fate |
|------|------|------|
| `opencode/adapter.ts` (~1300 lines) | PTY spawn, ANSI strip, NDJSON parse, event emit | **Delete** |
| `opencode/stream-parser.ts` (~200 lines) | NDJSON line parser | **Delete** |
| `opencode/log-watcher.ts` (~150 lines) | CLI log file error detection | **Delete** |
| `opencode/completion/` (~500 lines, 4 files) | Verification/continuation state machine | **Delete** |
| `permission-api.ts` (~300 lines) | HTTP bridge for file-permission + question MCP servers | **Delete** |
| `opencode/task-manager.ts` (~820 lines) | Task orchestration, queue, adapter lifecycle | **Rewrite** |
| `opencode/config-generator.ts` (~890 lines) | OpenCode JSON config, MCP server defs, system prompt | **Modify** |
| `opencode/cli-path.ts` (~254 lines) | CLI binary path resolution, version check | **Modify** (add exports) |
| `ipc/handlers.ts` (~2000 lines) | IPC handlers for task lifecycle, permissions | **Modify** |

### SDK types (from `@opencode-ai/sdk`):

```typescript
// Key event types from SSE stream
type EventMessagePartUpdated = { type: "message.part.updated"; properties: { part: Part; delta?: string } }
type EventSessionIdle = { type: "session.idle"; properties: { sessionID: string } }
type EventSessionError = { type: "session.error"; properties: { sessionID?: string; error?: Error } }
type EventSessionStatus = { type: "session.status"; properties: { sessionID: string; status: SessionStatus } }
type EventPermissionUpdated = { type: "permission.updated"; properties: Permission }
type EventTodoUpdated = { type: "todo.updated"; properties: { sessionID: string; todos: Todo[] } }

// Part union (key variants)
type TextPart = { id: string; type: "text"; text: string; sessionID: string; messageID: string }
type ToolPart = { id: string; type: "tool"; tool: string; state: ToolState; sessionID: string; messageID: string }
type FilePart = { id: string; type: "file"; mime: string; url: string; filename?: string }

// Permission
type Permission = { id: string; type: string; sessionID: string; title: string; metadata: Record<string, unknown>; time: { created: number } }
```

---

## Task 1: Install `@opencode-ai/sdk` dependency

**Files:**
- Modify: `apps/desktop/package.json`

**Step 1: Add SDK dependency**

```bash
cd apps/desktop && pnpm add @opencode-ai/sdk
```

**Step 2: Verify installation**

```bash
ls node_modules/@opencode-ai/sdk/package.json
```

Expected: file exists

**Step 3: Verify typecheck still passes**

```bash
cd /path/to/repo && pnpm typecheck
```

Expected: PASS (no changes to source yet)

**Step 4: Commit**

```bash
git add apps/desktop/package.json pnpm-lock.yaml
git commit -m "feat: add @opencode-ai/sdk dependency for serve migration"
```

---

## Task 2: Move CLI utility functions from adapter.ts to cli-path.ts

The `adapter.ts` file exports `isOpenCodeCliInstalled()` and `getOpenCodeCliVersion()` which are used by `handlers.ts` and `task-manager.ts`. Move these to `cli-path.ts` before deleting `adapter.ts`.

**Files:**
- Modify: `apps/desktop/src/main/opencode/cli-path.ts`
- Modify: `apps/desktop/src/main/ipc/handlers.ts` (import path only)
- Modify: `apps/desktop/src/main/opencode/task-manager.ts` (import path only)

**Step 1: Add utility exports to cli-path.ts**

Append to `apps/desktop/src/main/opencode/cli-path.ts` (after `getBundledOpenCodeVersion`):

```typescript
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
```

**Step 2: Update imports in handlers.ts**

In `apps/desktop/src/main/ipc/handlers.ts`, change:

```typescript
// OLD
import {
  isOpenCodeCliInstalled,
  getOpenCodeCliVersion,
} from '../opencode/adapter';

// NEW
import {
  isOpenCodeCliInstalled,
  getOpenCodeCliVersion,
} from '../opencode/cli-path';
```

**Step 3: Update imports in task-manager.ts**

In `apps/desktop/src/main/opencode/task-manager.ts`, change:

```typescript
// OLD
import { OpenCodeAdapter, isOpenCodeCliInstalled, OpenCodeCliNotFoundError } from './adapter';

// NEW
import { isOpenCodeCliInstalled, OpenCodeCliNotFoundError } from './cli-path';
```

(Don't remove the `OpenCodeAdapter` import yet — it's still used. That comes in Task 6.)

**Step 4: Verify typecheck**

```bash
pnpm typecheck
```

Expected: PASS

**Step 5: Commit**

```bash
git add apps/desktop/src/main/opencode/cli-path.ts apps/desktop/src/main/ipc/handlers.ts apps/desktop/src/main/opencode/task-manager.ts
git commit -m "refactor: move CLI utility functions from adapter.ts to cli-path.ts"
```

---

## Task 3: Create ServerManager

Manages the lifecycle of a single `opencode serve` child process.

**Files:**
- Create: `apps/desktop/src/main/opencode/server-manager.ts`

**Step 1: Create the ServerManager file**

Create `apps/desktop/src/main/opencode/server-manager.ts`:

```typescript
/**
 * ServerManager - Manages the lifecycle of a single `opencode serve` child process.
 *
 * Spawns `opencode serve` via child_process.spawn, waits for health check,
 * auto-restarts on crash with exponential backoff, and exposes an SDK client.
 */

import { spawn, type ChildProcess } from 'child_process';
import { createOpencodeClient, type Client } from '@opencode-ai/sdk';
import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import { getOpenCodeCliPath } from './cli-path';
import { getBundledNodePaths } from '../utils/bundled-node';
import { getExtendedNodePath } from '../utils/system-path';
import { app } from 'electron';

export type ServerState = 'stopped' | 'starting' | 'ready' | 'error';

interface ServerManagerEvents {
  'state-change': [ServerState];
  'error': [Error];
}

/** Default port for opencode serve */
const DEFAULT_PORT = 4096;

/** Health check polling interval in ms */
const HEALTH_POLL_MS = 200;

/** Max time to wait for server to become healthy */
const HEALTH_TIMEOUT_MS = 15000;

/** Max restart attempts before giving up */
const MAX_RESTART_ATTEMPTS = 5;

/** Base delay for exponential backoff (ms) */
const BACKOFF_BASE_MS = 1000;

/** Max backoff delay (ms) */
const BACKOFF_MAX_MS = 30000;

export class ServerManager extends EventEmitter<ServerManagerEvents> {
  private process: ChildProcess | null = null;
  private client: Client | null = null;
  private state: ServerState = 'stopped';
  private port: number = DEFAULT_PORT;
  private password: string = '';
  private restartAttempts: number = 0;
  private disposed: boolean = false;
  private healthCheckTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Get the current server state
   */
  getState(): ServerState {
    return this.state;
  }

  /**
   * Get the SDK client. Throws if server is not ready.
   */
  getClient(): Client {
    if (!this.client || this.state !== 'ready') {
      throw new Error('Server is not ready. Current state: ' + this.state);
    }
    return this.client;
  }

  /**
   * Get the server port
   */
  getPort(): number {
    return this.port;
  }

  /**
   * Start the opencode serve process
   */
  async start(): Promise<void> {
    if (this.state === 'ready' || this.state === 'starting') {
      return;
    }

    this.disposed = false;
    this.restartAttempts = 0;
    await this.spawnServer();
  }

  /**
   * Internal: spawn the server process and wait for health
   */
  private async spawnServer(): Promise<void> {
    this.setState('starting');

    // Generate a random password for this launch
    this.password = randomUUID();

    // Find an available port (start from DEFAULT_PORT)
    this.port = DEFAULT_PORT;

    // Get CLI path
    const { command: cliCommand, args: cliArgs } = getOpenCodeCliPath();

    // Build serve arguments
    const serveArgs = [
      ...cliArgs,
      'serve',
      '--port', String(this.port),
      '--hostname', '127.0.0.1',
    ];

    // Build environment
    const bundledPaths = getBundledNodePaths();
    const env: NodeJS.ProcessEnv = { ...process.env };

    // Add bundled Node.js to PATH
    if (bundledPaths) {
      const delimiter = process.platform === 'win32' ? ';' : ':';
      env.PATH = `${bundledPaths.binDir}${delimiter}${env.PATH || ''}`;
      env.NODE_BIN_PATH = bundledPaths.binDir;
    }

    // Extend PATH with system node paths
    const extendedPath = getExtendedNodePath();
    if (extendedPath) {
      const delimiter = process.platform === 'win32' ? ';' : ':';
      env.PATH = `${env.PATH}${delimiter}${extendedPath}`;
    }

    // Set server password for auth
    env.OPENCODE_SERVER_PASSWORD = this.password;

    // Ensure OPENCODE_CONFIG is set (config-generator sets this in process.env)
    // It should already be in process.env from generateOpenCodeConfig()

    console.log(`[ServerManager] Spawning: ${cliCommand} ${serveArgs.join(' ')}`);
    console.log(`[ServerManager] Port: ${this.port}`);

    // Spawn the process
    // On macOS packaged, use /bin/sh -c to avoid TCC dialogs
    let spawnCommand: string;
    let spawnArgs: string[];

    if (process.platform === 'darwin' && app.isPackaged) {
      const fullCommand = [cliCommand, ...serveArgs].map(a => `"${a}"`).join(' ');
      spawnCommand = '/bin/sh';
      spawnArgs = ['-c', fullCommand];
    } else {
      spawnCommand = cliCommand;
      spawnArgs = serveArgs;
    }

    const child = spawn(spawnCommand, spawnArgs, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env,
      windowsHide: true,
    });

    this.process = child;

    // Log stdout/stderr
    child.stdout?.on('data', (data: Buffer) => {
      const lines = data.toString().split('\n').filter(l => l.trim());
      for (const line of lines) {
        console.log('[opencode-serve stdout]', line);
      }
    });

    child.stderr?.on('data', (data: Buffer) => {
      const lines = data.toString().split('\n').filter(l => l.trim());
      for (const line of lines) {
        console.log('[opencode-serve stderr]', line);
      }
    });

    // Handle process exit
    child.on('exit', (code, signal) => {
      console.log(`[ServerManager] Process exited: code=${code}, signal=${signal}`);
      this.process = null;
      this.client = null;

      if (this.disposed) {
        this.setState('stopped');
        return;
      }

      // Unexpected exit — attempt restart
      this.setState('error');
      this.attemptRestart();
    });

    child.on('error', (err) => {
      console.error('[ServerManager] Spawn error:', err);
      this.process = null;
      this.setState('error');
      this.emit('error', err);
    });

    // Wait for health check
    try {
      await this.waitForHealth();
      this.restartAttempts = 0; // Reset on success

      // Create SDK client
      this.client = createOpencodeClient({
        baseUrl: `http://127.0.0.1:${this.port}`,
      });

      this.setState('ready');
      console.log(`[ServerManager] Server ready on port ${this.port}`);
    } catch (err) {
      console.error('[ServerManager] Health check failed:', err);
      this.kill();
      this.setState('error');
      this.emit('error', err instanceof Error ? err : new Error(String(err)));
    }
  }

  /**
   * Poll GET /health until 200 or timeout
   */
  private async waitForHealth(): Promise<void> {
    const startTime = Date.now();
    const url = `http://127.0.0.1:${this.port}/health`;

    while (Date.now() - startTime < HEALTH_TIMEOUT_MS) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 1000);
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timeout);

        if (res.ok) {
          console.log(`[ServerManager] Health check passed after ${Date.now() - startTime}ms`);
          return;
        }
      } catch {
        // Server not ready yet, keep polling
      }

      await new Promise(resolve => setTimeout(resolve, HEALTH_POLL_MS));
    }

    throw new Error(`Server health check timed out after ${HEALTH_TIMEOUT_MS}ms`);
  }

  /**
   * Attempt restart with exponential backoff
   */
  private async attemptRestart(): Promise<void> {
    if (this.disposed) return;

    this.restartAttempts++;
    if (this.restartAttempts > MAX_RESTART_ATTEMPTS) {
      console.error(`[ServerManager] Max restart attempts (${MAX_RESTART_ATTEMPTS}) reached. Giving up.`);
      this.emit('error', new Error('Server failed to restart after maximum attempts'));
      return;
    }

    const delay = Math.min(BACKOFF_BASE_MS * Math.pow(2, this.restartAttempts - 1), BACKOFF_MAX_MS);
    console.log(`[ServerManager] Restarting in ${delay}ms (attempt ${this.restartAttempts}/${MAX_RESTART_ATTEMPTS})`);

    await new Promise(resolve => setTimeout(resolve, delay));

    if (this.disposed) return;

    try {
      await this.spawnServer();
    } catch (err) {
      console.error('[ServerManager] Restart failed:', err);
    }
  }

  /**
   * Kill the server process
   */
  private kill(): void {
    if (this.process) {
      try {
        this.process.kill('SIGTERM');
        // Force kill after 3 seconds
        setTimeout(() => {
          if (this.process) {
            this.process.kill('SIGKILL');
          }
        }, 3000);
      } catch {
        // Process may already be dead
      }
    }
  }

  /**
   * Gracefully dispose the server
   */
  async dispose(): Promise<void> {
    this.disposed = true;

    if (this.healthCheckTimer) {
      clearTimeout(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }

    // Try graceful shutdown via SDK
    if (this.client && this.state === 'ready') {
      try {
        // Give the server a chance to clean up
        await Promise.race([
          this.client.instance.dispose(),
          new Promise(resolve => setTimeout(resolve, 3000)),
        ]);
      } catch {
        // Ignore errors during shutdown
      }
    }

    // Force kill if still running
    this.kill();

    this.client = null;
    this.process = null;
    this.setState('stopped');
    console.log('[ServerManager] Disposed');
  }

  private setState(state: ServerState): void {
    if (this.state !== state) {
      this.state = state;
      this.emit('state-change', state);
    }
  }
}

// Singleton
let serverManagerInstance: ServerManager | null = null;

export function getServerManager(): ServerManager {
  if (!serverManagerInstance) {
    serverManagerInstance = new ServerManager();
  }
  return serverManagerInstance;
}

export function disposeServerManager(): Promise<void> {
  if (serverManagerInstance) {
    const promise = serverManagerInstance.dispose();
    serverManagerInstance = null;
    return promise;
  }
  return Promise.resolve();
}
```

**Step 2: Verify typecheck**

```bash
pnpm typecheck
```

Expected: PASS (new file, no consumers yet)

**Step 3: Commit**

```bash
git add apps/desktop/src/main/opencode/server-manager.ts
git commit -m "feat: add ServerManager for opencode serve lifecycle"
```

---

## Task 4: Create EventRouter

Single SSE subscription that routes SDK events to the correct task via callbacks.

**Files:**
- Create: `apps/desktop/src/main/opencode/event-router.ts`

**Step 1: Create the EventRouter file**

Create `apps/desktop/src/main/opencode/event-router.ts`:

```typescript
/**
 * EventRouter - Subscribes to the SDK SSE event stream and routes events
 * to the correct task by mapping sessionId -> taskId.
 *
 * Maps SDK events to the existing TaskCallbacks interface so that
 * IPC handlers and the renderer remain unchanged.
 */

import type { Client } from '@opencode-ai/sdk';
import type {
  TaskMessage,
  TaskResult,
  PermissionRequest,
  TodoItem,
} from '@accomplish/shared';

/**
 * Callbacks for task events - same interface as current TaskCallbacks
 * so IPC handlers remain unchanged.
 */
export interface TaskEventCallbacks {
  onTaskMessage: (taskId: string, message: TaskMessage) => void;
  onTaskProgress: (taskId: string, progress: { stage: string; message?: string; modelName?: string }) => void;
  onPermissionRequest: (taskId: string, request: PermissionRequest) => void;
  onTaskComplete: (taskId: string, result: TaskResult) => void;
  onTaskError: (taskId: string, error: Error) => void;
  onTodoUpdate: (taskId: string, todos: TodoItem[]) => void;
  onDebug: (taskId: string, log: { type: string; message: string; data?: unknown }) => void;
}

/** Batching interval for text message updates (matches current 50ms) */
const TEXT_BATCH_INTERVAL_MS = 50;

/** Tracks accumulated text for a session during batching */
interface TextAccumulator {
  sessionId: string;
  messageId: string;
  text: string;
  timer: ReturnType<typeof setTimeout> | null;
}

let messageIdCounter = 0;
function createMessageId(): string {
  return `msg_${Date.now()}_${++messageIdCounter}`;
}

export class EventRouter {
  /** sessionId -> taskId mapping */
  private sessionToTask: Map<string, string> = new Map();
  /** taskId -> sessionId reverse mapping */
  private taskToSession: Map<string, string> = new Map();
  /** sessionId -> accumulated text for batching */
  private textAccumulators: Map<string, TextAccumulator> = new Map();
  /** Subscription cleanup function */
  private unsubscribe: (() => void) | null = null;
  /** Global event callbacks */
  private callbacks: TaskEventCallbacks | null = null;
  /** Active tool parts being tracked: partId -> { sessionId, toolName } */
  private activeTools: Map<string, { sessionId: string; toolName: string }> = new Map();

  /**
   * Set the global event callbacks
   */
  setCallbacks(callbacks: TaskEventCallbacks): void {
    this.callbacks = callbacks;
  }

  /**
   * Register a session-to-task mapping
   */
  registerSession(sessionId: string, taskId: string): void {
    this.sessionToTask.set(sessionId, taskId);
    this.taskToSession.set(taskId, sessionId);
    console.log(`[EventRouter] Registered session ${sessionId} -> task ${taskId}`);
  }

  /**
   * Unregister a session mapping (on task complete/cleanup)
   */
  unregisterSession(sessionId: string): void {
    const taskId = this.sessionToTask.get(sessionId);
    this.sessionToTask.delete(sessionId);
    if (taskId) {
      this.taskToSession.delete(taskId);
    }
    // Flush any pending text
    this.flushText(sessionId);
    this.textAccumulators.delete(sessionId);
    console.log(`[EventRouter] Unregistered session ${sessionId}`);
  }

  /**
   * Get the sessionId for a taskId
   */
  getSessionId(taskId: string): string | undefined {
    return this.taskToSession.get(taskId);
  }

  /**
   * Subscribe to the SDK event stream
   */
  async subscribe(client: Client): Promise<void> {
    if (this.unsubscribe) {
      this.unsubscribe();
    }

    console.log('[EventRouter] Subscribing to SSE event stream');

    try {
      const stream = client.event.subscribe();

      // The SDK's subscribe() returns an async iterable or event emitter
      // Handle events as they arrive
      this.processEventStream(stream);
    } catch (err) {
      console.error('[EventRouter] Failed to subscribe:', err);
      throw err;
    }
  }

  /**
   * Process the SSE event stream
   */
  private async processEventStream(stream: unknown): Promise<void> {
    // The SDK event.subscribe() returns a readable stream or async iterable
    // Exact API depends on SDK version - adapt as needed during implementation
    try {
      const eventStream = stream as AsyncIterable<{ type: string; properties: unknown }>;
      for await (const event of eventStream) {
        this.handleEvent(event);
      }
    } catch (err) {
      console.error('[EventRouter] Event stream error:', err);
      // Stream will be re-established by ServerManager restart
    }
  }

  /**
   * Handle a single SSE event
   */
  private handleEvent(event: { type: string; properties: unknown }): void {
    if (!this.callbacks) return;

    try {
      switch (event.type) {
        case 'message.part.updated':
          this.handlePartUpdated(event.properties as {
            part: { id: string; type: string; sessionID: string; messageID: string; [key: string]: unknown };
            delta?: string;
          });
          break;

        case 'session.idle':
          this.handleSessionIdle(event.properties as { sessionID: string });
          break;

        case 'session.error':
          this.handleSessionError(event.properties as { sessionID?: string; error?: { type: string; message?: string } });
          break;

        case 'session.status':
          this.handleSessionStatus(event.properties as { sessionID: string; status: string });
          break;

        case 'permission.updated':
          this.handlePermission(event.properties as {
            id: string;
            type: string;
            sessionID: string;
            title: string;
            metadata: Record<string, unknown>;
            time: { created: number };
          });
          break;

        case 'todo.updated':
          this.handleTodoUpdated(event.properties as { sessionID: string; todos: Array<{ id: string; content: string; status: string; priority?: string }> });
          break;

        default:
          // Ignore unhandled event types
          break;
      }
    } catch (err) {
      console.error(`[EventRouter] Error handling event ${event.type}:`, err);
    }
  }

  /**
   * Handle message.part.updated events
   */
  private handlePartUpdated(props: {
    part: { id: string; type: string; sessionID: string; messageID: string; [key: string]: unknown };
    delta?: string;
  }): void {
    const { part, delta } = props;
    const taskId = this.sessionToTask.get(part.sessionID);
    if (!taskId || !this.callbacks) return;

    if (part.type === 'text') {
      // Accumulate text with batching
      this.accumulateText(part.sessionID, part.messageID, delta || (part as { text?: string }).text || '');
    } else if (part.type === 'tool') {
      this.handleToolPart(taskId, part as {
        id: string;
        type: string;
        sessionID: string;
        messageID: string;
        tool: string;
        state: { status: string; input?: Record<string, unknown>; output?: string; title?: string; attachments?: Array<{ type: string; mime: string; url: string; filename?: string }> };
      });
    } else if (part.type === 'step-start') {
      // Map to progress event with model name
      const stepPart = part as { providerID?: string; modelID?: string };
      this.callbacks.onTaskProgress(taskId, {
        stage: 'connecting',
        message: 'Connecting to provider...',
        modelName: stepPart.modelID,
      });
    }
  }

  /**
   * Handle tool part updates
   */
  private handleToolPart(taskId: string, part: {
    id: string;
    type: string;
    sessionID: string;
    messageID: string;
    tool: string;
    state: {
      status: string;
      input?: Record<string, unknown>;
      output?: string;
      title?: string;
      attachments?: Array<{ type: string; mime: string; url: string; filename?: string }>;
    };
  }): void {
    if (!this.callbacks) return;

    const { tool, state } = part;

    // Clear startup stage on first tool use
    this.callbacks.onTaskProgress(taskId, { stage: 'tool-use' });

    if (state.status === 'running' || state.status === 'pending') {
      // Tool starting
      this.activeTools.set(part.id, { sessionId: part.sessionID, toolName: tool });

      const message: TaskMessage = {
        id: createMessageId(),
        type: 'tool',
        content: `Using tool: ${tool}`,
        toolName: tool,
        toolInput: state.input,
        timestamp: new Date().toISOString(),
      };
      this.callbacks.onTaskMessage(taskId, message);

    } else if (state.status === 'completed') {
      // Tool completed — emit result
      const attachments = this.extractAttachments(state.attachments);

      const message: TaskMessage = {
        id: createMessageId(),
        type: 'tool',
        content: state.output || state.title || `Tool ${tool} completed`,
        toolName: tool,
        toolInput: state.input,
        timestamp: new Date().toISOString(),
        attachments: attachments.length > 0 ? attachments : undefined,
      };
      this.callbacks.onTaskMessage(taskId, message);
      this.activeTools.delete(part.id);

    } else if (state.status === 'error') {
      // Tool error
      const message: TaskMessage = {
        id: createMessageId(),
        type: 'tool',
        content: `Tool ${tool} error: ${(state as { error?: string }).error || 'Unknown error'}`,
        toolName: tool,
        toolInput: state.input,
        timestamp: new Date().toISOString(),
      };
      this.callbacks.onTaskMessage(taskId, message);
      this.activeTools.delete(part.id);
    }
  }

  /**
   * Extract screenshot/file attachments from tool output
   */
  private extractAttachments(
    sdkAttachments?: Array<{ type: string; mime: string; url: string; filename?: string }>
  ): Array<{ type: 'screenshot' | 'json'; data: string; label?: string }> {
    if (!sdkAttachments) return [];

    const result: Array<{ type: 'screenshot' | 'json'; data: string; label?: string }> = [];

    for (const attachment of sdkAttachments) {
      if (attachment.mime.startsWith('image/')) {
        // Image attachment — extract as screenshot
        result.push({
          type: 'screenshot',
          data: attachment.url, // SDK provides URL or base64
          label: attachment.filename || 'Browser screenshot',
        });
      } else if (attachment.mime === 'application/json') {
        result.push({
          type: 'json',
          data: attachment.url,
          label: attachment.filename,
        });
      }
    }

    return result;
  }

  /**
   * Accumulate text with 50ms batching
   */
  private accumulateText(sessionId: string, messageId: string, text: string): void {
    let acc = this.textAccumulators.get(sessionId);

    if (!acc || acc.messageId !== messageId) {
      // Flush previous message if exists
      if (acc) {
        this.flushText(sessionId);
      }
      acc = { sessionId, messageId, text: '', timer: null };
      this.textAccumulators.set(sessionId, acc);
    }

    acc.text += text;

    // Reset the batch timer
    if (acc.timer) {
      clearTimeout(acc.timer);
    }

    acc.timer = setTimeout(() => {
      this.flushText(sessionId);
    }, TEXT_BATCH_INTERVAL_MS);
  }

  /**
   * Flush accumulated text for a session
   */
  private flushText(sessionId: string): void {
    const acc = this.textAccumulators.get(sessionId);
    if (!acc || !acc.text) return;

    const taskId = this.sessionToTask.get(sessionId);
    if (!taskId || !this.callbacks) return;

    if (acc.timer) {
      clearTimeout(acc.timer);
      acc.timer = null;
    }

    const message: TaskMessage = {
      id: createMessageId(),
      type: 'assistant',
      content: acc.text,
      timestamp: new Date().toISOString(),
    };

    this.callbacks.onTaskMessage(taskId, message);

    // Reset accumulator text but keep the entry
    acc.text = '';
  }

  /**
   * Flush all pending text for a task (call before permission request or completion)
   */
  flushTaskText(taskId: string): void {
    const sessionId = this.taskToSession.get(taskId);
    if (sessionId) {
      this.flushText(sessionId);
    }
  }

  /**
   * Handle session.idle — task completed successfully
   */
  private handleSessionIdle(props: { sessionID: string }): void {
    const taskId = this.sessionToTask.get(props.sessionID);
    if (!taskId || !this.callbacks) return;

    // Flush pending text before completing
    this.flushText(props.sessionID);

    const result: TaskResult = {
      status: 'success',
      sessionId: props.sessionID,
    };

    this.callbacks.onTaskComplete(taskId, result);
  }

  /**
   * Handle session.error
   */
  private handleSessionError(props: { sessionID?: string; error?: { type: string; message?: string } }): void {
    if (!props.sessionID) return;

    const taskId = this.sessionToTask.get(props.sessionID);
    if (!taskId || !this.callbacks) return;

    // Flush pending text before error
    this.flushText(props.sessionID);

    const errorMessage = props.error?.message || props.error?.type || 'Unknown error';
    this.callbacks.onTaskError(taskId, new Error(errorMessage));
  }

  /**
   * Handle session.status changes
   */
  private handleSessionStatus(props: { sessionID: string; status: string }): void {
    const taskId = this.sessionToTask.get(props.sessionID);
    if (!taskId || !this.callbacks) return;

    // Map SDK status to progress stages
    if (props.status === 'busy') {
      this.callbacks.onTaskProgress(taskId, {
        stage: 'waiting',
        message: 'Processing...',
      });
    }
  }

  /**
   * Handle permission.updated — map SDK Permission to app's PermissionRequest
   */
  private handlePermission(permission: {
    id: string;
    type: string;
    sessionID: string;
    title: string;
    metadata: Record<string, unknown>;
    time: { created: number };
  }): void {
    const taskId = this.sessionToTask.get(permission.sessionID);
    if (!taskId || !this.callbacks) return;

    // Flush pending text before showing permission dialog
    this.flushText(permission.sessionID);

    // Map SDK Permission to app's PermissionRequest shape
    // The metadata field contains tool-specific details
    const meta = permission.metadata || {};

    const request: PermissionRequest = {
      id: permission.id,
      taskId,
      type: meta.question ? 'question' : 'file',
      // File permission fields
      fileOperation: meta.operation as PermissionRequest['fileOperation'],
      filePath: meta.filePath as string | undefined,
      filePaths: meta.filePaths as string[] | undefined,
      targetPath: meta.targetPath as string | undefined,
      contentPreview: meta.contentPreview as string | undefined,
      // Question fields
      question: meta.question as string | undefined,
      header: meta.header as string | undefined,
      options: meta.options as PermissionRequest['options'],
      multiSelect: meta.multiSelect as boolean | undefined,
      createdAt: new Date(permission.time.created).toISOString(),
    };

    this.callbacks.onPermissionRequest(taskId, request);
  }

  /**
   * Handle todo.updated
   */
  private handleTodoUpdated(props: { sessionID: string; todos: Array<{ id: string; content: string; status: string; priority?: string }> }): void {
    const taskId = this.sessionToTask.get(props.sessionID);
    if (!taskId || !this.callbacks) return;

    const todos: TodoItem[] = props.todos.map(t => ({
      id: t.id,
      content: t.content,
      status: t.status as TodoItem['status'],
      priority: (t.priority || 'medium') as TodoItem['priority'],
    }));

    this.callbacks.onTodoUpdate(taskId, todos);
  }

  /**
   * Dispose and clean up
   */
  dispose(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }

    // Clear all timers
    for (const acc of this.textAccumulators.values()) {
      if (acc.timer) clearTimeout(acc.timer);
    }
    this.textAccumulators.clear();
    this.sessionToTask.clear();
    this.taskToSession.clear();
    this.activeTools.clear();
    this.callbacks = null;

    console.log('[EventRouter] Disposed');
  }
}

// Singleton
let eventRouterInstance: EventRouter | null = null;

export function getEventRouter(): EventRouter {
  if (!eventRouterInstance) {
    eventRouterInstance = new EventRouter();
  }
  return eventRouterInstance;
}

export function disposeEventRouter(): void {
  if (eventRouterInstance) {
    eventRouterInstance.dispose();
    eventRouterInstance = null;
  }
}
```

**Step 2: Verify typecheck**

```bash
pnpm typecheck
```

Expected: PASS

**Step 3: Commit**

```bash
git add apps/desktop/src/main/opencode/event-router.ts
git commit -m "feat: add EventRouter for SSE event routing to IPC"
```

---

## Task 5: Update config-generator.ts — remove permission/question MCP servers

**Files:**
- Modify: `apps/desktop/src/main/opencode/config-generator.ts`

**Step 1: Remove permission-api import**

In `config-generator.ts`, remove line 4:

```typescript
// DELETE THIS LINE:
import { PERMISSION_API_PORT, QUESTION_API_PORT } from '../permission-api';
```

**Step 2: Remove file-permission and ask-user-question MCP server configs**

In the `mcp` section of the config object (around line 754), change from:

```typescript
    mcp: {
      'file-permission': {
        type: 'local',
        command: ['npx', 'tsx', filePermissionServerPath],
        enabled: true,
        environment: {
          PERMISSION_API_PORT: String(PERMISSION_API_PORT),
        },
        timeout: 30000,
      },
      'ask-user-question': {
        type: 'local',
        command: ['npx', 'tsx', path.join(skillsPath, 'ask-user-question', 'src', 'index.ts')],
        enabled: true,
        environment: {
          QUESTION_API_PORT: String(QUESTION_API_PORT),
        },
        timeout: 30000,
      },
      'dev-browser-mcp': {
```

To:

```typescript
    mcp: {
      'dev-browser-mcp': {
```

**Step 3: Remove the filePermissionServerPath variable**

Around line 447, remove:

```typescript
  // DELETE THIS LINE:
  const filePermissionServerPath = path.join(skillsPath, 'file-permission', 'src', 'index.ts');
```

**Step 4: Update system prompt — remove request_file_permission instructions**

In `ACCOMPLISH_SYSTEM_PROMPT_TEMPLATE`, remove the entire `<important name="filesystem-rules">` block (lines 83-107) and the `<tool name="request_file_permission">` block (lines 109-139). Also remove the `<important name="user-communication">` block (lines 141-145) since questions are now handled natively by the SDK.

Replace those blocks with a simpler note:

```typescript
<important name="filesystem-rules">
File operations (create, modify, delete, rename) require user permission.
The system will automatically ask the user for permission when you use file tools.
You do NOT need to request permission manually — just use the tools directly.
</important>

<important name="user-communication">
CRITICAL: The user CANNOT see your text output or CLI prompts!
When you need to ask the user a question, use the AskUserQuestion tool.
The system will display your question in the UI and return the user's response.
</important>
```

**Step 5: Verify typecheck**

```bash
pnpm typecheck
```

Expected: PASS

**Step 6: Commit**

```bash
git add apps/desktop/src/main/opencode/config-generator.ts
git commit -m "refactor: remove permission/question MCP servers from config, simplify system prompt"
```

---

## Task 6: Rewrite TaskManager to use SDK sessions

This is the largest task. The `TaskManager` keeps its public interface but internally uses the SDK client via `ServerManager` and registers sessions with `EventRouter`.

**Files:**
- Rewrite: `apps/desktop/src/main/opencode/task-manager.ts`

**Step 1: Rewrite task-manager.ts**

Replace the entire file contents. Key changes:
- Remove `OpenCodeAdapter` import and usage
- Import `getServerManager` and `getEventRouter`
- `executeTask()` calls `client.session.create()` then `client.session.promptAsync()`
- `cancelTask()` / `interruptTask()` call `client.session.abort()`
- `sendResponse()` calls `client.postSessionIdPermissionsPermissionId()`
- Register/unregister sessions with EventRouter
- Keep browser setup logic (Playwright install, dev-browser server)
- Keep queue logic

The full rewrite preserves the existing public API (`startTask`, `cancelTask`, `interruptTask`, `sendResponse`, `getSessionId`, `dispose`, etc.) but replaces internal adapter-based execution with SDK session calls.

Key sections of the rewrite:

```typescript
// In executeTask(), replace adapter creation with:
const serverManager = getServerManager();
const client = serverManager.getClient();

// Create SDK session
const session = await client.session.create({});
const sessionId = session.id;

// Register with EventRouter
const eventRouter = getEventRouter();
eventRouter.registerSession(sessionId, taskId);

// Store session mapping
this.taskSessions.set(taskId, sessionId);

// Send prompt via SDK (non-blocking)
await client.session.promptAsync({
  sessionID: sessionId,
  parts: [{ type: 'text', text: config.prompt }],
});

// For session resume:
// client.session.promptAsync({ sessionID: existingSessionId, parts: [...] })

// For cancel/interrupt:
// client.session.abort({ sessionID })

// For permission reply:
// client.postSessionIdPermissionsPermissionId({ path: { sessionId, permissionId }, body: { response } })
```

The `ManagedTask` interface changes from storing an `adapter` to storing a `sessionId`:

```typescript
interface ManagedTask {
  taskId: string;
  sessionId: string;
  callbacks: TaskCallbacks;
  createdAt: Date;
}
```

**Step 2: Verify typecheck**

```bash
pnpm typecheck
```

Expected: PASS (may have errors from handlers.ts if it still imports old symbols — fix in next task)

**Step 3: Commit**

```bash
git add apps/desktop/src/main/opencode/task-manager.ts
git commit -m "refactor: rewrite TaskManager to use SDK sessions instead of PTY adapters"
```

---

## Task 7: Update IPC handlers for SDK permission flow

**Files:**
- Modify: `apps/desktop/src/main/ipc/handlers.ts`

**Step 1: Remove permission-api imports**

Remove:

```typescript
import {
  startPermissionApiServer,
  startQuestionApiServer,
  initPermissionApi,
  resolvePermission,
  resolveQuestion,
  isFilePermissionRequest,
  isQuestionRequest,
} from '../permission-api';
```

**Step 2: Add ServerManager and EventRouter imports**

Add:

```typescript
import { getServerManager, disposeServerManager } from '../opencode/server-manager';
import { getEventRouter, disposeEventRouter } from '../opencode/event-router';
```

**Step 3: Update task:start handler initialization**

Replace the permission API server initialization (around line 304) with server manager initialization:

```typescript
// OLD: Initialize permission API servers
// if (!permissionApiInitialized) {
//   initPermissionApi(window, () => taskManager.getActiveTaskId());
//   startPermissionApiServer();
//   startQuestionApiServer();
//   permissionApiInitialized = true;
// }

// NEW: Ensure opencode serve is running
const serverManager = getServerManager();
if (serverManager.getState() === 'stopped') {
  await serverManager.start();
  // Subscribe EventRouter to SSE stream
  const eventRouter = getEventRouter();
  await eventRouter.subscribe(serverManager.getClient());
}
```

**Step 4: Rewrite permission:respond handler**

Replace the entire handler body. Instead of routing to HTTP bridge servers, reply via SDK:

```typescript
handle('permission:respond', async (_event: IpcMainInvokeEvent, response: PermissionResponse) => {
  const parsedResponse = validate(permissionResponseSchema, response);
  const { taskId, decision, requestId } = parsedResponse;

  if (!requestId) {
    console.warn('[IPC] Permission response missing requestId');
    return;
  }

  const serverManager = getServerManager();
  if (serverManager.getState() !== 'ready') {
    console.warn('[IPC] Server not ready for permission reply');
    return;
  }

  const client = serverManager.getClient();
  const eventRouter = getEventRouter();
  const sessionId = eventRouter.getSessionId(taskId);

  if (!sessionId) {
    console.warn(`[IPC] No session found for task ${taskId}`);
    return;
  }

  try {
    // Map app decision to SDK response
    let sdkResponse: string;
    if (decision === 'allow') {
      sdkResponse = 'allow';
    } else {
      sdkResponse = 'deny';
    }

    // Reply via SDK
    await client.postSessionIdPermissionsPermissionId({
      path: { sessionId, permissionId: requestId },
      body: { response: sdkResponse },
    });

    console.log(`[IPC] Permission ${requestId} replied: ${sdkResponse}`);
  } catch (err) {
    console.error(`[IPC] Failed to reply to permission ${requestId}:`, err);
  }
});
```

**Step 5: Update session:resume handler**

The session:resume handler currently creates a new task via `taskManager.startTask()` with a `sessionId` in the config. Update it to pass the sessionId through — the TaskManager rewrite (Task 6) already handles resume via `client.session.promptAsync()` with an existing sessionId.

No structural change needed here if TaskManager's `startTask()` already handles `config.sessionId`. Verify the flow works.

**Step 6: Update app quit handler**

In the `before-quit` or cleanup section, add:

```typescript
await disposeServerManager();
disposeEventRouter();
```

**Step 7: Verify typecheck**

```bash
pnpm typecheck
```

Expected: PASS

**Step 8: Commit**

```bash
git add apps/desktop/src/main/ipc/handlers.ts
git commit -m "refactor: update IPC handlers for SDK permission flow, remove HTTP bridge"
```

---

## Task 8: Wire EventRouter callbacks to IPC forwarding

The EventRouter needs to be wired up so that its callbacks forward events to the renderer via IPC — replicating what the current `TaskCallbacks` pattern does in handlers.ts.

**Files:**
- Modify: `apps/desktop/src/main/ipc/handlers.ts`

**Step 1: Set up EventRouter callbacks in registerHandlers()**

After server start (from Task 7 Step 3), wire up the EventRouter callbacks:

```typescript
const eventRouter = getEventRouter();
eventRouter.setCallbacks({
  onTaskMessage: (taskId, message) => {
    // Use existing queueMessage batching
    queueMessage(taskId, message, forwardToRenderer, addTaskMessage);
  },
  onTaskProgress: (taskId, progress) => {
    forwardToRenderer('task:progress', { taskId, ...progress });
  },
  onPermissionRequest: (taskId, request) => {
    flushAndCleanupBatcher(taskId);
    forwardToRenderer('permission:request', request);
  },
  onTaskComplete: (taskId, result) => {
    flushAndCleanupBatcher(taskId);
    forwardToRenderer('task:update', { taskId, type: 'complete', result });

    let taskStatus: TaskStatus;
    if (result.status === 'success') taskStatus = 'completed';
    else if (result.status === 'interrupted') taskStatus = 'interrupted';
    else taskStatus = 'failed';
    updateTaskStatus(taskId, taskStatus, new Date().toISOString());

    if (result.sessionId) {
      updateTaskSessionId(taskId, result.sessionId);
    }
  },
  onTaskError: (taskId, error) => {
    flushAndCleanupBatcher(taskId);
    forwardToRenderer('task:update', { taskId, type: 'error', error: error.message });
    updateTaskStatus(taskId, 'failed', new Date().toISOString());
  },
  onTodoUpdate: (taskId, todos) => {
    forwardToRenderer('todo:update', { taskId, todos });
  },
  onDebug: (taskId, log) => {
    if (getDebugMode()) {
      forwardToRenderer('debug:log', { taskId, timestamp: new Date().toISOString(), ...log });
    }
  },
});
```

Note: `forwardToRenderer` must be accessible here. It's currently defined inside specific handler callbacks. Refactor it to be a module-level helper that sends to the main window.

**Step 2: Verify typecheck**

```bash
pnpm typecheck
```

Expected: PASS

**Step 3: Commit**

```bash
git add apps/desktop/src/main/ipc/handlers.ts
git commit -m "feat: wire EventRouter callbacks to IPC forwarding"
```

---

## Task 9: Delete old files

**Files:**
- Delete: `apps/desktop/src/main/opencode/adapter.ts`
- Delete: `apps/desktop/src/main/opencode/stream-parser.ts`
- Delete: `apps/desktop/src/main/opencode/log-watcher.ts`
- Delete: `apps/desktop/src/main/opencode/completion/completion-enforcer.ts`
- Delete: `apps/desktop/src/main/opencode/completion/completion-state.ts`
- Delete: `apps/desktop/src/main/opencode/completion/index.ts`
- Delete: `apps/desktop/src/main/opencode/completion/prompts.ts`
- Delete: `apps/desktop/src/main/permission-api.ts`

**Step 1: Delete files**

```bash
rm apps/desktop/src/main/opencode/adapter.ts
rm apps/desktop/src/main/opencode/stream-parser.ts
rm apps/desktop/src/main/opencode/log-watcher.ts
rm -rf apps/desktop/src/main/opencode/completion
rm apps/desktop/src/main/permission-api.ts
```

**Step 2: Remove any remaining imports of deleted files**

Search for stale imports:

```bash
grep -rn "from.*adapter" apps/desktop/src/main/ --include="*.ts"
grep -rn "from.*stream-parser" apps/desktop/src/main/ --include="*.ts"
grep -rn "from.*log-watcher" apps/desktop/src/main/ --include="*.ts"
grep -rn "from.*completion" apps/desktop/src/main/ --include="*.ts"
grep -rn "from.*permission-api" apps/desktop/src/main/ --include="*.ts"
```

Fix any remaining imports found.

**Step 3: Verify typecheck**

```bash
pnpm typecheck
```

Expected: PASS

**Step 4: Commit**

```bash
git add -A
git commit -m "refactor: delete PTY adapter, stream parser, log watcher, completion enforcer, permission API (~2500 lines)"
```

---

## Task 10: Remove node-pty and update build config

**Files:**
- Modify: `apps/desktop/package.json`

**Step 1: Remove node-pty dependency**

```bash
cd apps/desktop && pnpm remove node-pty
```

**Step 2: Remove @electron/rebuild devDependency**

```bash
cd apps/desktop && pnpm remove @electron/rebuild
```

**Step 3: Update asarUnpack in package.json build config**

In `apps/desktop/package.json`, in the `build.asarUnpack` array, remove:

```json
"node_modules/node-pty/build/**/*.node",
"node_modules/node-pty/package.json",
```

**Step 4: Update build.files in package.json**

In the `build.files` array, remove:

```json
"node_modules/node-pty/**",
```

**Step 5: Remove electron-rebuild postinstall if present**

Check `scripts.postinstall` in package.json. If it references electron-rebuild for node-pty, update or remove it. Currently it runs `node scripts/postinstall.cjs` — check that script.

**Step 6: Verify build compiles**

```bash
pnpm build
```

Expected: PASS

**Step 7: Commit**

```bash
git add apps/desktop/package.json pnpm-lock.yaml
git commit -m "chore: remove node-pty dependency and build config references"
```

---

## Task 11: Smoke test

**Step 1: Run dev mode**

```bash
pnpm dev
```

**Step 2: Verify startup**

- App window opens
- No crash on launch
- Console shows `[ServerManager] Server ready on port 4096`
- Console shows `[EventRouter] Subscribing to SSE event stream`

**Step 3: Execute a task**

- Type a simple prompt: "What is 2+2?"
- Verify:
  - Startup stages appear (connecting → tool-use)
  - Assistant response appears
  - Task completes with success status
  - Session ID is recorded

**Step 4: Test permission flow**

- Type a prompt that triggers file operations: "Create a file called test.txt on my Desktop with the text hello"
- Verify:
  - Permission dialog appears
  - Allow/Deny buttons work
  - File is created (if allowed) or task continues (if denied)

**Step 5: Test session resume**

- After a completed task, type a follow-up message
- Verify the conversation continues in the same context

**Step 6: Test interrupt**

- Start a long task and click Stop
- Verify the task is interrupted and the session is preserved

**Step 7: Test crash recovery**

- Kill the opencode serve process manually: `kill <pid>`
- Verify console shows restart attempts
- Start a new task — verify it works after restart

**Step 8: Commit any fixes discovered during testing**

```bash
git add -A
git commit -m "fix: address issues found during smoke testing"
```

---

## Summary of changes

| Category | Files | Lines (approx) |
|----------|-------|-----------------|
| **Created** | `server-manager.ts`, `event-router.ts` | +600 |
| **Modified** | `cli-path.ts`, `task-manager.ts`, `config-generator.ts`, `handlers.ts`, `package.json` | ±500 |
| **Deleted** | `adapter.ts`, `stream-parser.ts`, `log-watcher.ts`, `completion/*` (4 files), `permission-api.ts` | -2500 |
| **Net change** | | **-1400 lines** |

**Dependencies added:** `@opencode-ai/sdk`
**Dependencies removed:** `node-pty`, `@electron/rebuild`

---

## Implementation Notes

### SDK API verification needed

The EventRouter's event handling code is based on the SDK type definitions discovered during research. The exact shape of some events (especially `permission.updated` metadata fields and `event.subscribe()` return type) should be verified against the actual SDK at implementation time. Key areas:

1. **`client.event.subscribe()`** — returns AsyncIterable, ReadableStream, or EventEmitter? Adapt `processEventStream()` accordingly.
2. **`permission.updated` metadata** — verify which fields appear in `metadata` for file permissions vs questions. The current code assumes `metadata.operation`, `metadata.filePath`, `metadata.question`, etc.
3. **`client.postSessionIdPermissionsPermissionId()`** — verify the exact parameter shape. May be `client.session.permissions()` or similar.
4. **`client.instance.dispose()`** — verify this endpoint exists for graceful shutdown.
5. **`client.session.promptAsync()`** — verify parameter shape for `parts` and `model`.

### System prompt changes

The system prompt no longer references `request_file_permission` MCP tool. Permissions are handled automatically by the opencode framework when the agent uses file tools. The `complete-task` MCP server is kept for now as a structured completion signal — evaluate whether `session.idle` can replace it.

### Renderer unchanged

Zero renderer files are modified. All IPC channel names and data shapes (`TaskMessage`, `PermissionRequest`, `TaskResult`, `TodoItem`) remain identical. The preload layer is unchanged.
