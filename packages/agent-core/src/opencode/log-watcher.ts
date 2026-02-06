// Re-export from internal implementation to avoid code duplication
export {
  OpenCodeLogWatcher,
  createLogWatcher,
} from '../internal/classes/OpenCodeLogWatcher.js';

export type {
  OpenCodeLogError,
  LogWatcherEvents,
} from '../internal/classes/OpenCodeLogWatcher.js';
