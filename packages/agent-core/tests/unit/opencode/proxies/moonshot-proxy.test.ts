import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  transformMoonshotRequestBody,
  ensureMoonshotProxy,
  stopMoonshotProxy,
  isMoonshotProxyRunning,
} from '../../../../src/opencode/proxies/moonshot-proxy.js';

describe('Moonshot Proxy', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    // Clean up any running proxy
    await stopMoonshotProxy();
  });

  describe('transformMoonshotRequestBody', () => {
    it('should remove top-level enable_thinking flag', () => {
      const body = Buffer.from(
        JSON.stringify({
          model: 'kimi',
          messages: [{ role: 'user', content: 'Hello' }],
          enable_thinking: true,
        }),
      );

      const result = transformMoonshotRequestBody(body);
      const parsed = JSON.parse(result.toString());

      expect(parsed.enable_thinking).toBeUndefined();
    });

    it('should remove top-level reasoning flag', () => {
      const body = Buffer.from(
        JSON.stringify({
          model: 'kimi',
          messages: [{ role: 'user', content: 'Hello' }],
          reasoning: true,
        }),
      );

      const result = transformMoonshotRequestBody(body);
      const parsed = JSON.parse(result.toString());

      expect(parsed.reasoning).toBeUndefined();
    });

    it('should remove top-level reasoning_effort flag', () => {
      const body = Buffer.from(
        JSON.stringify({
          model: 'kimi',
          messages: [{ role: 'user', content: 'Hello' }],
          reasoning_effort: 'high',
        }),
      );

      const result = transformMoonshotRequestBody(body);
      const parsed = JSON.parse(result.toString());

      expect(parsed.reasoning_effort).toBeUndefined();
    });

    it('should convert max_completion_tokens to max_tokens', () => {
      const body = Buffer.from(
        JSON.stringify({
          model: 'kimi',
          messages: [{ role: 'user', content: 'Hello' }],
          max_completion_tokens: 1000,
        }),
      );

      const result = transformMoonshotRequestBody(body);
      const parsed = JSON.parse(result.toString());

      expect(parsed.max_completion_tokens).toBeUndefined();
      expect(parsed.max_tokens).toBe(1000);
    });

    it('should not overwrite existing max_tokens', () => {
      const body = Buffer.from(
        JSON.stringify({
          model: 'kimi',
          messages: [{ role: 'user', content: 'Hello' }],
          max_completion_tokens: 1000,
          max_tokens: 500,
        }),
      );

      const result = transformMoonshotRequestBody(body);
      const parsed = JSON.parse(result.toString());

      // When max_tokens already exists, max_completion_tokens is NOT converted
      // Both remain in the request (the API will use max_tokens)
      expect(parsed.max_completion_tokens).toBe(1000);
      expect(parsed.max_tokens).toBe(500);
    });

    it('should add reasoning_content to assistant messages without it', () => {
      const body = Buffer.from(
        JSON.stringify({
          model: 'kimi',
          messages: [
            { role: 'user', content: 'Hello' },
            { role: 'assistant', content: 'Hi there!' },
          ],
        }),
      );

      const result = transformMoonshotRequestBody(body);
      const parsed = JSON.parse(result.toString());

      expect(parsed.messages[1].reasoning_content).toBeDefined();
    });

    it('should preserve existing reasoning_content', () => {
      const body = Buffer.from(
        JSON.stringify({
          model: 'kimi',
          messages: [
            { role: 'user', content: 'Hello' },
            { role: 'assistant', content: 'Hi!', reasoning_content: 'I thought about this' },
          ],
        }),
      );

      const result = transformMoonshotRequestBody(body);
      const parsed = JSON.parse(result.toString());

      expect(parsed.messages[1].reasoning_content).toBe('I thought about this');
    });

    it('should not add reasoning_content to non-assistant messages', () => {
      const body = Buffer.from(
        JSON.stringify({
          model: 'kimi',
          messages: [
            { role: 'user', content: 'Hello' },
            { role: 'system', content: 'You are helpful' },
          ],
        }),
      );

      const result = transformMoonshotRequestBody(body);
      const parsed = JSON.parse(result.toString());

      expect(parsed.messages[0].reasoning_content).toBeUndefined();
      expect(parsed.messages[1].reasoning_content).toBeUndefined();
    });

    it('should return original buffer for invalid JSON', () => {
      const body = Buffer.from('not valid json');

      const result = transformMoonshotRequestBody(body);

      expect(result.toString()).toBe('not valid json');
    });

    it('should handle empty messages array', () => {
      const body = Buffer.from(
        JSON.stringify({
          model: 'kimi',
          messages: [],
        }),
      );

      const result = transformMoonshotRequestBody(body);
      const parsed = JSON.parse(result.toString());

      expect(parsed.messages).toEqual([]);
    });

    it('should handle nested messages in subobjects', () => {
      const body = Buffer.from(
        JSON.stringify({
          model: 'kimi',
          nested: {
            messages: [{ role: 'assistant', content: 'Nested message' }],
          },
        }),
      );

      const result = transformMoonshotRequestBody(body);
      const parsed = JSON.parse(result.toString());

      expect(parsed.nested.messages[0].reasoning_content).toBeDefined();
    });

    it('should handle multiple transformations together', () => {
      const body = Buffer.from(
        JSON.stringify({
          model: 'kimi',
          messages: [
            { role: 'user', content: 'Hello' },
            { role: 'assistant', content: 'Hi!' },
          ],
          enable_thinking: true,
          reasoning_effort: 'high',
          max_completion_tokens: 2000,
        }),
      );

      const result = transformMoonshotRequestBody(body);
      const parsed = JSON.parse(result.toString());

      expect(parsed.enable_thinking).toBeUndefined();
      expect(parsed.reasoning_effort).toBeUndefined();
      expect(parsed.max_completion_tokens).toBeUndefined();
      expect(parsed.max_tokens).toBe(2000);
      expect(parsed.messages[1].reasoning_content).toBeDefined();
    });
  });

  describe('ensureMoonshotProxy', () => {
    it('should start proxy server and return proxy info', async () => {
      const result = await ensureMoonshotProxy('https://api.moonshot.cn');

      expect(result.baseURL).toBe('http://127.0.0.1:9229');
      expect(result.targetBaseURL).toBe('https://api.moonshot.cn');
      expect(result.port).toBe(9229);
    });

    it('should reuse existing proxy server', async () => {
      const result1 = await ensureMoonshotProxy('https://api.moonshot.cn');
      const result2 = await ensureMoonshotProxy('https://api.moonshot.cn/v2');

      expect(result1.baseURL).toBe(result2.baseURL);
      expect(result2.targetBaseURL).toBe('https://api.moonshot.cn/v2');
    });

    it('should normalize URL by removing trailing slash', async () => {
      const result = await ensureMoonshotProxy('https://api.moonshot.cn/');

      expect(result.targetBaseURL).toBe('https://api.moonshot.cn');
    });

    it('should throw for invalid URL', async () => {
      await expect(ensureMoonshotProxy('not-a-url')).rejects.toThrow('Invalid URL format');
    });

    it('should throw for unsupported protocol', async () => {
      await expect(ensureMoonshotProxy('ftp://api.moonshot.cn')).rejects.toThrow(
        'Invalid protocol: ftp:',
      );
    });
  });

  describe('stopMoonshotProxy', () => {
    it('should stop running proxy', async () => {
      await ensureMoonshotProxy('https://api.moonshot.cn');
      expect(isMoonshotProxyRunning()).toBe(true);

      await stopMoonshotProxy();

      expect(isMoonshotProxyRunning()).toBe(false);
    });

    it('should not throw when proxy not running', async () => {
      await stopMoonshotProxy();

      expect(isMoonshotProxyRunning()).toBe(false);
    });
  });

  describe('isMoonshotProxyRunning', () => {
    it('should return false initially', () => {
      expect(isMoonshotProxyRunning()).toBe(false);
    });

    it('should return true after starting proxy', async () => {
      await ensureMoonshotProxy('https://api.moonshot.cn');

      expect(isMoonshotProxyRunning()).toBe(true);
    });
  });
});
