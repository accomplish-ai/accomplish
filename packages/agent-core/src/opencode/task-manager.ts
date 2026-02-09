import { OpenCodeAdapter, AdapterOptions, OpenCodeCliNotFoundError } from './adapter.js';
import type { TaskConfig, Task, TaskResult, TaskStatus } from '../common/types/task.js';
import type { OpenCodeMessage } from '../common/types/opencode.js';
import type { PermissionRequest } from '../common/types/permission.js';
import type { TodoItem } from '../common/types/todo.js';

export interface TaskProgressEvent {
  stage: string;
  message?: string;
  isFirstTask?: boolean;
  modelName?: string;
}

export interface TaskCallbacks {
  onMessage: (message: OpenCodeMessage) => void;
  onProgress: (progress: TaskProgressEvent) => void;
  onPermissionRequest: (request: PermissionRequest) => void;
  onComplete: (result: TaskResult) => void;
  onError: (error: Error) => void;
  onStatusChange?: (status: TaskStatus) => void;
  onDebug?: (log: { type: string; message: string; data?: unknown }) => void;
  onTodoUpdate?: (todos: TodoItem[]) => void;
  onAuthError?: (error: { providerId: string; message: string }) => void;
}

export interface TaskManagerOptions {
  adapterOptions: Omit<AdapterOptions, 'buildCliArgs'> & {
    buildCliArgs: (config: TaskConfig, taskId: string) => Promise<string[]>;
  };
  defaultWorkingDirectory: string;
  maxConcurrentTasks?: number;
  isCliAvailable: () => Promise<boolean>;
  onBeforeTaskStart?: (callbacks: TaskCallbacks, isFirstTask: boolean) => Promise<void>;
}

interface ManagedTask {
  taskId: string;
  adapter: OpenCodeAdapter;
  callbacks: TaskCallbacks;
  cleanup: () => void;
  createdAt: Date;
}

interface QueuedTask {
  taskId: string;
  config: TaskConfig;
  callbacks: TaskCallbacks;
  createdAt: Date;
}

const DEFAULT_MAX_CONCURRENT_TASKS = 10;

export class TaskManager {
  private activeTasks: Map<string, ManagedTask> = new Map();
  private taskQueue: QueuedTask[] = [];
  private maxConcurrentTasks: number;
  private options: TaskManagerOptions;
  private isFirstTask: boolean = true;

  constructor(options: TaskManagerOptions) {
    this.options = options;
    this.maxConcurrentTasks = options.maxConcurrentTasks ?? DEFAULT_MAX_CONCURRENT_TASKS;
  }

  getIsFirstTask(): boolean {
    return this.isFirstTask;
  }

  async startTask(
    taskId: string,
    config: TaskConfig,
    callbacks: TaskCallbacks
  ): Promise<Task> {
    const cliInstalled = await this.options.isCliAvailable();
    if (!cliInstalled) {
      throw new OpenCodeCliNotFoundError();
    }

    if (this.activeTasks.has(taskId) || this.taskQueue.some(q => q.taskId === taskId)) {
      throw new Error(`Task ${taskId} is already running or queued`);
    }

    if (this.activeTasks.size >= this.maxConcurrentTasks) {
      console.log(`[TaskManager] At max concurrent tasks (${this.maxConcurrentTasks}). Queueing task ${taskId}`);
      return this.queueTask(taskId, config, callbacks);
    }

    return this.executeTask(taskId, config, callbacks);
  }

  private queueTask(
    taskId: string,
    config: TaskConfig,
    callbacks: TaskCallbacks
  ): Task {
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

    return {
      id: taskId,
      prompt: config.prompt,
      status: 'queued',
      messages: [],
      createdAt: new Date().toISOString(),
    };
  }

