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
  /**
 * Feed raw data from stdout
 */
  feed(chunk: string): void {
    this.buffer += chunk;

    // Prevent memory exhaustion from unbounded buffer growth
    if (this.buffer.length > MAX_BUFFER_SIZE) {
      this.emit('error', new Error('Stream buffer size exceeded maximum limit'));
      // Keep the last portion of the buffer to maintain parsing continuity
      this.buffer = this.buffer.slice(-MAX_BUFFER_SIZE / 2);
    }

    this.processBuffer();
  }

  /**
   * Process the buffer to extract text and JSON objects
   */
  private processBuffer(): void {
    let run = true;
    while (run) {
      run = false;
      const openBrace = this.buffer.indexOf('{');

      // Case 1: No JSON start found
      if (openBrace === -1) {
        // Treat all complete lines as text/logs
        const lastNewline = this.buffer.lastIndexOf('\n');
        if (lastNewline !== -1) {
          const textChunk = this.buffer.substring(0, lastNewline + 1);
          this.processTextChunk(textChunk);
          this.buffer = this.buffer.substring(lastNewline + 1);
        }
        // Keep remaining partial text in buffer
        return;
      }

      // Case 2: Content exists before the first '{'
      if (openBrace > 0) {
        const textPre = this.buffer.substring(0, openBrace);
        this.processTextChunk(textPre);
        this.buffer = this.buffer.substring(openBrace);
        // buffer now starts with '{'
      }

      // Case 3: Try to find the matching closing brace
      const closeIndex = this.findMatchingBrace(this.buffer);
      if (closeIndex !== -1) {
        const candidate = this.buffer.substring(0, closeIndex + 1);
        try {
          const message = JSON.parse(candidate) as OpenCodeMessage;
          this.handleMessage(message);
          this.buffer = this.buffer.substring(closeIndex + 1);
          run = true; // Continue processing the rest of the buffer
        } catch (err) {
          // Failed to parse, likely the '{' was just text, not start of JSON
          console.log('[StreamParser] Failed to parse conceptual JSON block, treating as text char');
          this.processTextChunk('{');
          this.buffer = this.buffer.substring(1);
          run = true;
        }
      }
      // Else: Incomplete JSON object, wait for more data
    }
  }

  /**
   * Find the index of the matching closing brace for the first '{'
   * Returns -1 if not found
   */
  private findMatchingBrace(str: string): number {
    let depth = 0;
    let inString = false;
    let escape = false;

    for (let i = 0; i < str.length; i++) {
      const char = str[i];

      if (inString) {
        if (escape) {
          escape = false;
        } else if (char === '\\') {
          escape = true;
        } else if (char === '"') {
          inString = false;
        }
      } else {
        if (char === '"') {
          inString = true;
        } else if (char === '{') {
          depth++;
        } else if (char === '}') {
          depth--;
          if (depth === 0) return i;
        }
      }
    }
    return -1;
  }

  /**
   * Process a chunk of text as lines (for non-JSON logging)
   */
  private processTextChunk(chunk: string): void {
    const lines = chunk.split('\n');
    for (const line of lines) {
      if (line.trim()) {
        this.parseLine(line, false);
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
   * Handle valid parsed message
   */
  private handleMessage(message: OpenCodeMessage): void {
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
  }

  /**
   * Parse a single text line (fallback for non-JSON)
   */
  private parseLine(line: string, tryJson: boolean = true): void {
    const trimmed = line.trim();

    // Skip empty lines
    if (!trimmed) return;

    // Skip terminal UI decorations (interactive prompts, box-drawing chars)
    if (this.isTerminalDecoration(trimmed)) {
      return;
    }

    // If we're strictly processing text chunks, just log it
    // But sometimes small JSONs might slip into text chunks if heuristics fail?
    // Our new logic is strict about braces, so 'tryJson' here is mostly legacy
    // or for cases where we fallback.

    if (tryJson && trimmed.startsWith('{')) {
      // This path is now mostly handled by processBuffer, but kept for flushing/edge cases
      try {
        const message = JSON.parse(trimmed) as OpenCodeMessage;
        this.handleMessage(message);
        return;
      } catch (e) {
        // Ignore, treat as text
      }
    }

    // Log non-JSON lines for debugging but don't emit errors
    // These could be CLI status messages, etc.
    console.log('[StreamParser] Skipping non-JSON line:', trimmed.substring(0, 50));
  }

  /**
   * Flush any remaining buffer content
   */
  flush(): void {
    if (this.buffer.trim()) {
      // Try to process whatever is left, though it's likely incomplete
      this.processTextChunk(this.buffer);
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
