import type { OpenCodeMessage, OpenCodeToolUseMessage } from '../common/types/opencode.js';
import type { TaskMessage } from '../common/types/task.js';
import { createMessageId } from '../common/index.js';
import { isHiddenToolName } from './tool-classification.js';

/**
 * Delay in milliseconds for batching messages before sending to renderer.
 */
export const MESSAGE_BATCH_DELAY_MS = 50;
const MAX_TOOL_OUTPUT_LENGTH = 200_000;
const MAX_SCREENSHOT_ATTACHMENT_COUNT = 1;
const MAX_SCREENSHOT_ATTACHMENT_LENGTH = 200_000;

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
    const screenshotData = match[0];
    if (
      attachments.length < MAX_SCREENSHOT_ATTACHMENT_COUNT &&
      screenshotData.length <= MAX_SCREENSHOT_ATTACHMENT_LENGTH
    ) {
      attachments.push({
        type: 'screenshot',
        data: screenshotData,
        label: 'Browser screenshot',
      });
    }
  }

  const rawBase64Regex =
    /(?<![;,])(^|["\s])?((?:iVBORw0|\/9j\/|UklGR|R0lGOD)[A-Za-z0-9+/=]{100,})(["\s]|$)/g;
  while ((match = rawBase64Regex.exec(output)) !== null) {
    const base64Data = match[2];
    if (base64Data && base64Data.length > 100) {
      let mimeType = 'image/png';
      if (base64Data.startsWith('/9j/')) {
        mimeType = 'image/jpeg';
      } else if (base64Data.startsWith('UklGR')) {
        mimeType = 'image/webp';
      } else if (base64Data.startsWith('R0lGOD')) {
        mimeType = 'image/gif';
      }

      const screenshotData = `data:${mimeType};base64,${base64Data}`;
      if (
        attachments.length < MAX_SCREENSHOT_ATTACHMENT_COUNT &&
        screenshotData.length <= MAX_SCREENSHOT_ATTACHMENT_LENGTH
      ) {
        attachments.push({
          type: 'screenshot',
          data: screenshotData,
          label: 'Browser screenshot',
        });
      }
    }
  }

  let cleanedText = output
    .replace(dataUrlRegex, '[Screenshot captured]')
    .replace(rawBase64Regex, (_fullMatch, prefix = '', _data = '', suffix = '') => {
      return `${prefix}[Screenshot captured]${suffix}`;
    });

  cleanedText = cleanedText
    .replace(/"\[Screenshot captured\]"/g, '"[Screenshot]"')
    .replace(/\[Screenshot captured\]\[Screenshot captured\]/g, '[Screenshot captured]');

  return { cleanedText, attachments };
}

const TOOL_DISPLAY_NAMES: Record<string, string | null> = {
  browser_evaluate: 'Evaluating page',
  browser_snapshot: 'Taking screenshot',
  browser_canvas_type: 'Typing text',
  browser_script: 'Running script',
  browser_click: 'Clicking element',
  browser_keyboard: 'Typing',
};

const INSTRUCTION_BLOCK_RE = /<instruction\b[^>]*>[\s\S]*?<\/instruction>/gi;
const NUDGE_BLOCK_RE = /<nudge>[\s\S]*?<\/nudge>/gi;
const THOUGHT_BLOCK_RE = /<thought>[\s\S]*?<\/thought>/gi;
const SCRATCHPAD_BLOCK_RE = /<scratchpad>[\s\S]*?<\/scratchpad>/gi;
const THINKING_BLOCK_RE = /<thinking>[\s\S]*?<\/thinking>/gi;
const REFLECTION_BLOCK_RE = /<reflection>[\s\S]*?<\/reflection>/gi;
const UNCLOSED_INTERNAL_TAG_RE =
  /<(?:thought|nudge|instruction|scratchpad|thinking|reflection)(?:\b[^>]*)?>[\s\S]*$/gi;
const ORPHAN_TAGS_RE =
  /<\/?(?:nudge|thought|scratchpad|thinking|reflection)>|<instruction\b[^>]*>|<\/instruction>/gi;
const INTERNAL_LINES_RE =
  /^.*(?:context_management_protocol|policy_level=critical|<prunable-tools>|thoughtSignature).*$/gm;
