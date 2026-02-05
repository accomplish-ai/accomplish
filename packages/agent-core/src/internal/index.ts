/**
 * Internal module - implementation details that should never be in common.ts
 *
 * This module contains:
 * - Internal types with runtime state (TaskInternal, etc.)
 * - Mappers to convert internal types to public DTOs
 *
 * IMPORTANT: These exports are for main process use only.
 * Never re-export these from common.ts.
 */

// Internal types
export type {
  TaskInternal,
  TaskCallbacksInternal,
  TaskProgressInternal,
  ManagedTaskInternal,
  QueuedTaskInternal,
} from './types/index.js';

// Mappers
export {
  toTaskDTO,
  toTaskDTOArray,
  toTaskProgressDTO,
  toTaskMessageDTO,
  hasInternalFields,
} from './mappers/index.js';
