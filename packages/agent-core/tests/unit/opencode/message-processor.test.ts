import { describe, it, expect } from 'vitest';
import {
  sanitizeAssistantTextForDisplay,
  sanitizeToolOutput,
  toTaskMessage,
  getToolDisplayName,
  extractScreenshots,
} from '../../../src/opencode/message-processor.js';
import type { OpenCodeMessage } from '../../../src/common/types/opencode.js';

describe('sanitizeAssistantTextForDisplay', () => {
  it('preserves plain assistant text unchanged', () => {
    expect(sanitizeAssistantTextForDisplay('Hello, I can help you with that.')).toBe(
      'Hello, I can help you with that.',
    );
  });

  it('returns null for pure nudge block', () => {
    expect(sanitizeAssistantTextForDisplay('<nudge>some internal nudge</nudge>')).toBeNull();
  });

  it('returns null for pure instruction block', () => {
    const text =
      '<instruction name=context_management_protocol policy_level=critical>internal stuff</instruction>';
    expect(sanitizeAssistantTextForDisplay(text)).toBeNull();
  });

  it('returns null for pure thought block', () => {
    expect(sanitizeAssistantTextForDisplay('<thought>thinking...</thought>')).toBeNull();
  });

  it('returns null for pure scratchpad block', () => {
    expect(sanitizeAssistantTextForDisplay('<scratchpad>notes here</scratchpad>')).toBeNull();
  });

  it('returns null for pure thinking block', () => {
    expect(sanitizeAssistantTextForDisplay('<thinking>deep thought</thinking>')).toBeNull();
  });

  it('returns null for pure reflection block', () => {
    expect(sanitizeAssistantTextForDisplay('<reflection>self-review</reflection>')).toBeNull();
  });

  it('keeps user-facing text and strips thought block from mixed message', () => {
    const text = 'Here is your answer.\n<thought>internal reasoning</thought>';
    expect(sanitizeAssistantTextForDisplay(text)).toBe('Here is your answer.');
  });

  it('preserves non-internal XML like <div>', () => {
    expect(sanitizeAssistantTextForDisplay('<div>hello</div>')).toBe('<div>hello</div>');
  });

  it('does not match tags that merely start with internal tag names', () => {
    expect(sanitizeAssistantTextForDisplay('<thoughtful>hello</thoughtful>')).toBe(
      '<thoughtful>hello</thoughtful>',
    );
  });

  it('strips orphan closing tags', () => {
    const text = 'Some text</thought> more text';
    expect(sanitizeAssistantTextForDisplay(text)).toBe('Some text more text');
  });

  it('strips lines containing context_management_protocol', () => {
    const text = 'Good line\ncontext_management_protocol: do stuff\nAnother good line';
    expect(sanitizeAssistantTextForDisplay(text)).toBe('Good line\n\nAnother good line');
  });

  it('strips everything from lone opening <thought> tag to end (streaming edge)', () => {
    const text = 'Visible text\n<thought>partial thinking with no close';
    const result = sanitizeAssistantTextForDisplay(text);
    expect(result).toBe('Visible text');
  });
});

