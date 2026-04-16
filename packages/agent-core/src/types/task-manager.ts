/**
 * Public API interface for TaskManager
 * This interface defines the contract for task management operations.
 * Consumers should use the createTaskManager factory function to get an instance.
 */

// Import DTOs from common types
import type { Task, TaskConfig, TaskStatus, TaskMessage, TaskResult } from '../common/types/task';
import type { PermissionRequest, PermissionResponse } from '../common/types/permission';
import type { TodoItem } from '../common/types/todo';
import type { OpenCodeMessage } from '../common/types/opencode';
import type { SandboxConfig, SandboxProvider } from '../common/types/sandbox.js';
import type { BrowserFramePayload } from '../common/types/browser-view.js';

/** Progress event emitted during task execution */
export interface TaskProgressEvent {
  stage: string;
  message?: string;
  isFirstTask?: boolean;
  modelName?: string;
}

/**
 * Per-task context passed to the adapter's `onBeforeStart` hook.
 *
 * The daemon uses this to:
 *   - write per-task config filenames (`opencode-<taskId>.json`) so concurrent
 *     tasks don't race on the same file
 *   - thread `workspaceId` into `resolveTaskConfig` for knowledge-note injection
 */
export interface OnBeforeStartContext {
  taskId?: string;
  workspaceId?: string;
}

/** Callbacks for task lifecycle events */
export interface TaskCallbacks {
  /**
   * Called when a raw message is received from the agent.
   * Optional when onBatchedMessages is provided.
   */
  onMessage?: (message: OpenCodeMessage) => void;
  /**
   * Called with processed and batched messages ready for display.
   * Messages are converted from raw OpenCodeMessage to TaskMessage internally
   * and batched at 50ms intervals for efficient rendering.
   * When provided, message conversion and batching are handled by TaskManager.
   */
  onBatchedMessages?: (messages: TaskMessage[]) => void;
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
  /** Called when a browser frame is captured for live preview (ENG-695).
   *  Contributed by samarthsinh2660 (PR #414). */
  onBrowserFrame?: (data: BrowserFramePayload) => void;
  /** Called when the agent emits reasoning text */
  onReasoning?: (text: string) => void;
  /** Called when a tool is about to be used (before execution) */
  onToolUse?: (toolName: string, toolInput: unknown) => void;
  /** Called when a tool call completes (success or error) */
  onToolCallComplete?: (data: {
    toolName: string;
    toolInput: unknown;
    toolOutput: string;
    sessionId?: string;
  }) => void;
  /** Called when a model step finishes */
  onStepFinish?: (data: {
    reason: string;
    model?: string;
    tokens?: {
      input: number;
      output: number;
      reasoning: number;
      cache?: { read: number; write: number };
    };
    cost?: number;
  }) => void;
}

/**
 * Adapter options for the underlying OpenCode runtime adapter.
 *
 * Phase 4b of the OpenCode SDK cutover port removed the PTY-era
 * `getCliCommand`, `buildEnvironment`, and `buildCliArgs` fields. The SDK
 * adapter no longer spawns an `opencode` CLI per task — `OpenCodeServerManager`
 * runs `opencode serve` and the SDK talks HTTP. The per-task spawn
 * environment lives inside the server-manager; the only remaining
 * pre-task hook is `onBeforeStart`, which the daemon uses to write the
 * per-task `opencode.json` and sync API keys to `auth.json`.
 */
export interface TaskAdapterOptions {
  /** The platform (e.g., 'darwin', 'linux', 'win32') */
  platform: NodeJS.Platform;
  /** Whether the app is packaged (vs development) */
  isPackaged: boolean;
  /** Path to temporary directory */
  tempPath: string;
  /**
   * Optional pre-task hook. Returns environment variables to merge into the
   * adapter's externalEnv before opening the SDK session — the daemon uses
   * this to surface `OPENCODE_CONFIG[_DIR]` after writing the per-task
   * config file.
   *
   * The `ctx` argument gives the hook access to the current task's identity
   * and workspace so the per-task config filename can include the taskId
   * and `resolveTaskConfig` can inject workspace-scoped knowledge notes.
   * Both fields are optional — callers that don't have a task context yet
   * (legacy PTY paths, transient OAuth clients) pass an empty object.
   */
  onBeforeStart?: (ctx: OnBeforeStartContext) => Promise<NodeJS.ProcessEnv | void>;
  /** Function to get display name for a model ID */
  getModelDisplayName?: (modelId: string) => string;
  /**
   * Resolve the OpenCode server URL for a task runtime.
   *
   * Populated by the daemon-side server-manager (Phase 2 of the SDK cutover port).
   * Consumed by the SDK-based adapter (Phase 1b) when connecting its `createOpencodeClient`.
   * Optional during Phase 1a — the legacy PTY adapter ignores it; the SDK adapter requires it.
   *
   * @param taskId - ID of the task whose runtime server URL is needed
   * @param ctx - optional per-task context; the daemon threads `workspaceId`
   *              into its `server-manager` → `onBeforeStart` call so the
   *              opencode-serve process sees the right per-task config.
   * @returns Base URL of the opencode-serve instance hosting this task, or `undefined`
   *          if no runtime exists for that task.
   */
  getServerUrl?: (taskId: string, ctx?: OnBeforeStartContext) => Promise<string | undefined>;
  /**
   * Optional proxy tagger (Phase 2 of the SDK cutover port). Called by the
   * adapter on task start (with `taskId`) and teardown (with `undefined`).
   * Wired by the daemon when an optional runtime module is available.
   * Undefined in pure OSS builds.
   */
  setProxyTaskId?: (taskId: string | undefined) => void;
  /**
   * Lazy sandbox factory, called once per adapter/task instance.
   * Preferred over static sandboxProvider/sandboxConfig — ensures runtime
   * changes (e.g. via sandbox:set-config) are reflected without recreating
   * the TaskManager. Overrides sandboxProvider/sandboxConfig when present.
   */
  sandboxFactory?: () => { provider: SandboxProvider; config: SandboxConfig };
  /** Optional sandbox provider for restricting agent FS/network access */
  sandboxProvider?: SandboxProvider;
  /** Sandbox configuration used when sandboxProvider is set.
   * Must be accompanied by sandboxProvider when mode is not 'disabled'. */
  sandboxConfig?: SandboxConfig;
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
   * Send a permission / question response to a waiting task.
   *
   * Signature changed in Phase 2 of the SDK cutover port (commercial PR #720):
   * pre-port this was `(taskId, response: string)` — the PTY adapter wrote the
   * raw string to stdin. The SDK adapter needs the structured shape so it can
   * route to either `client.permission.reply` or `client.question.reply`.
   *
   * @param taskId   - ID of the task awaiting a reply
   * @param response - Structured response (requestId + decision + optional
   *                   `selectedOptions` / `customText` for question payloads)
   */
  sendResponse(taskId: string, response: PermissionResponse): Promise<void>;

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
