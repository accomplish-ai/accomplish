import type { TaskStatus, TaskResult } from '../shared/types/task.js';

/**
 * Maps a TaskResult status to a TaskStatus.
 * Used when a task completes to determine the final task status.
 */
export function mapResultToStatus(result: TaskResult): TaskStatus {
  if (result.status === 'success') return 'completed';
  if (result.status === 'interrupted') return 'interrupted';
  return 'failed';
}
