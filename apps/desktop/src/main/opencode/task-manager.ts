/**
 * TaskManager - Manages multiple concurrent OpenCode task executions via SDK sessions
 *
 * This class manages tasks using the OpenCode SDK (via ServerManager) instead of
 * spawning PTY processes. Each task maps to an SDK session. Events are received
 * through the EventRouter's SSE stream and dispatched to per-task callbacks.
 */

import { getServerManager } from './server-manager';
import { getEventRouter, type TaskEventCallbacks } from './event-router';
import { getSkillsPath } from './config-generator';
import { getNpxPath, getBundledNodePaths } from '../utils/bundled-node';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import {
  DEV_BROWSER_PORT,
  type TaskConfig,
  type Task,
  type TaskResult,
  type TaskStatus,
  type PermissionRequest,
  type TodoItem,
  type TaskMessage,
} from '@accomplish/shared';

/**
 * Check if system Chrome is installed
 */
function isSystemChromeInstalled(): boolean {
  if (process.platform === 'darwin') {
    return fs.existsSync('/Applications/Google Chrome.app');
  } else if (process.platform === 'win32') {
    // Check common Windows Chrome locations
    const programFiles = process.env['PROGRAMFILES'] || 'C:\\Program Files';
    const programFilesX86 = process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)';
    return (
      fs.existsSync(path.join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe')) ||
      fs.existsSync(path.join(programFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe'))
    );
  }
  // Linux - check common paths
  return fs.existsSync('/usr/bin/google-chrome') || fs.existsSync('/usr/bin/chromium-browser');
}

/**
 * Check if Playwright Chromium is installed
 */
function isPlaywrightInstalled(): boolean {
  const homeDir = os.homedir();
  const possiblePaths = [
    path.join(homeDir, 'Library', 'Caches', 'ms-playwright'), // macOS
    path.join(homeDir, '.cache', 'ms-playwright'), // Linux
  ];

  if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
    possiblePaths.unshift(path.join(process.env.LOCALAPPDATA, 'ms-playwright'));
  }

  for (const playwrightDir of possiblePaths) {
    if (fs.existsSync(playwrightDir)) {
      try {
        const entries = fs.readdirSync(playwrightDir);
        if (entries.some((entry) => entry.startsWith('chromium'))) {
          return true;
        }
      } catch {
        continue;
      }
    }
  }
  return false;
}

/**
 * Install Playwright Chromium browser.
 * Returns a promise that resolves when installation is complete.
 * Uses bundled Node.js to ensure it works in packaged app.
 */
async function installPlaywrightChromium(
  onProgress?: (message: string) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const skillsPath = getSkillsPath();
    const devBrowserDir = path.join(skillsPath, 'dev-browser');

    // Use bundled npx for packaged app compatibility
    const npxPath = getNpxPath();
    const bundledPaths = getBundledNodePaths();

    console.log(`[TaskManager] Installing Playwright Chromium using bundled npx: ${npxPath}`);
    onProgress?.('Downloading browser...');

    // Build environment with bundled node in PATH
    let spawnEnv: NodeJS.ProcessEnv = { ...process.env };
    if (bundledPaths) {
      const delimiter = process.platform === 'win32' ? ';' : ':';
      spawnEnv.PATH = `${bundledPaths.binDir}${delimiter}${process.env.PATH || ''}`;
    }

    const child = spawn(npxPath, ['playwright', 'install', 'chromium'], {
      cwd: devBrowserDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: spawnEnv,
      shell: process.platform === 'win32',
    });

    child.stdout?.on('data', (data: Buffer) => {
      const line = data.toString().trim();
      if (line) {
        console.log(`[Playwright Install] ${line}`);
        // Send progress info: percentage updates and "Downloading X" messages
        if (line.includes('%') || line.toLowerCase().startsWith('downloading')) {
          onProgress?.(line);
        }
      }
    });

    child.stderr?.on('data', (data: Buffer) => {
      const line = data.toString().trim();
      if (line) {
        console.log(`[Playwright Install] ${line}`);
      }
    });

    child.on('close', (code) => {
      if (code === 0) {
        console.log('[TaskManager] Playwright Chromium installed successfully');
        onProgress?.('Browser installed successfully!');
        resolve();
      } else {
        reject(new Error(`Playwright install failed with code ${code}`));
      }
    });

    child.on('error', (err) => {
      reject(err);
    });
  });
}

