import type { TaskMessage } from '../common/types/task.js';
import { createLogger } from '../daemon/logger.js';

const logger = createLogger('MessageBatcher');

/**
 * Delay in milliseconds for batching messages before sending to renderer.
 */
export const MESSAGE_BATCH_DELAY_MS = 50;

/**
 * Interface for batching task messages.
 */
export interface MessageBatcher {
  pendingMessages: TaskMessage[];
  timeout: NodeJS.Timeout | null;
  taskId: string;
  flush: () => void;
}

/**
 * Map to store active message batchers by task ID.
 */
const messageBatchers = new Map<string, MessageBatcher>();

/**
 * Creates a new message batcher for a task.
 * The batcher accumulates messages and flushes them in batches.
 *
 * @param taskId - The task ID to create the batcher for
 * @param forwardToRenderer - Callback to send batched messages to the renderer
 * @param addTaskMessage - Callback to persist each message to storage
 */
export function createMessageBatcher(
  taskId: string,
  forwardToRenderer: (channel: string, data: unknown) => void,
  addTaskMessage: (taskId: string, message: TaskMessage) => void,
): MessageBatcher {
  const batcher: MessageBatcher = {
    pendingMessages: [],
    timeout: null,
    taskId,
    flush: () => {
      if (batcher.pendingMessages.length === 0) {
        if (batcher.timeout) {
          clearTimeout(batcher.timeout);
          batcher.timeout = null;
        }
        return;
      }

      const originalMessages = [...batcher.pendingMessages];
      const failures: TaskMessage[] = [];
      for (const msg of batcher.pendingMessages) {
        try {
          addTaskMessage(taskId, msg);
        } catch (err) {
          logger.error(`Error persisting message for task ${taskId}:`, err);
          failures.push(msg);
        }
      }

      batcher.pendingMessages = failures;

      const successfulMessages = originalMessages.filter((msg) => !failures.includes(msg));
      if (successfulMessages.length > 0) {
        try {
          forwardToRenderer('task:update:batch', {
            taskId,
            messages: successfulMessages,
          });
        } catch (err) {
          logger.error(`Error forwarding messages for task ${taskId}:`, err);
        }
      }

      if (batcher.pendingMessages.length > 0) {
        if (batcher.timeout) {
          clearTimeout(batcher.timeout);
        }
        batcher.timeout = setTimeout(() => {
          flushAndCleanupBatcher(taskId);
        }, MESSAGE_BATCH_DELAY_MS);
      } else if (batcher.timeout) {
        clearTimeout(batcher.timeout);
        batcher.timeout = null;
      }
    },
  };

  messageBatchers.set(taskId, batcher);
  return batcher;
}

/**
 * Queues a message for batched delivery to the renderer.
 * Creates a batcher if one doesn't exist for the task.
 *
 * @param taskId - The task ID to queue the message for
 * @param message - The message to queue
 * @param forwardToRenderer - Callback to send batched messages to the renderer
 * @param addTaskMessage - Callback to persist each message to storage
 */
export function queueMessage(
  taskId: string,
  message: TaskMessage,
  forwardToRenderer: (channel: string, data: unknown) => void,
  addTaskMessage: (taskId: string, message: TaskMessage) => void,
): void {
  let batcher = messageBatchers.get(taskId);
  if (!batcher) {
    batcher = createMessageBatcher(taskId, forwardToRenderer, addTaskMessage);
  }

  batcher.pendingMessages.push(message);

  if (batcher.timeout) {
    clearTimeout(batcher.timeout);
  }

  batcher.timeout = setTimeout(() => {
    flushAndCleanupBatcher(taskId);
  }, MESSAGE_BATCH_DELAY_MS);
}

/**
 * Flushes any pending messages and removes the batcher for a task.
 * Should be called when a task completes or is cancelled.
 *
 * @param taskId - The task ID to flush and cleanup
 */
export function flushAndCleanupBatcher(taskId: string): void {
  const batcher = messageBatchers.get(taskId);
  if (batcher) {
    batcher.flush();
    if (batcher.pendingMessages.length === 0) {
      messageBatchers.delete(taskId);
    }
  }
}
