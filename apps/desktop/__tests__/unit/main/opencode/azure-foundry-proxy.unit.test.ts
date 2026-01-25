import { describe, it, expect } from 'vitest';
import { transformRequestBody } from '../../../../src/main/opencode/azure-foundry-proxy';

describe('Azure Foundry Proxy - transformRequestBody', () => {
  describe('max_tokens to max_completion_tokens conversion', () => {
    it('should convert max_tokens to max_completion_tokens', () => {
      const input = Buffer.from(JSON.stringify({
        messages: [{ role: 'user', content: 'test' }],
        max_tokens: 1000,
      }));

      const result = transformRequestBody(input);
      const parsed = JSON.parse(result.toString());

      expect(parsed.max_completion_tokens).toBe(1000);
      expect(parsed.max_tokens).toBeUndefined();
    });

    it('should preserve max_completion_tokens if already present', () => {
      const input = Buffer.from(JSON.stringify({
        messages: [{ role: 'user', content: 'test' }],
        max_completion_tokens: 2000,
      }));

      const result = transformRequestBody(input);
      const parsed = JSON.parse(result.toString());

      expect(parsed.max_completion_tokens).toBe(2000);
      expect(parsed.max_tokens).toBeUndefined();
    });

    it('should prefer max_completion_tokens over max_tokens when both present', () => {
      const input = Buffer.from(JSON.stringify({
        messages: [{ role: 'user', content: 'test' }],
        max_tokens: 1000,
        max_completion_tokens: 2000,
      }));

      const result = transformRequestBody(input);
      const parsed = JSON.parse(result.toString());

      expect(parsed.max_completion_tokens).toBe(2000);
      expect(parsed.max_tokens).toBeUndefined();
    });

    it('should still strip reasoning_effort', () => {
      const input = Buffer.from(JSON.stringify({
        messages: [{ role: 'user', content: 'test' }],
        max_tokens: 1000,
        reasoning_effort: 'high',
      }));

      const result = transformRequestBody(input);
      const parsed = JSON.parse(result.toString());

      expect(parsed.max_completion_tokens).toBe(1000);
      expect(parsed.max_tokens).toBeUndefined();
      expect(parsed.reasoning_effort).toBeUndefined();
    });

    it('should return unchanged buffer for non-JSON content', () => {
      const input = Buffer.from('not json');

      const result = transformRequestBody(input);

      expect(result.toString()).toBe('not json');
    });

    it('should return unchanged buffer when no transformation needed', () => {
      const input = Buffer.from(JSON.stringify({
        messages: [{ role: 'user', content: 'test' }],
      }));

      const result = transformRequestBody(input);
      const parsed = JSON.parse(result.toString());

      expect(parsed.messages).toEqual([{ role: 'user', content: 'test' }]);
      expect(parsed.max_tokens).toBeUndefined();
      expect(parsed.max_completion_tokens).toBeUndefined();
    });
  });

  describe('edge cases', () => {
    it('should handle max_tokens: 0', () => {
      const input = Buffer.from(JSON.stringify({
        messages: [{ role: 'user', content: 'test' }],
        max_tokens: 0,
      }));

      const result = transformRequestBody(input);
      const parsed = JSON.parse(result.toString());

      expect(parsed.max_completion_tokens).toBe(0);
      expect(parsed.max_tokens).toBeUndefined();
    });

    it('should handle very large max_tokens value', () => {
      const input = Buffer.from(JSON.stringify({
        messages: [{ role: 'user', content: 'test' }],
        max_tokens: 128000,
      }));

      const result = transformRequestBody(input);
      const parsed = JSON.parse(result.toString());

      expect(parsed.max_completion_tokens).toBe(128000);
      expect(parsed.max_tokens).toBeUndefined();
    });

    it('should return empty buffer unchanged', () => {
      const input = Buffer.from('');

      const result = transformRequestBody(input);

      expect(result.toString()).toBe('');
    });

    it('should handle malformed JSON that starts with {', () => {
      const input = Buffer.from('{invalid json content');

      const result = transformRequestBody(input);

      expect(result.toString()).toBe('{invalid json content');
    });

    it('should handle truncated JSON object', () => {
      const input = Buffer.from('{"max_tokens": 100, "messages":');

      const result = transformRequestBody(input);

      expect(result.toString()).toBe('{"max_tokens": 100, "messages":');
    });
  });
});
