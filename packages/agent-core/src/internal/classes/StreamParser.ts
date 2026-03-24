import { EventEmitter } from 'events';
import type { OpenCodeMessage } from '../../common/types/opencode.js';

export interface StreamParserEvents {
  message: [OpenCodeMessage];
  error: [Error];
}

const MAX_BUFFER_SIZE = 10 * 1024 * 1024;

export class StreamParser extends EventEmitter<StreamParserEvents> {
  private buffer: string = '';

  feed(chunk: string): void {
    this.buffer += chunk;

    this.parseBuffer();

    if (this.buffer.length > MAX_BUFFER_SIZE) {
      this.emit('error', new Error('Stream buffer size exceeded maximum limit'));
      this.buffer = '';
    }
  }

  private parseBuffer(): void {
    while (true) {
      const startIdx = this.buffer.indexOf('{');
      if (startIdx === -1) {
        this.buffer = '';
        return;
      }

      if (startIdx > 0) {
        const skipped = this.buffer.substring(0, startIdx).trim();
        if (skipped) {
          console.log('[StreamParser] Skipping non-JSON content:', skipped.substring(0, 50));
        }
        this.buffer = this.buffer.substring(startIdx);
      }

      const endIdx = this.findJsonEnd(this.buffer);
      if (endIdx === -1) {
        return;
      }

      const jsonStr = this.buffer.substring(0, endIdx + 1);
      this.buffer = this.buffer.substring(endIdx + 1);

      this.parseJsonString(jsonStr);
    }
  }

  private findJsonEnd(str: string): number {
    let depth = 0;
    let inString = false;
    let escape = false;

    for (let i = 0; i < str.length; i++) {
      const char = str[i];

      if (escape) {
        escape = false;
        continue;
      }

      if (char === '\\' && inString) {
        escape = true;
        continue;
      }

      if (char === '"') {
        inString = !inString;
        continue;
      }

      if (inString) continue;

      if (char === '{') {
        depth++;
      } else if (char === '}') {
        depth--;
        if (depth === 0) {
          return i;
        }
      }
    }

    return -1;
  }

  private sanitizeJson(str: string): string {
    return str.replace(/[\r\n]/g, '');
  }

  private parseJsonString(jsonStr: string): void {
    const trimmed = jsonStr.trim();
    if (!trimmed) return;

    const sanitized = this.sanitizeJson(trimmed);

    try {
      const message = JSON.parse(sanitized) as OpenCodeMessage;
      console.log('[StreamParser] Parsed message type:', message.type);
      this.emitMessage(message);
    } catch (e) {
      console.log('[StreamParser] Failed to parse JSON:', sanitized.substring(0, 100), e);
    }
  }

  private emitMessage(message: OpenCodeMessage): void {
    if (message.type === 'tool_call' || message.type === 'tool_result') {
      const part = message.part as Record<string, unknown>;
      console.log('[StreamParser] Tool message details:', {
        type: message.type,
        tool: part?.tool,
        hasInput: !!part?.input,
        hasOutput: !!part?.output,
      });

      const toolName = String(part?.tool || '').toLowerCase();
      const output = String(part?.output || '').toLowerCase();
      if (
        toolName.includes('dev-browser') ||
        toolName.includes('browser') ||
        toolName.includes('mcp') ||
        output.includes('dev-browser') ||
        output.includes('browser')
      ) {
        console.log('[StreamParser] >>> DEV-BROWSER MESSAGE <<<');
        console.log('[StreamParser] Full message:', JSON.stringify(message, null, 2));
      }
    }

    this.emit('message', message);
  }

  flush(): void {
    if (this.buffer.trim()) {
      this.parseJsonString(this.buffer);
      this.buffer = '';
    }
  }

  reset(): void {
    this.buffer = '';
  }
}
