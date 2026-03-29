import { createHash } from 'crypto';
import { createConsoleLogger } from '../../utils/logging.js';

const log = createConsoleLogger({ prefix: 'MoonshotProxy' });

const DEBUG = process.env.DEBUG_MOONSHOT_PROXY === '1';

export const reasoningContentCache = new Map<string, string>();

export function hashMessageContent(msg: Record<string, unknown>): string {
  const hash = createHash('sha256');
  hash.update(String(msg.content) + JSON.stringify(msg.tool_calls || []));
  return hash.digest('hex');
}

export function extractAndCacheReasoningContent(responseText: string): void {
  let fullReasoningContent = '';
  let fullContent = '';
  let toolCalls: unknown[] = [];

  const lines = responseText.split('\n');
  for (const line of lines) {
    if (!line.startsWith('data: ')) {
      continue;
    }
    const jsonStr = line.slice(6).trim();
    if (jsonStr === '[DONE]') {
      continue;
    }

    try {
      const data = JSON.parse(jsonStr) as Record<string, unknown>;
      const choices = data.choices as Array<Record<string, unknown>> | undefined;
      if (!choices?.[0]) {
        continue;
      }

      const choice = choices[0];
      const delta = choice.delta as Record<string, unknown> | undefined;
      const message = choice.message as Record<string, unknown> | undefined;

      if (delta) {
        if (delta.reasoning_content) {
          fullReasoningContent += String(delta.reasoning_content);
        }
        if (delta.content) {
          fullContent += String(delta.content);
        }
        if (delta.tool_calls && Array.isArray(delta.tool_calls)) {
          for (const tc of delta.tool_calls) {
            const tcObj = tc as Record<string, unknown>;
            const index = tcObj.index as number;
            if (!toolCalls[index]) {
              toolCalls[index] = { ...tcObj };
            } else {
              const existing = toolCalls[index] as Record<string, unknown>;
              if (tcObj.function && typeof tcObj.function === 'object') {
                const fn = tcObj.function as Record<string, unknown>;
                const existingFn = (existing.function || {}) as Record<string, unknown>;
                if (fn.arguments) {
                  existingFn.arguments = (existingFn.arguments || '') + String(fn.arguments);
                }
                existing.function = existingFn;
              }
            }
          }
        }
      }

      if (message) {
        if (message.reasoning_content) {
          fullReasoningContent = String(message.reasoning_content);
        }
        if (message.content) {
          fullContent = String(message.content);
        }
        if (message.tool_calls) {
          toolCalls = message.tool_calls as unknown[];
        }
      }
    } catch {
      // intentionally empty
    }
  }

  if (!fullReasoningContent) {
    try {
      const data = JSON.parse(responseText) as Record<string, unknown>;
      const choices = data.choices as Array<Record<string, unknown>> | undefined;
      if (choices?.[0]) {
        const message = choices[0].message as Record<string, unknown> | undefined;
        if (message?.reasoning_content) {
          fullReasoningContent = String(message.reasoning_content);
          fullContent = String(message.content || '');
          toolCalls = (message.tool_calls as unknown[]) || [];
        }
      }
    } catch {
      // intentionally empty
    }
  }

  if (fullReasoningContent && (fullContent || toolCalls.length > 0)) {
    const mockMsg: Record<string, unknown> = {
      content: fullContent,
      tool_calls: toolCalls,
    };
    const hash = hashMessageContent(mockMsg);
    reasoningContentCache.set(hash, fullReasoningContent);

    if (DEBUG) {
      log.info(
        `[Moonshot Proxy] Cached reasoning_content (${fullReasoningContent.length} chars) for hash: ${hash.slice(0, 50)}...`,
      );
    }

    if (reasoningContentCache.size > 100) {
      const firstKey = reasoningContentCache.keys().next().value;
      if (firstKey) {
        reasoningContentCache.delete(firstKey);
      }
    }
  }
}