const EXCESSIVE_NEWLINES_RE = /\n{3,}/g;

export function sanitizeAssistantTextForDisplay(text: string): string | null {
  let result = text;
  result = result.replace(INSTRUCTION_BLOCK_RE, '');
  result = result.replace(NUDGE_BLOCK_RE, '');
  result = result.replace(THOUGHT_BLOCK_RE, '');
  result = result.replace(SCRATCHPAD_BLOCK_RE, '');
  result = result.replace(THINKING_BLOCK_RE, '');
  result = result.replace(REFLECTION_BLOCK_RE, '');
  result = result.replace(UNCLOSED_INTERNAL_TAG_RE, '');
  result = result.replace(ORPHAN_TAGS_RE, '');
  result = result.replace(INTERNAL_LINES_RE, '');
  result = result.replace(EXCESSIVE_NEWLINES_RE, '\n\n');
  result = result.trim();
  return result.length > 0 ? result : null;
}

export function getToolDisplayName(toolName: string): string | null {
  if (isHiddenToolName(toolName)) {
    return null;
  }
  if (Object.prototype.hasOwnProperty.call(TOOL_DISPLAY_NAMES, toolName)) {
    return TOOL_DISPLAY_NAMES[toolName];
  }
  return toolName;
}

/**
 * Sanitizes tool output for display by removing ANSI codes,
 * connection URLs, call logs, and simplifying error messages.
 */
export function sanitizeToolOutput(text: string, isError: boolean): string {
  let result = text;

  // eslint-disable-next-line no-control-regex
  result = result.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
  // eslint-disable-next-line no-control-regex
  result = result.replace(/\x1B\[2m|\x1B\[22m|\x1B\[0m/g, '');

  result = result.replace(/ws:\/\/[^\s\]]+/g, '[connection]');
  result = result.replace(/\[ref=e\d+\]/g, '');
  result = result.replace(/\[cursor=\w+\]/g, '');

  result = result.replace(/\s*Call log:[\s\S]*/i, '');
  result = result.replace(/ {2,}/g, ' ');

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
    const sanitized = sanitizeAssistantTextForDisplay(message.part.text || '');
    if (sanitized) {
      return {
        id: createMessageId(),
        type: 'assistant',
        content: sanitized,
        timestamp: new Date().toISOString(),
      };
    }
    return null;
  }

  if (message.type === 'tool_call') {
    const displayName = getToolDisplayName(message.part.tool);
    if (displayName === null) {
      return null;
    }
    return {
      id: createMessageId(),
      type: 'tool',
      content: `Using tool: ${displayName}`,
      toolName: message.part.tool,
      toolInput: message.part.input,
      timestamp: new Date().toISOString(),
    };
  }

  if (message.type === 'tool_use') {
    const toolUseMsg = message as OpenCodeToolUseMessage;
    const toolName = toolUseMsg.part.tool || 'unknown';
    const displayName = getToolDisplayName(toolName);
    if (displayName === null) {
      return null;
    }
    const toolInput = toolUseMsg.part.state?.input;
    const toolOutput = toolUseMsg.part.state?.output || '';
    const status = toolUseMsg.part.state?.status;

    if (status === 'completed' || status === 'error') {
      const wasTruncated = toolOutput.length > MAX_TOOL_OUTPUT_LENGTH;
      const stableOutput = wasTruncated
        ? `${toolOutput.slice(0, MAX_TOOL_OUTPUT_LENGTH)}\n[Tool output truncated]`
        : toolOutput;
      const { cleanedText, attachments } = extractScreenshots(stableOutput);
      const isError = status === 'error';
      const sanitizedText = sanitizeToolOutput(cleanedText, isError);
      const displayText =
        sanitizedText.length > 500 ? sanitizedText.substring(0, 500) + '...' : sanitizedText;

      return {
        id: createMessageId(),
        type: 'tool',
        content: displayText || `Tool ${toolName} ${status}`,
        toolName,
        toolInput,
        timestamp: new Date().toISOString(),
        attachments: !wasTruncated && attachments.length > 0 ? attachments : undefined,
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
  addTaskMessage: (taskId: string, message: TaskMessage) => void,
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
