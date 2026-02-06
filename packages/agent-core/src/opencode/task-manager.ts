// Re-export from internal implementation to avoid code duplication
export {
  TaskManager,
  createTaskManager,
} from '../internal/classes/TaskManager.js';

export type {
  TaskProgressEvent,
  TaskCallbacks,
  TaskManagerOptions,
} from '../internal/classes/TaskManager.js';
