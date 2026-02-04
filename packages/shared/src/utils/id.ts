/**
 * ID generation utilities for tasks and messages.
 *
 * These functions create unique identifiers with a prefix, timestamp, and random suffix.
 * The format is: `{prefix}_{timestamp}_{randomSuffix}`
 *
 * The timestamp ensures rough chronological ordering, while the random suffix
 * ensures uniqueness even for IDs created in the same millisecond.
 */

/**
 * Create a unique task ID.
 *
 * @returns A string in the format `task_{timestamp}_{randomSuffix}`
 *
 * @example
 * createTaskId() // => "task_1706886400000_a1b2c3d"
 */
export function createTaskId(): string {
  return `task_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Create a unique message ID.
 *
 * @returns A string in the format `msg_{timestamp}_{randomSuffix}`
 *
 * @example
 * createMessageId() // => "msg_1706886400000_x7y8z9e"
 */
export function createMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}
