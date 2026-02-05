import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StreamParser } from '../../../src/opencode/stream-parser.js';
import type { OpenCodeMessage } from '../../../src/shared';

describe('StreamParser', () => {
  let parser: StreamParser;
  let receivedMessages: OpenCodeMessage[];

  beforeEach(() => {
    parser = new StreamParser();
    receivedMessages = [];

    // Suppress console.log during tests
    vi.spyOn(console, 'log').mockImplementation(() => {});

    parser.on('message', (message) => {
      receivedMessages.push(message);
    });
  });

  describe('complete JSON objects', () => {
    it('should parse complete JSON objects', () => {
      const message: OpenCodeMessage = {
        type: 'text',
        part: {
          id: '1',
          sessionID: 'session1',
          messageID: 'msg1',
          type: 'text',
          text: 'Hello, world!',
        },
      };

      parser.feed(JSON.stringify(message));

      expect(receivedMessages.length).toBe(1);
      expect(receivedMessages[0].type).toBe('text');
      expect((receivedMessages[0] as typeof message).part.text).toBe('Hello, world!');
    });

    it('should parse step_start messages', () => {
      const message = {
        type: 'step_start',
        part: {
          id: '1',
          sessionID: 'session1',
          messageID: 'msg1',
          type: 'step-start',
        },
      };

      parser.feed(JSON.stringify(message));

      expect(receivedMessages.length).toBe(1);
      expect(receivedMessages[0].type).toBe('step_start');
    });

    it('should parse tool_call messages', () => {
      const message = {
        type: 'tool_call',
        part: {
          id: '1',
          sessionID: 'session1',
          messageID: 'msg1',
          type: 'tool-call',
          tool: 'read_file',
          input: { path: '/test.txt' },
        },
      };

      parser.feed(JSON.stringify(message));

      expect(receivedMessages.length).toBe(1);
      expect(receivedMessages[0].type).toBe('tool_call');
    });
  });

  describe('fragmented JSON', () => {
    it('should handle fragmented JSON across multiple chunks', () => {
      const message = {
        type: 'text',
        part: {
          id: '1',
          sessionID: 'session1',
          messageID: 'msg1',
          type: 'text',
          text: 'Hello, world!',
        },
      };

      const jsonStr = JSON.stringify(message);

      // Split the JSON into multiple chunks
      const chunk1 = jsonStr.slice(0, 20);
      const chunk2 = jsonStr.slice(20, 40);
      const chunk3 = jsonStr.slice(40);

      parser.feed(chunk1);
      expect(receivedMessages.length).toBe(0); // Not complete yet

      parser.feed(chunk2);
      expect(receivedMessages.length).toBe(0); // Still not complete

      parser.feed(chunk3);
      expect(receivedMessages.length).toBe(1); // Now complete
      expect(receivedMessages[0].type).toBe('text');
    });

    it('should handle JSON split in the middle of a string value', () => {
      const message = {
        type: 'text',
        part: {
          id: '1',
          sessionID: 'session1',
          messageID: 'msg1',
          type: 'text',
          text: 'This is a long text value that will be split',
        },
      };

      const jsonStr = JSON.stringify(message);
      const midPoint = jsonStr.indexOf('long');

      parser.feed(jsonStr.slice(0, midPoint));
      expect(receivedMessages.length).toBe(0);

      parser.feed(jsonStr.slice(midPoint));
      expect(receivedMessages.length).toBe(1);
    });
  });

  describe('multiple JSON objects in one chunk', () => {
    it('should handle multiple JSON objects in one chunk', () => {
      const message1 = { type: 'text', part: { id: '1', sessionID: 's1', messageID: 'm1', type: 'text', text: 'First' } };
      const message2 = { type: 'text', part: { id: '2', sessionID: 's1', messageID: 'm2', type: 'text', text: 'Second' } };
      const message3 = { type: 'text', part: { id: '3', sessionID: 's1', messageID: 'm3', type: 'text', text: 'Third' } };

      const combined = JSON.stringify(message1) + JSON.stringify(message2) + JSON.stringify(message3);

      parser.feed(combined);

      expect(receivedMessages.length).toBe(3);
      expect((receivedMessages[0] as typeof message1).part.text).toBe('First');
      expect((receivedMessages[1] as typeof message2).part.text).toBe('Second');
      expect((receivedMessages[2] as typeof message3).part.text).toBe('Third');
    });

    it('should handle objects separated by newlines', () => {
      const message1 = { type: 'text', part: { id: '1', sessionID: 's1', messageID: 'm1', type: 'text', text: 'A' } };
      const message2 = { type: 'text', part: { id: '2', sessionID: 's1', messageID: 'm2', type: 'text', text: 'B' } };

      const combined = JSON.stringify(message1) + '\n' + JSON.stringify(message2);

      parser.feed(combined);

      expect(receivedMessages.length).toBe(2);
    });
  });

  describe('nested braces', () => {
    it('should handle JSON with nested braces', () => {
      const message = {
        type: 'tool_call',
        part: {
          id: '1',
          sessionID: 'session1',
          messageID: 'msg1',
          type: 'tool-call',
          tool: 'write_file',
          input: {
            path: '/test.txt',
            content: 'function test() { return { a: 1, b: { c: 2 } }; }',
          },
        },
      };

      parser.feed(JSON.stringify(message));

      expect(receivedMessages.length).toBe(1);
      expect((receivedMessages[0] as typeof message).part.input.content).toContain('{ a: 1, b: { c: 2 } }');
    });

    it('should handle deeply nested objects', () => {
      const message = {
        type: 'text',
        part: {
          id: '1',
          sessionID: 's1',
          messageID: 'm1',
          type: 'text',
          text: 'test',
          nested: {
            level1: {
              level2: {
                level3: {
                  value: 'deep',
                },
              },
            },
          },
        },
      };

      parser.feed(JSON.stringify(message));

      expect(receivedMessages.length).toBe(1);
    });
  });

  describe('escaped characters', () => {
    it('should handle escaped quotes in strings', () => {
      const message = {
        type: 'text',
        part: {
          id: '1',
          sessionID: 's1',
          messageID: 'm1',
          type: 'text',
          text: 'He said "Hello, world!"',
        },
      };

      parser.feed(JSON.stringify(message));

      expect(receivedMessages.length).toBe(1);
      expect((receivedMessages[0] as typeof message).part.text).toBe('He said "Hello, world!"');
    });

    it('should handle escaped braces in strings', () => {
      const message = {
        type: 'text',
        part: {
          id: '1',
          sessionID: 's1',
          messageID: 'm1',
          type: 'text',
          text: 'JSON example: {"key": "value"}',
        },
      };

      parser.feed(JSON.stringify(message));

      expect(receivedMessages.length).toBe(1);
      expect((receivedMessages[0] as typeof message).part.text).toBe('JSON example: {"key": "value"}');
    });

    it('should handle backslashes in strings', () => {
      const message = {
        type: 'text',
        part: {
          id: '1',
          sessionID: 's1',
          messageID: 'm1',
          type: 'text',
          text: 'Path: C:\\Users\\test\\file.txt',
        },
      };

      parser.feed(JSON.stringify(message));

      expect(receivedMessages.length).toBe(1);
      expect((receivedMessages[0] as typeof message).part.text).toBe('Path: C:\\Users\\test\\file.txt');
    });
  });

  describe('flush', () => {
    it('should attempt to parse remaining buffer on flush', () => {
      const message = { type: 'text', part: { id: '1', sessionID: 's1', messageID: 'm1', type: 'text', text: 'test' } };
      parser.feed(JSON.stringify(message));

      parser.flush();

      expect(receivedMessages.length).toBe(1);
    });

    it('should clear buffer after flush', () => {
      parser.feed('{"incomplete":');
      parser.flush();

      // Feed a new complete message
      const message = { type: 'text', part: { id: '1', sessionID: 's1', messageID: 'm1', type: 'text', text: 'new' } };
      parser.feed(JSON.stringify(message));

      expect(receivedMessages.length).toBe(1);
      expect((receivedMessages[0] as typeof message).part.text).toBe('new');
    });
  });

  describe('reset', () => {
    it('should clear the buffer on reset', () => {
      parser.feed('{"incomplete":');
      parser.reset();

      const message = { type: 'text', part: { id: '1', sessionID: 's1', messageID: 'm1', type: 'text', text: 'after reset' } };
      parser.feed(JSON.stringify(message));

      expect(receivedMessages.length).toBe(1);
      expect((receivedMessages[0] as typeof message).part.text).toBe('after reset');
    });
  });

  describe('error handling', () => {
    it('should emit error when buffer exceeds maximum size', () => {
      let errorEmitted = false;
      parser.on('error', () => {
        errorEmitted = true;
      });

      // Feed a very large chunk that exceeds the buffer limit
      const largeChunk = '{' + 'a'.repeat(11 * 1024 * 1024); // 11MB, exceeds 10MB limit
      parser.feed(largeChunk);

      expect(errorEmitted).toBe(true);
    });

    it('should skip non-JSON content before JSON object', () => {
      const garbage = 'some random text ';
      const message = { type: 'text', part: { id: '1', sessionID: 's1', messageID: 'm1', type: 'text', text: 'valid' } };

      parser.feed(garbage + JSON.stringify(message));

      expect(receivedMessages.length).toBe(1);
      expect((receivedMessages[0] as typeof message).part.text).toBe('valid');
    });
  });

  describe('Windows PTY handling', () => {
    it('should sanitize carriage returns and newlines inside JSON', () => {
      // Simulate Windows PTY injecting CR/LF
      const message = { type: 'text', part: { id: '1', sessionID: 's1', messageID: 'm1', type: 'text', text: 'line1\nline2' } };
      const jsonStr = JSON.stringify(message);

      // PTY might inject raw CR/LF that corrupts the JSON string values
      // The sanitizer should handle this
      parser.feed(jsonStr);

      expect(receivedMessages.length).toBe(1);
    });
  });
});
