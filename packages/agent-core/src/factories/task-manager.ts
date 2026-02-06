import { TaskManager } from '../internal/classes/TaskManager.js';
import type { TaskManagerOptions, TaskManagerAPI } from '../types/task-manager.js';

export function createTaskManager(options: TaskManagerOptions): TaskManagerAPI {
  return new TaskManager(options);
}
