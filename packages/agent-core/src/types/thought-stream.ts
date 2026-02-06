/**
 * Public API interface for ThoughtStreamHandler
 * Handles validation and tracking of thought stream events from MCP tools.
 */

/** Category of a thought event */
export type ThoughtCategory = 'observation' | 'reasoning' | 'decision' | 'action';

/** Status of a checkpoint event */
export type CheckpointStatus = 'progress' | 'complete' | 'stuck';

/** A thought event from an agent */
export interface ThoughtEvent {
  /** ID of the task this thought belongs to */
  taskId: string;
  /** Content of the thought */
  content: string;
  /** Category of the thought */
  category: ThoughtCategory;
  /** Name of the agent that produced this thought */
  agentName: string;
  /** Timestamp when the thought was created */
  timestamp: number;
}

/** A checkpoint event indicating progress */
export interface CheckpointEvent {
  /** ID of the task this checkpoint belongs to */
  taskId: string;
  /** Current status */
  status: CheckpointStatus;
  /** Summary of current state */
  summary: string;
  /** Next planned action (if status is 'progress') */
  nextPlanned?: string;
  /** Blocker description (if status is 'stuck') */
  blocker?: string;
  /** Name of the agent that produced this checkpoint */
  agentName: string;
  /** Timestamp when the checkpoint was created */
  timestamp: number;
}

/** Options for creating a ThoughtStreamHandler instance */
export interface ThoughtStreamOptions {
  // Currently no options needed, but interface provided for future extensibility
}

/** Public API for thought stream handling operations */
export interface ThoughtStreamAPI {
  /**
   * Register a task for thought stream tracking
   * @param taskId - ID of the task to register
   */
  registerTask(taskId: string): void;

  /**
   * Unregister a task from thought stream tracking
   * @param taskId - ID of the task to unregister
   */
  unregisterTask(taskId: string): void;

  /**
   * Check if a task is currently active for thought streaming
   * @param taskId - ID of the task to check
   */
  isTaskActive(taskId: string): boolean;

  /**
   * Get all currently active task IDs
   */
  getActiveTaskIds(): string[];

  /**
   * Clear all active tasks
   */
  clearAllTasks(): void;

  /**
   * Validate and parse a thought event from raw data
   * @param data - Raw event data to validate
   * @returns Validated ThoughtEvent or null if invalid
   */
  validateThoughtEvent(data: unknown): ThoughtEvent | null;

  /**
   * Validate and parse a checkpoint event from raw data
   * @param data - Raw event data to validate
   * @returns Validated CheckpointEvent or null if invalid
   */
  validateCheckpointEvent(data: unknown): CheckpointEvent | null;
}
