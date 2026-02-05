/**
 * Internal types - NEVER export these from common.ts
 *
 * These types are for main process implementation only.
 * External consumers should only receive public DTOs.
 */

export type {
  TaskInternal,
  TaskCallbacksInternal,
  TaskProgressInternal,
  ManagedTaskInternal,
  QueuedTaskInternal,
} from './task-internal.js';