// DEV_BROWSER_PORT imported from @accomplish/shared

/**
 * Check if the dev-browser server is running and ready
 */
async function isDevBrowserServerReady(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1000);
    const res = await fetch(`http://localhost:${DEV_BROWSER_PORT}`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Wait for the dev-browser server to be ready with polling
 */
async function waitForDevBrowserServer(maxWaitMs = 15000, pollIntervalMs = 500): Promise<boolean> {
  const startTime = Date.now();
  let attempts = 0;
  while (Date.now() - startTime < maxWaitMs) {
    attempts++;
    if (await isDevBrowserServerReady()) {
      console.log(`[TaskManager] Dev-browser server ready after ${attempts} attempts (${Date.now() - startTime}ms)`);
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
  }
  console.log(`[TaskManager] Dev-browser server not ready after ${attempts} attempts (${maxWaitMs}ms timeout)`);
  return false;
}

/**
 * Ensure the dev-browser server is running.
 * Called before starting tasks to pre-warm the browser.
 *
 * If neither system Chrome nor Playwright is installed, downloads Playwright first.
 */
async function ensureDevBrowserServer(
  onProgress?: (progress: { stage: string; message?: string }) => void
): Promise<void> {
  // Check if we have a browser available
  const hasChrome = isSystemChromeInstalled();
  const hasPlaywright = isPlaywrightInstalled();

  console.log(`[TaskManager] Browser check: Chrome=${hasChrome}, Playwright=${hasPlaywright}`);

  // If no browser available, install Playwright first
  if (!hasChrome && !hasPlaywright) {
    console.log('[TaskManager] No browser available, installing Playwright Chromium...');
    onProgress?.({
      stage: 'setup',
      message: 'Chrome not found. Downloading browser (one-time setup, ~2 min)...',
    });

    try {
      await installPlaywrightChromium((msg) => {
        onProgress?.({ stage: 'setup', message: msg });
      });
    } catch (error) {
      console.error('[TaskManager] Failed to install Playwright:', error);
      // Don't throw - let agent handle the failure
    }
  }

  // Check if server is already running (skip on macOS to avoid Local Network permission dialog)
  if (process.platform !== 'darwin') {
    if (await isDevBrowserServerReady()) {
      console.log('[TaskManager] Dev-browser server already running');
      return;
    }
  }

  // Now start the server
  try {
    const skillsPath = getSkillsPath();
    const serverScript = path.join(skillsPath, 'dev-browser', 'server.cjs');
    const serverCwd = path.join(skillsPath, 'dev-browser');

    // Build environment with bundled Node.js in PATH
    const bundledPaths = getBundledNodePaths();
    let spawnEnv: NodeJS.ProcessEnv = { ...process.env };
    if (bundledPaths) {
      const delimiter = process.platform === 'win32' ? ';' : ':';
      spawnEnv.PATH = `${bundledPaths.binDir}${delimiter}${process.env.PATH || ''}`;
      spawnEnv.NODE_BIN_PATH = bundledPaths.binDir;
    }

    // Get node executable path
    const nodeExe = bundledPaths?.nodePath || 'node';

    console.log('[TaskManager] ========== DEV-BROWSER SERVER STARTUP ==========');
    console.log('[TaskManager] Node executable:', nodeExe);
    console.log('[TaskManager] Server script:', serverScript);
    console.log('[TaskManager] Working directory:', serverCwd);
    console.log('[TaskManager] NODE_BIN_PATH:', spawnEnv.NODE_BIN_PATH || '(not set)');
    console.log('[TaskManager] Script exists:', fs.existsSync(serverScript));
    console.log('[TaskManager] CWD exists:', fs.existsSync(serverCwd));

    // Check if local tsx exists (for debugging)
    const localTsxBin = path.join(serverCwd, 'node_modules', '.bin', process.platform === 'win32' ? 'tsx.cmd' : 'tsx');
    console.log('[TaskManager] Local tsx.cmd exists:', fs.existsSync(localTsxBin));

    // Spawn server in background (detached, unref to not block)
    // windowsHide: true prevents a console window from appearing on Windows
    // Use 'pipe' for stdio to capture startup errors
    const child = spawn(nodeExe, [serverScript], {
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: serverCwd,
      env: spawnEnv,
      windowsHide: true,
    });

    // Store logs for debugging - these will be available in Electron DevTools console
    const serverLogs: string[] = [];

    // Capture and log stdout/stderr for debugging
    child.stdout?.on('data', (data: Buffer) => {
      const lines = data.toString().split('\n').filter(l => l.trim());
      for (const line of lines) {
        serverLogs.push(`[stdout] ${line}`);
        console.log('[DevBrowser stdout]', line);
      }
    });

    child.stderr?.on('data', (data: Buffer) => {
      const lines = data.toString().split('\n').filter(l => l.trim());
      for (const line of lines) {
        serverLogs.push(`[stderr] ${line}`);
        console.log('[DevBrowser stderr]', line);
      }
    });

    child.on('error', (err) => {
      const errorMsg = `Spawn error: ${err.message} (code: ${(err as NodeJS.ErrnoException).code})`;
      serverLogs.push(`[error] ${errorMsg}`);
      console.error('[TaskManager] Dev-browser spawn error:', err);
      // Store logs globally for debugging
      (global as Record<string, unknown>).__devBrowserLogs = serverLogs;
    });

    child.on('exit', (code, signal) => {
      const exitMsg = `Process exited with code ${code}, signal ${signal}`;
      serverLogs.push(`[exit] ${exitMsg}`);
      console.log('[TaskManager] Dev-browser', exitMsg);
      if (code !== 0 && code !== null) {
        console.error('[TaskManager] Dev-browser server failed. Logs:');
        for (const log of serverLogs) {
          console.error('[TaskManager]  ', log);
        }
      }
      // Store logs globally for debugging
      (global as Record<string, unknown>).__devBrowserLogs = serverLogs;
    });

    child.unref();

    console.log('[TaskManager] Dev-browser server spawn initiated (PID:', child.pid, ')');

    // Wait for the server to be ready (longer timeout on Windows)
    const maxWaitMs = process.platform === 'win32' ? 30000 : 15000;
    console.log(`[TaskManager] Waiting for dev-browser server to be ready (max ${maxWaitMs}ms)...`);

    const serverReady = await waitForDevBrowserServer(maxWaitMs);
    if (serverReady) {
      console.log('[TaskManager] Dev-browser server is ready!');
    } else {
      console.error('[TaskManager] Dev-browser server did NOT become ready within timeout');
      console.error('[TaskManager] Captured logs:');
      for (const log of serverLogs) {
        console.error('[TaskManager]  ', log);
      }
      // Store logs globally for debugging
      (global as Record<string, unknown>).__devBrowserLogs = serverLogs;
    }

    console.log('[TaskManager] ========== END DEV-BROWSER SERVER STARTUP ==========');
  } catch (error) {
    console.error('[TaskManager] Failed to start dev-browser server:', error);
  }
}

/**
 * Progress event with startup stage information
 */
export interface TaskProgressEvent {
  stage: string;
  message?: string;
  /** Whether this is the first task (cold start) - used for UI hints */
  isFirstTask?: boolean;
  /** Model display name for 'connecting' stage */
  modelName?: string;
}

/**
 * Callbacks for task events - scoped to a specific task
 */
export interface TaskCallbacks {
  onMessage: (message: TaskMessage) => void;
  onProgress: (progress: TaskProgressEvent) => void;
  onPermissionRequest: (request: PermissionRequest) => void;
  onComplete: (result: TaskResult) => void;
  onError: (error: Error) => void;
  onStatusChange?: (status: TaskStatus) => void;
  onDebug?: (log: { type: string; message: string; data?: unknown }) => void;
  onTodoUpdate?: (todos: TodoItem[]) => void;
}

/**
 * Internal representation of a managed task
 */
interface ManagedTask {
  taskId: string;
  sessionId: string;
  callbacks: TaskCallbacks;
  createdAt: Date;
}

/**
 * Queued task waiting for execution
 */
interface QueuedTask {
  taskId: string;
  config: TaskConfig;
  callbacks: TaskCallbacks;
  createdAt: Date;
}

/**
 * Default maximum number of concurrent tasks
 * Can be configured via constructor
 */
const DEFAULT_MAX_CONCURRENT_TASKS = 10;

/**
 * TaskManager manages OpenCode task executions via SDK sessions
 *
 * Multiple tasks can run concurrently up to maxConcurrentTasks.
 * Each task maps to an SDK session. Events arrive via EventRouter's SSE stream
 * and are dispatched to per-task callbacks.
 */
export class TaskManager {
  private activeTasks: Map<string, ManagedTask> = new Map();
  private taskQueue: QueuedTask[] = [];
  private maxConcurrentTasks: number;
  /** Tracks whether this is the first task since app launch (cold start) */
  private isFirstTask: boolean = true;
  /** Whether EventRouter callbacks have been wired up */
  private eventRouterInitialized: boolean = false;

  constructor(options?: { maxConcurrentTasks?: number }) {
    this.maxConcurrentTasks = options?.maxConcurrentTasks ?? DEFAULT_MAX_CONCURRENT_TASKS;
  }

  /**
   * Check if this is a cold start (first task since app launch)
   */
  getIsFirstTask(): boolean {
    return this.isFirstTask;
  }

  /**
   * Wire up the EventRouter callbacks so that SSE events arriving for any
   * registered session are forwarded to the correct task's callbacks.
   * This is called once, lazily, before the first task executes.
   */
  private initEventRouter(): void {
    if (this.eventRouterInitialized) return;
    this.eventRouterInitialized = true;

    const eventRouter = getEventRouter();
    const callbacks: TaskEventCallbacks = {
      onTaskMessage: (taskId: string, message: TaskMessage) => {
        const task = this.activeTasks.get(taskId);
        task?.callbacks.onMessage(message);
      },
      onTaskProgress: (taskId: string, progress: { stage: string; message?: string; toolName?: string; toolInput?: unknown }) => {
        const task = this.activeTasks.get(taskId);
        task?.callbacks.onProgress(progress);
      },
      onPermissionRequest: (taskId: string, request: PermissionRequest) => {
        const task = this.activeTasks.get(taskId);
        task?.callbacks.onPermissionRequest(request);
      },
      onTaskComplete: (taskId: string, result: TaskResult) => {
        const task = this.activeTasks.get(taskId);
        if (task) {
          task.callbacks.onComplete(result);
          this.cleanupTask(taskId);
          this.processQueue();
        }
      },
      onTaskError: (taskId: string, error: string) => {
        const task = this.activeTasks.get(taskId);
        if (task) {
          task.callbacks.onError(new Error(error));
          this.cleanupTask(taskId);
          this.processQueue();
        }
      },
      onTodoUpdate: (taskId: string, todos: TodoItem[]) => {
        const task = this.activeTasks.get(taskId);
        task?.callbacks.onTodoUpdate?.(todos);
      },
      onDebug: (taskId: string, log: { type: string; message: string; data?: unknown }) => {
        const task = this.activeTasks.get(taskId);
        task?.callbacks.onDebug?.(log);
      },
    };

    eventRouter.setCallbacks(callbacks);
  }

  /**
   * Start a new task. Multiple tasks can run in parallel up to maxConcurrentTasks.
   * If at capacity, new tasks are queued and start automatically when a task completes.
   */
  async startTask(
    taskId: string,
    config: TaskConfig,
    callbacks: TaskCallbacks
  ): Promise<Task> {
    // Check if task already exists (either running or queued)
    if (this.activeTasks.has(taskId) || this.taskQueue.some(q => q.taskId === taskId)) {
      throw new Error(`Task ${taskId} is already running or queued`);
    }

    // If at max concurrent tasks, queue this one
    if (this.activeTasks.size >= this.maxConcurrentTasks) {
      console.log(`[TaskManager] At max concurrent tasks (${this.maxConcurrentTasks}). Queueing task ${taskId}`);
      return this.queueTask(taskId, config, callbacks);
    }

    // Execute immediately (parallel execution)
    return this.executeTask(taskId, config, callbacks);
  }

  /**
   * Queue a task for later execution
   */
  private queueTask(
    taskId: string,
    config: TaskConfig,
    callbacks: TaskCallbacks
  ): Task {
    // Check queue limit (allow same number of queued tasks as max concurrent)
    if (this.taskQueue.length >= this.maxConcurrentTasks) {
      throw new Error(
        `Maximum queued tasks (${this.maxConcurrentTasks}) reached. Please wait for tasks to complete.`
      );
    }

    const queuedTask: QueuedTask = {
      taskId,
      config,
      callbacks,
      createdAt: new Date(),
    };

    this.taskQueue.push(queuedTask);
    console.log(`[TaskManager] Task ${taskId} queued. Queue length: ${this.taskQueue.length}`);

    // Return a task object with 'queued' status
    return {
      id: taskId,
      prompt: config.prompt,
      status: 'queued',
      messages: [],
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Execute a task immediately using the SDK session API (internal)
   */
  private async executeTask(
    taskId: string,
    config: TaskConfig,
    callbacks: TaskCallbacks
  ): Promise<Task> {
    // Ensure EventRouter callbacks are wired up
    this.initEventRouter();

    const serverManager = getServerManager();
    const client = serverManager.getClient();
    const eventRouter = getEventRouter();

    // Create or reuse an SDK session
    let sessionId: string;
    if (config.sessionId) {
      sessionId = config.sessionId;
    } else {
      const session = await client.session.create({});
      if (!session.data) {
        throw new Error('Failed to create SDK session: no data returned from server');
      }
      sessionId = session.data.id;
    }

    // Register with EventRouter so SSE events for this session are routed to this task
    eventRouter.registerSession(sessionId, taskId);

    // Register the managed task
    const managedTask: ManagedTask = {
      taskId,
      sessionId,
      callbacks,
      createdAt: new Date(),
    };
    this.activeTasks.set(taskId, managedTask);

    console.log(`[TaskManager] Executing task ${taskId} with session ${sessionId}. Active tasks: ${this.activeTasks.size}`);

    // Create task object immediately so UI can navigate
    const task: Task = {
      id: taskId,
      prompt: config.prompt,
      status: 'running',
      sessionId,
      messages: [],
      createdAt: new Date().toISOString(),
    };

    // Start browser setup and send prompt asynchronously
    // This allows the UI to navigate immediately while setup happens
    const isFirstTask = this.isFirstTask;
    (async () => {
      try {
        // Emit starting stage immediately
        callbacks.onProgress({ stage: 'starting', message: 'Starting task...', isFirstTask });

        // Emit browser stage only on cold start (first task)
        if (isFirstTask) {
          callbacks.onProgress({ stage: 'browser', message: 'Preparing browser...', isFirstTask });
        }

        // Ensure browser is available (may download Playwright if needed)
        await ensureDevBrowserServer(callbacks.onProgress);

        // Mark cold start as complete after browser setup
        if (this.isFirstTask) {
          this.isFirstTask = false;
        }

        // Emit environment setup stage
        callbacks.onProgress({ stage: 'environment', message: 'Setting up environment...', isFirstTask });

        // Send prompt via SDK (fire-and-forget; events come via SSE/EventRouter)
        await client.session.promptAsync({
          path: { id: sessionId },
          body: {
            parts: [{ type: 'text', text: config.prompt }],
          },
        });
      } catch (error) {
        // Cleanup on failure and process queue
        callbacks.onError(error instanceof Error ? error : new Error(String(error)));
        this.cleanupTask(taskId);
        this.processQueue();
      }
    })();

    return task;
  }

  /**
   * Process the queue - start queued tasks if we have capacity
   */
  private async processQueue(): Promise<void> {
    // Start queued tasks while we have capacity
    while (this.taskQueue.length > 0 && this.activeTasks.size < this.maxConcurrentTasks) {
      const nextTask = this.taskQueue.shift()!;
      console.log(`[TaskManager] Processing queue. Starting task ${nextTask.taskId}. Active: ${this.activeTasks.size}, Remaining in queue: ${this.taskQueue.length}`);

      // Notify that task is now running
      nextTask.callbacks.onStatusChange?.('running');

      try {
        await this.executeTask(nextTask.taskId, nextTask.config, nextTask.callbacks);
      } catch (error) {
        console.error(`[TaskManager] Error starting queued task ${nextTask.taskId}:`, error);
        nextTask.callbacks.onError(error instanceof Error ? error : new Error(String(error)));
      }
    }

    if (this.taskQueue.length === 0) {
      console.log('[TaskManager] Queue empty, no more tasks to process');
    }
  }

  /**
   * Cancel a specific task (running or queued)
   */
  async cancelTask(taskId: string): Promise<void> {
    // Check if it's a queued task
    const queueIndex = this.taskQueue.findIndex(q => q.taskId === taskId);
    if (queueIndex !== -1) {
      console.log(`[TaskManager] Cancelling queued task ${taskId}`);
      this.taskQueue.splice(queueIndex, 1);
      return;
    }

    // Otherwise, it's a running task
    const managedTask = this.activeTasks.get(taskId);
    if (!managedTask) {
      console.warn(`[TaskManager] Task ${taskId} not found for cancellation`);
      return;
    }

    console.log(`[TaskManager] Cancelling running task ${taskId}`);

    try {
      const client = getServerManager().getClient();
      await client.session.abort({ path: { id: managedTask.sessionId } });
    } catch (error) {
      console.error(`[TaskManager] Error aborting session for task ${taskId}:`, error);
    }

    // Fire onComplete so the renderer is notified of cancellation.
    // We do this explicitly rather than waiting for the EventRouter's abort event
    // because we're about to unregister the session immediately.
    managedTask.callbacks.onComplete({
      status: 'interrupted',
      sessionId: managedTask.sessionId,
    });

    this.cleanupTask(taskId);
    this.processQueue();
  }

  /**
   * Interrupt a running task (graceful abort via SDK)
   * Unlike cancel, this sends an abort signal but doesn't clean up the task --
   * the EventRouter will receive a session.error with MessageAbortedError which
   * triggers completion with 'interrupted' status.
   */
  async interruptTask(taskId: string): Promise<void> {
    const managedTask = this.activeTasks.get(taskId);
    if (!managedTask) {
      console.warn(`[TaskManager] Task ${taskId} not found for interruption`);
      return;
    }

    console.log(`[TaskManager] Interrupting task ${taskId}`);

    try {
      const client = getServerManager().getClient();
      await client.session.abort({ path: { id: managedTask.sessionId } });
    } catch (error) {
      console.error(`[TaskManager] Error aborting session for task ${taskId}:`, error);
    }
  }

  /**
   * Cancel a queued task and optionally revert to a previous status
   * Used for cancelling follow-ups on completed tasks
   */
  cancelQueuedTask(taskId: string): boolean {
    const queueIndex = this.taskQueue.findIndex(q => q.taskId === taskId);
    if (queueIndex === -1) {
      return false;
    }

    console.log(`[TaskManager] Removing task ${taskId} from queue`);
    this.taskQueue.splice(queueIndex, 1);
    return true;
  }

  /**
   * Check if there are any running tasks
   */
  hasRunningTask(): boolean {
    return this.activeTasks.size > 0;
  }

  /**
   * Check if a specific task is queued
   */
  isTaskQueued(taskId: string): boolean {
    return this.taskQueue.some(q => q.taskId === taskId);
  }

  /**
   * Get queue position (1-based) for a task, or 0 if not queued
   */
  getQueuePosition(taskId: string): number {
    const index = this.taskQueue.findIndex(q => q.taskId === taskId);
    return index === -1 ? 0 : index + 1;
  }

  /**
   * Get the current queue length
   */
  getQueueLength(): number {
    return this.taskQueue.length;
  }

  /**
   * Send a permission response via the SDK.
   *
   * @param taskId   - The task that owns the permission request
   * @param response - 'yes' / allow text maps to 'once', 'no' maps to 'reject'
   * @param permissionId - Optional permission ID. When provided, resolves
   *   the permission directly via the SDK. When omitted, the method is a no-op
   *   (permissions must be resolved through the SDK permission endpoint).
   */
  async sendResponse(taskId: string, response: string, permissionId?: string): Promise<void> {
    const managedTask = this.activeTasks.get(taskId);
    if (!managedTask) {
      throw new Error(`Task ${taskId} not found or not active`);
    }

    if (!permissionId) {
      console.warn(`[TaskManager] sendResponse called without permissionId for task ${taskId}. Cannot resolve permission via SDK.`);
      return;
    }

    const client = getServerManager().getClient();

    // The SDK permission response is binary: once/always/reject.
    // Map 'no' or 'deny' to 'reject', everything else to 'once'.
    // Note: The SDK does not support passing freeform text or selected options
    // back to the agent. The permission system is approve/reject only.
    const isDenial = response === 'no' || response === 'deny';
    const decision: 'once' | 'always' | 'reject' = isDenial ? 'reject' : 'once';

    if (!isDenial && response !== 'yes' && response.length > 3) {
      // Log that we're losing response content -- this happens when the user
      // selects specific options in a question dialog. The SDK doesn't support
      // passing this content back; the agent will only know it was approved.
      console.warn(`[TaskManager] Permission response content lost (SDK only supports once/reject): "${response.substring(0, 100)}"`);
    }

    await client.postSessionIdPermissionsPermissionId({
      path: {
        id: managedTask.sessionId,
        permissionID: permissionId,
      },
      body: {
        response: decision,
      },
    });
  }

  /**
   * Get the session ID for a specific task
   */
  getSessionId(taskId: string): string | null {
    const managedTask = this.activeTasks.get(taskId);
    return managedTask?.sessionId ?? null;
  }

  /**
   * Check if a task is active
   */
  hasActiveTask(taskId: string): boolean {
    return this.activeTasks.has(taskId);
  }

  /**
   * Get the number of active tasks
   */
  getActiveTaskCount(): number {
    return this.activeTasks.size;
  }

  /**
   * Get all active task IDs
   */
  getActiveTaskIds(): string[] {
    return Array.from(this.activeTasks.keys());
  }

  /**
   * Get the currently running task ID (not queued)
   * Returns the first active task if multiple are running
   */
  getActiveTaskId(): string | null {
    const firstActive = this.activeTasks.keys().next();
    return firstActive.done ? null : firstActive.value;
  }

  /**
   * Cleanup a specific task (internal)
   */
  private cleanupTask(taskId: string): void {
    const managedTask = this.activeTasks.get(taskId);
    if (managedTask) {
      console.log(`[TaskManager] Cleaning up task ${taskId}`);
      // Unregister from EventRouter so we stop receiving events for this session
      const eventRouter = getEventRouter();
      eventRouter.unregisterSession(taskId);
      this.activeTasks.delete(taskId);
      console.log(`[TaskManager] Task ${taskId} cleaned up. Active tasks: ${this.activeTasks.size}`);
    }
  }

  /**
   * Dispose all tasks and cleanup resources
   * Called on app quit
   */
  dispose(): void {
    console.log(`[TaskManager] Disposing all tasks (${this.activeTasks.size} active, ${this.taskQueue.length} queued)`);

    // Clear the queue
    this.taskQueue = [];

    const eventRouter = getEventRouter();
    for (const [taskId] of this.activeTasks) {
      try {
        eventRouter.unregisterSession(taskId);
      } catch (error) {
        console.error(`[TaskManager] Error cleaning up task ${taskId}:`, error);
      }
    }

    this.activeTasks.clear();
    console.log('[TaskManager] All tasks disposed');
  }
}

// Singleton TaskManager instance for the application
let taskManagerInstance: TaskManager | null = null;

/**
 * Get the global TaskManager instance
 */
export function getTaskManager(): TaskManager {
  if (!taskManagerInstance) {
    taskManagerInstance = new TaskManager();
  }
  return taskManagerInstance;
}

/**
 * Dispose the global TaskManager instance
 * Called on app quit
 */
export function disposeTaskManager(): void {
  if (taskManagerInstance) {
    taskManagerInstance.dispose();
    taskManagerInstance = null;
  }
}
