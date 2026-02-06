/**
 * Public API interface for ThoughtStreamHandler
 * Handles validation and tracking of thought stream events from MCP tools.
 */

// Re-export canonical thought stream types from common
export type { ThoughtCategory, CheckpointStatus, ThoughtEvent, CheckpointEvent } from '../common/types/thought-stream.js';
import type { ThoughtEvent, CheckpointEvent } from '../common/types/thought-stream.js';

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
