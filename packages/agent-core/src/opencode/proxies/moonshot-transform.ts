import { createConsoleLogger } from '../../utils/logging.js';
import { reasoningContentCache, hashMessageContent } from './moonshot-cache.js';

const log = createConsoleLogger({ prefix: 'MoonshotProxy' });

export const MOONSHOT_PROXY_PORT = 9229;
export const MAX_REQUEST_SIZE = 10 * 1024 * 1024;
export const DEBUG = process.env.DEBUG_MOONSHOT_PROXY === '1';

export function transformMoonshotRequestBody(body: Buffer): Buffer {
  const text = body.toString('utf8');
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return body;
    }
    let modified = false;

    if (DEBUG) {
      log.info(`[Moonshot Proxy] Incoming request keys: ${Object.keys(parsed)}`);
      if (Array.isArray(parsed.messages)) {
        log.info(`[Moonshot Proxy] Message count: ${parsed.messages.length}`);
        parsed.messages.forEach((msg, i) => {
          const m = msg as Record<string, unknown>;
          log.info(
            `[Moonshot Proxy] Message ${i}: role=${m.role}, has_tool_calls=${Boolean(m.tool_calls)}, has_reasoning_content=${'reasoning_content' in m}`,
          );
        });
      }
    }

    const topLevelDisallowedKeys = ['enable_thinking', 'reasoning', 'reasoning_effort'];
    for (const key of topLevelDisallowedKeys) {
      if (key in parsed) {
        delete parsed[key];
        modified = true;
        if (DEBUG) {
          log.info(`[Moonshot Proxy] Removed top-level key: ${key}`);
        }
      }
    }

    if ('max_completion_tokens' in parsed && !('max_tokens' in parsed)) {
      parsed.max_tokens = parsed.max_completion_tokens;
      delete parsed.max_completion_tokens;
      modified = true;
    }

    const processMessagesArray = (messages: unknown): void => {
      if (!Array.isArray(messages)) {
        return;
      }
      for (const message of messages) {
        if (!message || typeof message !== 'object') {
          continue;
        }
        const msg = message as Record<string, unknown>;
        const role = msg.role;
        if (typeof role === 'string' && role === 'assistant' && !('reasoning_content' in msg)) {
          const hash = hashMessageContent({
            content: typeof msg.content === 'string' ? msg.content : '',
            tool_calls: Array.isArray(msg.tool_calls) ? msg.tool_calls : [],
          });
          const cachedReasoning = reasoningContentCache.get(hash);
          if (cachedReasoning) {
            msg.reasoning_content = cachedReasoning;
            if (DEBUG) {
              log.info(
                `[Moonshot Proxy] Restored reasoning_content from cache (${cachedReasoning.length} chars)`,
              );
            }
          } else {
            msg.reasoning_content = 'Thinking...';
            if (DEBUG) {
              log.info(`[Moonshot Proxy] No cached reasoning_content, using placeholder`);
            }
          }
          modified = true;
        }
      }
    };

    const visitForMessages = (value: unknown): void => {
      if (!value || typeof value !== 'object') {
        return;
      }
      if (Array.isArray(value)) {
        for (const item of value) {
          visitForMessages(item);
        }
        return;
      }
      const record = value as Record<string, unknown>;
      if ('messages' in record) {
        processMessagesArray(record.messages);
      }
      for (const key of Object.keys(record)) {
        visitForMessages(record[key]);
      }
    };

    visitForMessages(parsed);

    if (DEBUG) {
      log.info(`[Moonshot Proxy] Transform modified: ${modified}`);
      if (Array.isArray(parsed.messages)) {
        parsed.messages.forEach((msg, i) => {
          const m = msg as Record<string, unknown>;
          log.info(
            `[Moonshot Proxy] After transform msg ${i}: role=${m.role}, has_reasoning_content=${'reasoning_content' in m}, has_tool_calls=${Boolean(m.tool_calls)}`,
          );
        });
      }
    }

    const result = Buffer.from(JSON.stringify(parsed), 'utf8');
    if (result.length > MAX_REQUEST_SIZE) {
      log.warn(`[Moonshot Proxy] Skipping transformed body — exceeds ${MAX_REQUEST_SIZE} bytes`);
      return body;
    }
    if (DEBUG && modified) {
      log.info(`[Moonshot Proxy] Body transformed: ${body.length} -> ${result.length} bytes`);
    }
    return result;
  } catch (e) {
    log.error(`[Moonshot Proxy] Transform error: ${e}`);
    return body;
  }
}
