/**
 * Thought Stream Handler
 *
 * Reusable logic for tracking active tasks and validating thought/checkpoint events
 * from MCP tools (report-thought, report-checkpoint). The Electron-specific HTTP server
 * and IPC forwarding remain in the desktop app.
 */

import type { ThoughtEvent, CheckpointEvent } from '../../common/types/thought-stream.js';

/**
 * Handler for thought stream events from MCP tools.
 * Tracks active tasks and validates incoming events.
 */
export class ThoughtStreamHandler {
  private activeTaskIds = new Set<string>();

  /**
   * Register a task ID as active (called when task starts)
   */
  registerTask(taskId: string): void {
    this.activeTaskIds.add(taskId);
  }

  /**
   * Unregister a task ID (called when task completes)
   */
  unregisterTask(taskId: string): void {
    this.activeTaskIds.delete(taskId);
  }

  /**
   * Check if a task ID is currently active
   */
  isTaskActive(taskId: string): boolean {
    return this.activeTaskIds.has(taskId);
  }

  /**
   * Get all active task IDs
   */
  getActiveTaskIds(): string[] {
    return Array.from(this.activeTaskIds);
  }

  /**
   * Clear all active tasks
   */
  clearAllTasks(): void {
    this.activeTaskIds.clear();
  }

  /**
   * Validate and parse a thought event from raw data.
   * Returns null if the data is invalid or the task is not active.
   */
  validateThoughtEvent(data: unknown): ThoughtEvent | null {
    if (!this.isValidThoughtData(data)) {
      return null;
    }

    const typed = data as ThoughtEvent;

    // Check if task is active
    if (!this.isTaskActive(typed.taskId)) {
      return null;
    }

    return typed;
  }

  /**
   * Validate and parse a checkpoint event from raw data.
   * Returns null if the data is invalid or the task is not active.
   */
  validateCheckpointEvent(data: unknown): CheckpointEvent | null {
    if (!this.isValidCheckpointData(data)) {
      return null;
    }

    const typed = data as CheckpointEvent;

    // Check if task is active
    if (!this.isTaskActive(typed.taskId)) {
      return null;
    }

    return typed;
  }

  /**
   * Type guard to check if data matches ThoughtEvent structure
   */
  private isValidThoughtData(data: unknown): data is ThoughtEvent {
    if (typeof data !== 'object' || data === null) {
      return false;
    }

    const obj = data as Record<string, unknown>;

    return (
      typeof obj.taskId === 'string' &&
      typeof obj.content === 'string' &&
      typeof obj.category === 'string' &&
      ['observation', 'reasoning', 'decision', 'action'].includes(obj.category) &&
      typeof obj.agentName === 'string' &&
      typeof obj.timestamp === 'number'
    );
  }

  /**
   * Type guard to check if data matches CheckpointEvent structure
   */
  private isValidCheckpointData(data: unknown): data is CheckpointEvent {
    if (typeof data !== 'object' || data === null) {
      return false;
    }

    const obj = data as Record<string, unknown>;

    return (
      typeof obj.taskId === 'string' &&
      typeof obj.status === 'string' &&
      ['progress', 'complete', 'stuck'].includes(obj.status) &&
      typeof obj.summary === 'string' &&
      typeof obj.agentName === 'string' &&
      typeof obj.timestamp === 'number' &&
      (obj.nextPlanned === undefined || typeof obj.nextPlanned === 'string') &&
      (obj.blocker === undefined || typeof obj.blocker === 'string')
    );
  }
}