  private async executeTask(
    taskId: string,
    config: TaskConfig,
    callbacks: TaskCallbacks
  ): Promise<Task> {
    const adapterOptions: AdapterOptions = {
      ...this.options.adapterOptions,
      buildCliArgs: (taskConfig) => this.options.adapterOptions.buildCliArgs(taskConfig, taskId),
    };

    const adapter = new OpenCodeAdapter(adapterOptions, taskId);

    const onMessage = (message: OpenCodeMessage) => {
      callbacks.onMessage(message);
    };

    const onProgress = (progress: { stage: string; message?: string; modelName?: string }) => {
      callbacks.onProgress(progress);
    };

    const onPermissionRequest = (request: PermissionRequest) => {
      callbacks.onPermissionRequest(request);
    };

    const onComplete = (result: TaskResult) => {
      callbacks.onComplete(result);
      this.cleanupTask(taskId);
      this.processQueue();
    };

    const onError = (error: Error) => {
      callbacks.onError(error);
      this.cleanupTask(taskId);
      this.processQueue();
    };

    const onDebug = (log: { type: string; message: string; data?: unknown }) => {
      callbacks.onDebug?.(log);
    };

    const onTodoUpdate = (todos: TodoItem[]) => {
      callbacks.onTodoUpdate?.(todos);
    };

    const onAuthError = (error: { providerId: string; message: string }) => {
      callbacks.onAuthError?.(error);
    };

    adapter.on('message', onMessage);
    adapter.on('progress', onProgress);
    adapter.on('permission-request', onPermissionRequest);
    adapter.on('complete', onComplete);
    adapter.on('error', onError);
    adapter.on('debug', onDebug);
    adapter.on('todo:update', onTodoUpdate);
    adapter.on('auth-error', onAuthError);

    const cleanup = () => {
      adapter.off('message', onMessage);
      adapter.off('progress', onProgress);
      adapter.off('permission-request', onPermissionRequest);
      adapter.off('complete', onComplete);
      adapter.off('error', onError);
      adapter.off('debug', onDebug);
      adapter.off('todo:update', onTodoUpdate);
      adapter.off('auth-error', onAuthError);
      adapter.dispose();
    };

    const managedTask: ManagedTask = {
      taskId,
      adapter,
      callbacks,
      cleanup,
      createdAt: new Date(),
    };
    this.activeTasks.set(taskId, managedTask);

    console.log(`[TaskManager] Executing task ${taskId}. Active tasks: ${this.activeTasks.size}`);

    const task: Task = {
      id: taskId,
      prompt: config.prompt,
      status: 'running',
      messages: [],
      createdAt: new Date().toISOString(),
    };

    const isFirstTask = this.isFirstTask;
    (async () => {
      try {
        callbacks.onProgress({ stage: 'starting', message: 'Starting task...', isFirstTask });

        if (this.options.onBeforeTaskStart) {
          await this.options.onBeforeTaskStart(callbacks, isFirstTask);
        }

        if (this.isFirstTask) {
          this.isFirstTask = false;
        }

        callbacks.onProgress({ stage: 'environment', message: 'Setting up environment...', isFirstTask });

        await adapter.startTask({
          ...config,
          taskId,
          workingDirectory: config.workingDirectory || this.options.defaultWorkingDirectory,
        });
      } catch (error) {
        callbacks.onError(error instanceof Error ? error : new Error(String(error)));
        this.cleanupTask(taskId);
        this.processQueue();
      }
    })();

    return task;
  }

