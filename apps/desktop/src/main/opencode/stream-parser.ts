import { EventEmitter } from 'events';
import type { OpenCodeMessage } from '@accomplish/shared';

export interface StreamParserEvents {
  message: [OpenCodeMessage];
  error: [Error];
}

// Maximum buffer size to prevent memory exhaustion (10MB)
const MAX_BUFFER_SIZE = 10 * 1024 * 1024;

/**
 * Parses NDJSON (newline-delimited JSON) stream from OpenCode CLI
 *
 * Handles Windows PTY buffering issues where JSON lines may be fragmented
 * across multiple data chunks.
 */
export class StreamParser extends EventEmitter<StreamParserEvents> {
  private buffer: string = '';
  // Buffer for incomplete JSON objects that started with { but failed to parse
  private incompleteJson: string = '';

  /**
   * Feed raw data from stdout
   */
  feed(chunk: string): void {
    this.buffer += chunk;

    // Parse complete lines first - this extracts all complete JSON messages
    // and leaves only the incomplete tail in the buffer
    this.parseBuffer();

    // After parsing, buffer contains only the incomplete line (after last newline).
    // If this single incomplete line exceeds MAX_BUFFER_SIZE, it's a pathological case
    // (e.g., a single JSON line > 10MB, likely corrupted or malicious).
    // We must discard it to prevent memory exhaustion.
    if (this.buffer.length > MAX_BUFFER_SIZE) {
      this.emit('error', new Error('Stream buffer size exceeded maximum limit'));
      this.buffer = '';
    }
  }

  /**
   * Parse complete lines from the buffer
   */
  private parseBuffer(): void {
    const lines = this.buffer.split('\n');

    // Keep incomplete line in buffer
    this.buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.trim()) {
        this.parseLine(line);
      }
    }
  }

  /**
   * Check if a line is terminal UI decoration (not JSON)
   * These are outputted by the CLI's interactive prompts
   */
  private isTerminalDecoration(line: string): boolean {
    const trimmed = line.trim();
    // Box-drawing and UI characters used by the CLI's interactive prompts
    const terminalChars = ['│', '┌', '┐', '└', '┘', '├', '┤', '┬', '┴', '┼', '─', '◆', '●', '○', '◇'];
    // Check if line starts with a terminal decoration character
    if (terminalChars.some(char => trimmed.startsWith(char))) {
      return true;
    }
    // Also skip ANSI escape sequences and other control characters
    if (/^[\x00-\x1F\x7F]/.test(trimmed) || /^\x1b\[/.test(trimmed)) {
      return true;
    }
    return false;
  }

  /**
   * Try to parse a JSON string, returns the message or null if invalid
   */
  private tryParseJson(jsonStr: string): OpenCodeMessage | null {
    try {
      return JSON.parse(jsonStr) as OpenCodeMessage;
    } catch {
      return null;
    }
  }

  /**
   * Parse a single JSON line
   * Handles fragmented JSON lines from Windows PTY buffering
   */
  private parseLine(line: string): void {
    const trimmed = line.trim();

    // Skip empty lines
    if (!trimmed) return;

    // Skip terminal UI decorations (interactive prompts, box-drawing chars)
    if (this.isTerminalDecoration(trimmed)) {
      return;
    }

    // If we have an incomplete JSON and current line doesn't start with {,
    // this might be a continuation of the previous JSON
    if (this.incompleteJson && !trimmed.startsWith('{')) {
      // Append to incomplete JSON (the line break was removed by split)
      this.incompleteJson += trimmed;

      // Try to parse the combined JSON
      const message = this.tryParseJson(this.incompleteJson);
      if (message) {
        console.log('[StreamParser] Parsed fragmented message type:', message.type);
        this.incompleteJson = '';
        this.emitMessage(message);
        return;
      }

      // Still incomplete, keep buffering (but log for debugging)
      // Don't log every fragment to avoid spam
      return;
    }

    // If current line starts with { but we have incomplete JSON,
    // the previous incomplete JSON was corrupted - discard it
    if (this.incompleteJson && trimmed.startsWith('{')) {
      console.log('[StreamParser] Discarding incomplete JSON, new JSON started');
      this.incompleteJson = '';
    }

    // Only attempt to parse lines that look like JSON (start with {)
    if (!trimmed.startsWith('{')) {
      // Log non-JSON lines for debugging but don't emit errors
      // These could be CLI status messages, etc.
      console.log('[StreamParser] Skipping non-JSON line:', trimmed.substring(0, 50));
      return;
    }

    // Try to parse the JSON
    const message = this.tryParseJson(trimmed);
    if (message) {
      console.log('[StreamParser] Parsed message type:', message.type);
      this.emitMessage(message);
      return;
    }

    // JSON parse failed - this line might be fragmented (Windows PTY issue)
    // Save it and try to append the next line(s)
    this.incompleteJson = trimmed;
    console.log('[StreamParser] Buffering incomplete JSON (Windows PTY fragmentation)');
  }

  /**
   * Emit a parsed message with enhanced logging
   */
  private emitMessage(message: OpenCodeMessage): void {
    // Enhanced logging for MCP/Playwriter-related messages
    if (message.type === 'tool_call' || message.type === 'tool_result') {
      const part = message.part as Record<string, unknown>;
      console.log('[StreamParser] Tool message details:', {
        type: message.type,
        tool: part?.tool,
        hasInput: !!part?.input,
        hasOutput: !!part?.output,
      });

      // Check if it's a dev-browser tool
      const toolName = String(part?.tool || '').toLowerCase();
      const output = String(part?.output || '').toLowerCase();
      if (toolName.includes('dev-browser') ||
          toolName.includes('browser') ||
          toolName.includes('mcp') ||
          output.includes('dev-browser') ||
          output.includes('browser')) {
        console.log('[StreamParser] >>> DEV-BROWSER MESSAGE <<<');
        console.log('[StreamParser] Full message:', JSON.stringify(message, null, 2));
      }
    }

    this.emit('message', message);
  }

  /**
   * Flush any remaining buffer content
   */
  flush(): void {
    if (this.buffer.trim()) {
      this.parseLine(this.buffer);
      this.buffer = '';
    }
    // Also try to parse any remaining incomplete JSON
    if (this.incompleteJson) {
      const message = this.tryParseJson(this.incompleteJson);
      if (message) {
        console.log('[StreamParser] Parsed remaining incomplete JSON on flush');
        this.emitMessage(message);
      } else {
        console.log('[StreamParser] Discarding unparseable incomplete JSON on flush');
      }
      this.incompleteJson = '';
    }
  }

  /**
   * Reset the parser
   */
  reset(): void {
    this.buffer = '';
    this.incompleteJson = '';
  }
}
