/**
 * Public API interface for TaskManager
 * This interface defines the contract for task management operations.
 * Consumers should use the createTaskManager factory function to get an instance.
 */

// Import DTOs from common types
import type { Task, TaskConfig, TaskStatus, TaskMessage, TaskResult } from '../common/types/task';
import type { PermissionRequest } from '../common/types/permission';
import type { TodoItem } from '../common/types/todo';
import type { OpenCodeMessage } from '../common/types/opencode';

/** Progress event emitted during task execution */
export interface TaskProgressEvent {
  stage: string;
  message?: string;
  isFirstTask?: boolean;
  modelName?: string;
}

/** Callbacks for task lifecycle events */
export interface TaskCallbacks {
  /** Called when a message is received from the agent */
  onMessage: (message: OpenCodeMessage) => void;
  /** Called when task progress changes */
  onProgress: (progress: TaskProgressEvent) => void;
  /** Called when a permission request is needed */
  onPermissionRequest: (request: PermissionRequest) => void;
  /** Called when the task completes successfully or with error */
  onComplete: (result: TaskResult) => void;
  /** Called when an error occurs during task execution */
  onError: (error: Error) => void;
  /** Called when task status changes */
  onStatusChange?: (status: TaskStatus) => void;
  /** Called for debug logging */
  onDebug?: (log: { type: string; message: string; data?: unknown }) => void;
  /** Called when todos are updated */
  onTodoUpdate?: (todos: TodoItem[]) => void;
  /** Called when an auth error occurs */
  onAuthError?: (error: { providerId: string; message: string }) => void;
}

/** Adapter options for the underlying CLI adapter */
export interface TaskAdapterOptions {
  /** The platform (e.g., 'darwin', 'linux', 'win32') */
  platform: NodeJS.Platform;
  /** Whether the app is packaged (vs development) */
  isPackaged: boolean;
  /** Path to temporary directory */
  tempPath: string;
  /** Function to get the CLI command and arguments */
  getCliCommand: () => { command: string; args: string[] };
  /** Function to build environment variables for a task */
  buildEnvironment: (taskId: string) => Promise<NodeJS.ProcessEnv>;
  /** Function to build CLI arguments for a task */
  buildCliArgs: (config: TaskConfig, taskId: string) => Promise<string[]>;
  /** Called before the CLI starts */
  onBeforeStart?: () => Promise<void>;
  /** Function to get display name for a model ID */
  getModelDisplayName?: (modelId: string) => string;
}

/** Options for creating a TaskManager instance */
export interface TaskManagerOptions {
  /** Adapter options for CLI interaction */
  adapterOptions: TaskAdapterOptions;
  /** Default working directory for tasks */
  defaultWorkingDirectory: string;
  /** Maximum number of concurrent tasks (default: 10) */
  maxConcurrentTasks?: number;
  /** Function to check if CLI is available */
  isCliAvailable: () => Promise<boolean>;
  /** Called before a task starts */
  onBeforeTaskStart?: (callbacks: TaskCallbacks, isFirstTask: boolean) => Promise<void>;
}

/** Public API for task management operations */
export interface TaskManagerAPI {
  /**
   * Start a new task with the given configuration
   * @param taskId - Unique identifier for the task
   * @param config - Task configuration
   * @param callbacks - Event callbacks for task lifecycle
   * @returns Promise resolving to the created task
   */
  startTask(taskId: string, config: TaskConfig, callbacks: TaskCallbacks): Promise<Task>;

  /**
   * Cancel a running task
   * @param taskId - ID of the task to cancel
   */
  cancelTask(taskId: string): Promise<void>;

  /**
   * Interrupt a running task (softer than cancel)
   * @param taskId - ID of the task to interrupt
   */
  interruptTask(taskId: string): Promise<void>;

  /**
   * Cancel a task that is queued but not yet running
   * @param taskId - ID of the queued task
   * @returns true if task was found and cancelled
   */
  cancelQueuedTask(taskId: string): boolean;

  /**
   * Send a response to a waiting task (e.g., permission response)
   * @param taskId - ID of the task
   * @param response - Response to send
   */
  sendResponse(taskId: string, response: string): Promise<void>;

  /**
   * Get the session ID for a task
   * @param taskId - ID of the task
   * @returns Session ID or null if not found
   */
  getSessionId(taskId: string): string | null;

  /**
   * Check if a specific task is currently running
   * @param taskId - ID of the task
   */
  isTaskRunning(taskId: string): boolean;

  /**
   * Check if a task is active (running or queued)
   * @param taskId - ID of the task
   */
  hasActiveTask(taskId: string): boolean;

  /**
   * Check if any task is currently running
   */
  hasRunningTask(): boolean;

  /**
   * Check if a task is in the queue
   * @param taskId - ID of the task
   */
  isTaskQueued(taskId: string): boolean;

  /**
   * Get the number of tasks in the queue
   */
  getQueueLength(): number;

  /**
   * Get IDs of all active tasks
   */
  getActiveTaskIds(): string[];

  /**
   * Get the ID of the currently active task
   * @returns Task ID or null if no active task
   */
  getActiveTaskId(): string | null;

  /**
   * Get the count of active tasks
   */
  getActiveTaskCount(): number;

  /**
   * Check if this is the first task
   */
  getIsFirstTask(): boolean;

  /**
   * Cancel all running and queued tasks
   */
  cancelAllTasks(): void;

  /**
   * Dispose of resources and cleanup
   */
  dispose(): void;
}
