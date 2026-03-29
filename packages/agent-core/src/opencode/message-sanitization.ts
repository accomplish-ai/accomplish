import { isHiddenToolName } from './tool-classification.js';

export const TOOL_DISPLAY_NAMES: Record<string, string | null> = {
  browser_evaluate: 'Evaluating page',
  browser_snapshot: 'Taking screenshot',
  browser_canvas_type: 'Typing text',
  browser_script: 'Running script',
  browser_click: 'Clicking element',
  browser_keyboard: 'Typing',
  request_connector_auth: 'Waiting for connector authentication',
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
      const seconds = Math.round(parseInt(timeoutMatch[1], 10) / 1000);
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
