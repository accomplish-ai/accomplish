import type { OpenCodeMessage, OpenCodeToolUseMessage } from '../shared/types/opencode.js';
import type { TaskMessage } from '../shared/types/task.js';
import { createMessageId } from '../shared/index.js';

/**
 * Delay in milliseconds for batching messages before sending to renderer.
 */
export const MESSAGE_BATCH_DELAY_MS = 50;

/**
 * Attachment extracted from tool output.
 */
export interface MessageAttachment {
  type: 'screenshot' | 'json';
  data: string;
  label?: string;
}

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
 * Extracts base64 screenshots from tool output text.
 * Returns the cleaned text with screenshots replaced by placeholders,
 * and an array of extracted screenshot attachments.
 */
export function extractScreenshots(output: string): {
  cleanedText: string;
  attachments: MessageAttachment[];
} {
  const attachments: MessageAttachment[] = [];

  const dataUrlRegex = /data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+/g;
  let match;
  while ((match = dataUrlRegex.exec(output)) !== null) {
    attachments.push({
      type: 'screenshot',
      data: match[0],
      label: 'Browser screenshot',
    });
  }

  const rawBase64Regex = /(?<![;,])(?:^|["\s])?(iVBORw0[A-Za-z0-9+/=]{100,})(?:["\s]|$)/g;
  while ((match = rawBase64Regex.exec(output)) !== null) {
    const base64Data = match[1];
    if (base64Data && base64Data.length > 100) {
      attachments.push({
        type: 'screenshot',
        data: `data:image/png;base64,${base64Data}`,
        label: 'Browser screenshot',
      });
    }
  }

  let cleanedText = output
    .replace(dataUrlRegex, '[Screenshot captured]')
    .replace(rawBase64Regex, '[Screenshot captured]');

  cleanedText = cleanedText
    .replace(/"[Screenshot captured]"/g, '"[Screenshot]"')
    .replace(/\[Screenshot captured\]\[Screenshot captured\]/g, '[Screenshot captured]');

  return { cleanedText, attachments };
}

/**
 * Sanitizes tool output for display by removing ANSI codes,
 * connection URLs, call logs, and simplifying error messages.
 */
export function sanitizeToolOutput(text: string, isError: boolean): string {
  let result = text;

  result = result.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
  result = result.replace(/\x1B\[2m|\x1B\[22m|\x1B\[0m/g, '');

  result = result.replace(/ws:\/\/[^\s\]]+/g, '[connection]');

  result = result.replace(/\s*Call log:[\s\S]*/i, '');

  if (isError) {
    const timeoutMatch = result.match(/timed? ?out after (\d+)ms/i);
    if (timeoutMatch) {
      const seconds = Math.round(parseInt(timeoutMatch[1]) / 1000);
      return `Timed out after ${seconds}s`;
    }

    const protocolMatch = result.match(/Protocol error \([^)]+\):\s*(.+)/i);
    if (protocolMatch) {
      result = protocolMatch[1].trim();
    }

    result = result.replace(/^Error executing code:\s*/i, '');
    result = result.replace(/browserType\.connectOverCDP:\s*/i, '');
    result = result.replace(/\s+at\s+.+/g, '');
    result = result.replace(/\w+Error:\s*/g, '');
  }

  return result.trim();
}

/**
 * Converts an OpenCodeMessage to a TaskMessage for display in the UI.
 * Returns null if the message should not be displayed.
 */
export function toTaskMessage(message: OpenCodeMessage): TaskMessage | null {
  if (message.type === 'text') {
    if (message.part.text) {
      return {
        id: createMessageId(),
        type: 'assistant',
        content: message.part.text,
        timestamp: new Date().toISOString(),
      };
    }
    return null;
  }

  if (message.type === 'tool_call') {
    return {
      id: createMessageId(),
      type: 'tool',
      content: `Using tool: ${message.part.tool}`,
      toolName: message.part.tool,
      toolInput: message.part.input,
      timestamp: new Date().toISOString(),
    };
  }

  if (message.type === 'tool_use') {
    const toolUseMsg = message as OpenCodeToolUseMessage;
    const toolName = toolUseMsg.part.tool || 'unknown';
    const toolInput = toolUseMsg.part.state?.input;
    const toolOutput = toolUseMsg.part.state?.output || '';
    const status = toolUseMsg.part.state?.status;

    if (status === 'completed' || status === 'error') {
      const { cleanedText, attachments } = extractScreenshots(toolOutput);
      const isError = status === 'error';
      const sanitizedText = sanitizeToolOutput(cleanedText, isError);
      const displayText = sanitizedText.length > 500
        ? sanitizedText.substring(0, 500) + '...'
        : sanitizedText;

      return {
        id: createMessageId(),
        type: 'tool',
        content: displayText || `Tool ${toolName} ${status}`,
        toolName,
        toolInput,
        timestamp: new Date().toISOString(),
        attachments: attachments.length > 0 ? attachments : undefined,
      };
    }
    return null;
  }

  return null;
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
  addTaskMessage: (taskId: string, message: TaskMessage) => void
): MessageBatcher {
  const batcher: MessageBatcher = {
    pendingMessages: [],
    timeout: null,
    taskId,
    flush: () => {
      if (batcher.pendingMessages.length === 0) return;

      forwardToRenderer('task:update:batch', {
        taskId,
        messages: batcher.pendingMessages,
      });

      for (const msg of batcher.pendingMessages) {
        addTaskMessage(taskId, msg);
      }

      batcher.pendingMessages = [];
      if (batcher.timeout) {
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
  addTaskMessage: (taskId: string, message: TaskMessage) => void
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
    batcher.flush();
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
    messageBatchers.delete(taskId);
  }
}