describe('toTaskMessage', () => {
  it('returns null for fully internal text', () => {
    const message: OpenCodeMessage = {
      type: 'text',
      part: {
        id: '1',
        sessionID: 's1',
        messageID: 'm1',
        type: 'text',
        text: '<thought>all internal</thought>',
      },
    };
    expect(toTaskMessage(message)).toBeNull();
  });

  it('returns valid TaskMessage with sanitized content for mixed text', () => {
    const message: OpenCodeMessage = {
      type: 'text',
      part: {
        id: '2',
        sessionID: 's1',
        messageID: 'm2',
        type: 'text',
        text: 'Hello user\n<nudge>internal</nudge>',
      },
    };
    const result = toTaskMessage(message);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('assistant');
    expect(result!.content).toBe('Hello user');
  });

  it('returns null for hidden tool names like discard', () => {
    const message: OpenCodeMessage = {
      type: 'tool_call',
      part: {
        id: '3',
        sessionID: 's1',
        messageID: 'm3',
        type: 'tool_call',
        tool: 'discard',
        input: '{}',
      },
    };
    expect(toTaskMessage(message)).toBeNull();
  });

  it('returns null for hidden tool names in tool_use path', () => {
    const message: OpenCodeMessage = {
      type: 'tool_use',
      part: {
        id: '4',
        sessionID: 's1',
        messageID: 'm4',
        type: 'tool_use',
        tool: 'extract',
        state: { status: 'completed', output: 'some output' },
      },
    } as OpenCodeMessage;
    expect(toTaskMessage(message)).toBeNull();
  });

  it('stores raw tool ID in toolName, not display label', () => {
    const message: OpenCodeMessage = {
      type: 'tool_call',
      part: {
        id: '5',
        sessionID: 's1',
        messageID: 'm5',
        type: 'tool_call',
        tool: 'browser_click',
        input: '{}',
      },
    };
    const result = toTaskMessage(message);
    expect(result).not.toBeNull();
    expect(result!.toolName).toBe('browser_click');
    expect(result!.content).toBe('Using tool: Clicking element');
  });

  it('extracts raw JPEG base64 screenshot payloads from tool output', () => {
    const rawJpeg = '/9j/' + 'A'.repeat(180);

    const message: OpenCodeMessage = {
      type: 'tool_use',
      part: {
        id: '6',
        sessionID: 's1',
        messageID: 'm6',
        type: 'tool_use',
        tool: 'browser_screenshot',
        state: {
          status: 'completed',
          output: `Screenshot payload: "${rawJpeg}"`,
        },
      },
    } as OpenCodeMessage;

    const result = toTaskMessage(message);

    expect(result).not.toBeNull();
    expect(result!.attachments).toBeDefined();
    expect(result!.attachments![0].data.startsWith('data:image/jpeg;base64,/9j/')).toBe(true);
    expect(result!.content).toContain('[Screenshot]');
  });

  it('drops oversized screenshot attachments to keep IPC payloads small', () => {
    const oversizedDataUrl = `data:image/png;base64,${'A'.repeat(250_000)}`;
    const message: OpenCodeMessage = {
      type: 'tool_use',
      part: {
        id: '6',
        sessionID: 's1',
        messageID: 'm6',
        type: 'tool_use',
        tool: 'browser_script',
        state: { status: 'completed', output: oversizedDataUrl },
      },
    } as OpenCodeMessage;

    const result = toTaskMessage(message);
    expect(result).not.toBeNull();
    expect(result!.content).toContain('[Screenshot captured]');
    expect(result!.attachments).toBeUndefined();
  });
});

describe('extractScreenshots', () => {
  it('keeps at most one screenshot attachment', () => {
    const screenshot = `data:image/png;base64,${'A'.repeat(120)}`;
    const output = `${screenshot}\n${screenshot}`;
    const result = extractScreenshots(output);
    expect(result.attachments).toHaveLength(1);
  });
});

describe('sanitizeToolOutput', () => {
  it('strips [ref=eNN] patterns and collapses extra spaces', () => {
    const result = sanitizeToolOutput('Click [ref=e42] button', false);
    expect(result).toBe('Click button');
  });

  it('strips [cursor=pointer] attributes and collapses extra spaces', () => {
    const result = sanitizeToolOutput('Element [cursor=pointer] here', false);
    expect(result).toBe('Element here');
  });
});

describe('getToolDisplayName', () => {
  it('returns null for hidden tools', () => {
    expect(getToolDisplayName('discard')).toBeNull();
    expect(getToolDisplayName('extract')).toBeNull();
    expect(getToolDisplayName('context_info')).toBeNull();
    expect(getToolDisplayName('prune')).toBeNull();
    expect(getToolDisplayName('distill')).toBeNull();
    expect(getToolDisplayName('mcp_prune')).toBeNull();
    expect(getToolDisplayName('mcp_distill')).toBeNull();
  });

  it('returns display name for mapped tools', () => {
    expect(getToolDisplayName('browser_click')).toBe('Clicking element');
  });

  it('returns original name for unknown tools', () => {
    expect(getToolDisplayName('some_custom_tool')).toBe('some_custom_tool');
  });
});