  private async processQueue(): Promise<void> {
    while (this.taskQueue.length > 0 && this.activeTasks.size < this.maxConcurrentTasks) {
      const nextTask = this.taskQueue.shift()!;
      console.log(`[TaskManager] Processing queue. Starting task ${nextTask.taskId}. Active: ${this.activeTasks.size}, Remaining in queue: ${this.taskQueue.length}`);

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

  async cancelTask(taskId: string): Promise<void> {
    const queueIndex = this.taskQueue.findIndex(q => q.taskId === taskId);
    if (queueIndex !== -1) {
      console.log(`[TaskManager] Cancelling queued task ${taskId}`);
      this.taskQueue.splice(queueIndex, 1);
      return;
    }

    const managedTask = this.activeTasks.get(taskId);
    if (!managedTask) {
      console.warn(`[TaskManager] Task ${taskId} not found for cancellation`);
      return;
    }

    console.log(`[TaskManager] Cancelling running task ${taskId}`);

    try {
      await managedTask.adapter.cancelTask();
    } finally {
      this.cleanupTask(taskId);
      this.processQueue();
    }
  }

  async interruptTask(taskId: string): Promise<void> {
    const managedTask = this.activeTasks.get(taskId);
    if (!managedTask) {
      console.warn(`[TaskManager] Task ${taskId} not found for interruption`);
      return;
    }

    console.log(`[TaskManager] Interrupting task ${taskId}`);
    await managedTask.adapter.interruptTask();
  }

  cancelQueuedTask(taskId: string): boolean {
    const queueIndex = this.taskQueue.findIndex(q => q.taskId === taskId);
    if (queueIndex === -1) {
      return false;
    }

    console.log(`[TaskManager] Removing task ${taskId} from queue`);
    this.taskQueue.splice(queueIndex, 1);
    return true;
  }

  async sendResponse(taskId: string, response: string): Promise<void> {
    const managedTask = this.activeTasks.get(taskId);
    if (!managedTask) {
      throw new Error(`Task ${taskId} not found or not active`);
    }

    await managedTask.adapter.sendResponse(response);
  }

  getSessionId(taskId: string): string | null {
    const managedTask = this.activeTasks.get(taskId);
    return managedTask?.adapter.getSessionId() ?? null;
  }

  isTaskRunning(taskId: string): boolean {
    const managedTask = this.activeTasks.get(taskId);
    return managedTask?.adapter.running ?? false;
  }

  getTask(taskId: string): OpenCodeAdapter | undefined {
    return this.activeTasks.get(taskId)?.adapter;
  }

  hasActiveTask(taskId: string): boolean {
    return this.activeTasks.has(taskId);
  }

  hasRunningTask(): boolean {
    return this.activeTasks.size > 0;
  }

  isTaskQueued(taskId: string): boolean {
    return this.taskQueue.some(q => q.taskId === taskId);
  }

  getQueueLength(): number {
    return this.taskQueue.length;
  }

  get runningTaskCount(): number {
    return this.activeTasks.size;
  }

  getActiveTaskIds(): string[] {
    return Array.from(this.activeTasks.keys());
  }

  getActiveTaskId(): string | null {
    const firstActive = this.activeTasks.keys().next();
    return firstActive.done ? null : firstActive.value;
  }

  getActiveTaskCount(): number {
    return this.activeTasks.size;
  }

  cancelAllTasks(): void {
    console.log(`[TaskManager] Cancelling all ${this.activeTasks.size} active tasks`);

    this.taskQueue = [];

    for (const [taskId] of this.activeTasks) {
      this.cancelTask(taskId).catch(err => {
        console.error(`[TaskManager] Error cancelling task ${taskId}:`, err);
      });
    }
  }

  private cleanupTask(taskId: string): void {
    const managedTask = this.activeTasks.get(taskId);
    if (managedTask) {
      console.log(`[TaskManager] Cleaning up task ${taskId}`);
      managedTask.cleanup();
      this.activeTasks.delete(taskId);
      console.log(`[TaskManager] Task ${taskId} cleaned up. Active tasks: ${this.activeTasks.size}`);
    }
  }

  dispose(): void {
    console.log(`[TaskManager] Disposing all tasks (${this.activeTasks.size} active, ${this.taskQueue.length} queued)`);

    this.taskQueue = [];

    for (const [taskId, managedTask] of this.activeTasks) {
      try {
        managedTask.cleanup();
      } catch (error) {
        console.error(`[TaskManager] Error cleaning up task ${taskId}:`, error);
      }
    }

    this.activeTasks.clear();
    console.log('[TaskManager] All tasks disposed');
  }
}

export function createTaskManager(options: TaskManagerOptions): TaskManager {
  return new TaskManager(options);
}
