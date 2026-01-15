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
 */
export class StreamParser extends EventEmitter<StreamParserEvents> {
  private buffer: string = '';

  /**
   * Feed raw data from stdout
   */
  feed(chunk: string): void {
    this.buffer += chunk;

    // Prevent memory exhaustion from unbounded buffer growth
    if (this.buffer.length > MAX_BUFFER_SIZE) {
      this.emit('error', new Error('Stream buffer size exceeded maximum limit'));
      // Safely truncate buffer at newline boundary to prevent data corruption
      // Find the last newline in the buffer to preserve complete lines
      this.buffer = this.safeBufferTruncate();
    }

    this.parseBuffer();
  }

  /**
   * Safely truncate the buffer at a newline boundary
   * This prevents cutting JSON objects in the middle which would cause parse errors
   */
  private safeBufferTruncate(): string {
    const targetSize = MAX_BUFFER_SIZE / 2;
    const startIndex = this.buffer.length - targetSize;

    if (startIndex <= 0) {
      return this.buffer;
    }

    // Find the first newline after the start index
    // This ensures we don't cut in the middle of a line
    const newlineIndex = this.buffer.indexOf('\n', startIndex);

    if (newlineIndex === -1) {
      // No newline found after start index, keep from start index
      // This is a fallback for extremely long lines
      return this.buffer.slice(startIndex);
    }

    // Keep everything after the newline (start of next complete line)
    return this.buffer.slice(newlineIndex + 1);
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
   * Parse a single JSON line
   */
  private parseLine(line: string): void {
    const trimmed = line.trim();

    // Skip empty lines
    if (!trimmed) return;

    // Skip terminal UI decorations (interactive prompts, box-drawing chars)
    if (this.isTerminalDecoration(trimmed)) {
      return;
    }

    // Only attempt to parse lines that look like JSON (start with {)
    if (!trimmed.startsWith('{')) {
      // Log non-JSON lines for debugging but don't emit errors
      // These could be CLI status messages, etc.
      console.log('[StreamParser] Skipping non-JSON line:', trimmed.substring(0, 50));
      return;
    }

    try {
      const message = JSON.parse(trimmed) as OpenCodeMessage;

      // Log parsed message for debugging
      console.log('[StreamParser] Parsed message type:', message.type);

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
    } catch (err) {
      // Log parse error but continue processing - this shouldn't happen often
      // since we already check for { prefix
      console.error('[StreamParser] Failed to parse JSON line:', trimmed.substring(0, 100), err);
      this.emit('error', new Error(`Failed to parse JSON: ${trimmed.substring(0, 50)}...`));
    }
  }

  /**
   * Flush any remaining buffer content
   */
  flush(): void {
    if (this.buffer.trim()) {
      this.parseLine(this.buffer);
      this.buffer = '';
    }
  }

  /**
   * Reset the parser
   */
  reset(): void {
    this.buffer = '';
  }
}
