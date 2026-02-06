// Re-export from internal implementation to avoid code duplication
export {
  OpenCodeAdapter,
  OpenCodeCliNotFoundError,
  createAdapter,
} from '../internal/classes/OpenCodeAdapter.js';

export type {
  AdapterOptions,
  OpenCodeAdapterEvents,
} from '../internal/classes/OpenCodeAdapter.js';
