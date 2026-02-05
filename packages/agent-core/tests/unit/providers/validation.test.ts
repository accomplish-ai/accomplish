import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { validateApiKey, type ValidationResult } from '../../../src/providers/validation.js';

describe('API Key Validation', () => {
  beforeEach(() => {
    // Mock fetch globally
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('validateApiKey', () => {
    describe('Anthropic', () => {
      it('should validate Anthropic key successfully', async () => {
        vi.mocked(fetch).mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'msg_123' }),
        } as Response);

        const result = await validateApiKey('anthropic', 'sk-ant-test-key');

        expect(result.valid).toBe(true);
        expect(fetch).toHaveBeenCalledWith(
          'https://api.anthropic.com/v1/messages',
          expect.objectContaining({
            method: 'POST',
            headers: expect.objectContaining({
              'x-api-key': 'sk-ant-test-key',
              'anthropic-version': '2023-06-01',
            }),
          })
        );
      });

      it('should return error for invalid Anthropic key', async () => {
        vi.mocked(fetch).mockResolvedValueOnce({
          ok: false,
          status: 401,
          json: async () => ({ error: { message: 'Invalid API key' } }),
        } as Response);

        const result = await validateApiKey('anthropic', 'invalid-key');

        expect(result.valid).toBe(false);
        expect(result.error).toBe('Invalid API key');
      });
    });

    describe('OpenAI', () => {
      it('should validate OpenAI key successfully', async () => {
        vi.mocked(fetch).mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: [] }),
        } as Response);

        const result = await validateApiKey('openai', 'sk-test-key');

        expect(result.valid).toBe(true);
        expect(fetch).toHaveBeenCalledWith(
          'https://api.openai.com/v1/models',
          expect.objectContaining({
            method: 'GET',
            headers: expect.objectContaining({
              Authorization: 'Bearer sk-test-key',
            }),
          })
        );
      });

      it('should return error for invalid OpenAI key', async () => {
        vi.mocked(fetch).mockResolvedValueOnce({
          ok: false,
          status: 401,
          json: async () => ({ error: { message: 'Incorrect API key' } }),
        } as Response);

        const result = await validateApiKey('openai', 'invalid-key');

        expect(result.valid).toBe(false);
        expect(result.error).toBe('Invalid API key');
      });

      it('should use custom base URL when provided', async () => {
        vi.mocked(fetch).mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: [] }),
        } as Response);

        await validateApiKey('openai', 'sk-test-key', {
          baseUrl: 'https://custom.openai.com/v1/',
        });

        expect(fetch).toHaveBeenCalledWith(
          'https://custom.openai.com/v1/models',
          expect.anything()
        );
      });
    });

    describe('Google', () => {
      it('should validate Google key successfully', async () => {
        vi.mocked(fetch).mockResolvedValueOnce({
          ok: true,
          json: async () => ({ models: [] }),
        } as Response);

        const result = await validateApiKey('google', 'AIza-test-key');

        expect(result.valid).toBe(true);
        expect(fetch).toHaveBeenCalledWith(
          'https://generativelanguage.googleapis.com/v1beta/models?key=AIza-test-key',
          expect.objectContaining({
            method: 'GET',
          })
        );
      });
    });

    describe('xAI', () => {
      it('should validate xAI key successfully', async () => {
        vi.mocked(fetch).mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: [] }),
        } as Response);

        const result = await validateApiKey('xai', 'xai-test-key');

        expect(result.valid).toBe(true);
        expect(fetch).toHaveBeenCalledWith(
          'https://api.x.ai/v1/models',
          expect.objectContaining({
            method: 'GET',
            headers: expect.objectContaining({
              Authorization: 'Bearer xai-test-key',
            }),
          })
        );
      });
    });

    describe('DeepSeek', () => {
      it('should validate DeepSeek key successfully', async () => {
        vi.mocked(fetch).mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: [] }),
        } as Response);

        const result = await validateApiKey('deepseek', 'sk-deepseek-key');

        expect(result.valid).toBe(true);
        expect(fetch).toHaveBeenCalledWith(
          'https://api.deepseek.com/models',
          expect.anything()
        );
      });
    });

    describe('OpenRouter', () => {
      it('should validate OpenRouter key successfully', async () => {
        vi.mocked(fetch).mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: {} }),
        } as Response);

        const result = await validateApiKey('openrouter', 'sk-or-key');

        expect(result.valid).toBe(true);
        expect(fetch).toHaveBeenCalledWith(
          'https://openrouter.ai/api/v1/auth/key',
          expect.anything()
        );
      });
    });

    describe('Moonshot', () => {
      it('should validate Moonshot key successfully', async () => {
        vi.mocked(fetch).mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'chat-123' }),
        } as Response);

        const result = await validateApiKey('moonshot', 'sk-moonshot-key');

        expect(result.valid).toBe(true);
        expect(fetch).toHaveBeenCalledWith(
          'https://api.moonshot.ai/v1/chat/completions',
          expect.objectContaining({
            method: 'POST',
          })
        );
      });
    });

    describe('Z.AI', () => {
      it('should validate Z.AI key with default region', async () => {
        vi.mocked(fetch).mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: [] }),
        } as Response);

        const result = await validateApiKey('zai', 'zai-test-key');

        expect(result.valid).toBe(true);
        // Should use international endpoint by default
        expect(fetch).toHaveBeenCalledWith(
          expect.stringContaining('models'),
          expect.anything()
        );
      });

      it('should use china region when specified', async () => {
        vi.mocked(fetch).mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: [] }),
        } as Response);

        await validateApiKey('zai', 'zai-test-key', { zaiRegion: 'china' });

        expect(fetch).toHaveBeenCalled();
      });
    });

    describe('MiniMax', () => {
      it('should validate MiniMax key successfully', async () => {
        vi.mocked(fetch).mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'msg-123' }),
        } as Response);

        const result = await validateApiKey('minimax', 'minimax-key');

        expect(result.valid).toBe(true);
        expect(fetch).toHaveBeenCalledWith(
          'https://api.minimax.io/anthropic/v1/messages',
          expect.objectContaining({
            method: 'POST',
            headers: expect.objectContaining({
              Authorization: 'Bearer minimax-key',
              'anthropic-version': '2023-06-01',
            }),
          })
        );
      });
    });

    describe('Providers without API validation', () => {
      it('should skip validation for Ollama', async () => {
        const result = await validateApiKey('ollama', 'any-key');

        expect(result.valid).toBe(true);
        expect(fetch).not.toHaveBeenCalled();
      });

      it('should skip validation for Bedrock', async () => {
        const result = await validateApiKey('bedrock', 'any-key');

        expect(result.valid).toBe(true);
        expect(fetch).not.toHaveBeenCalled();
      });

      it('should skip validation for Azure Foundry', async () => {
        const result = await validateApiKey('azure-foundry', 'any-key');

        expect(result.valid).toBe(true);
        expect(fetch).not.toHaveBeenCalled();
      });

      it('should skip validation for LiteLLM', async () => {
        const result = await validateApiKey('litellm', 'any-key');

        expect(result.valid).toBe(true);
        expect(fetch).not.toHaveBeenCalled();
      });

      it('should skip validation for LM Studio', async () => {
        const result = await validateApiKey('lmstudio', 'any-key');

        expect(result.valid).toBe(true);
        expect(fetch).not.toHaveBeenCalled();
      });

      it('should skip validation for custom provider', async () => {
        const result = await validateApiKey('custom', 'any-key');

        expect(result.valid).toBe(true);
        expect(fetch).not.toHaveBeenCalled();
      });
    });

    describe('Error handling', () => {
      it('should handle network errors', async () => {
        vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'));

        const result = await validateApiKey('anthropic', 'sk-test-key');

        expect(result.valid).toBe(false);
        expect(result.error).toContain('Failed to validate');
      });

      it('should handle timeout errors', async () => {
        const abortError = new Error('The operation was aborted');
        abortError.name = 'AbortError';
        vi.mocked(fetch).mockRejectedValueOnce(abortError);

        const result = await validateApiKey('anthropic', 'sk-test-key');

        expect(result.valid).toBe(false);
        expect(result.error).toContain('timed out');
      });

      it('should handle non-401 error responses', async () => {
        vi.mocked(fetch).mockResolvedValueOnce({
          ok: false,
          status: 500,
          json: async () => ({ error: { message: 'Internal server error' } }),
        } as Response);

        const result = await validateApiKey('anthropic', 'sk-test-key');

        expect(result.valid).toBe(false);
        expect(result.error).toBe('Internal server error');
      });

      it('should handle error response without message', async () => {
        vi.mocked(fetch).mockResolvedValueOnce({
          ok: false,
          status: 500,
          json: async () => ({}),
        } as Response);

        const result = await validateApiKey('anthropic', 'sk-test-key');

        expect(result.valid).toBe(false);
        expect(result.error).toContain('status 500');
      });

      it('should handle JSON parse errors', async () => {
        vi.mocked(fetch).mockResolvedValueOnce({
          ok: false,
          status: 500,
          json: async () => {
            throw new Error('Invalid JSON');
          },
        } as Response);

        const result = await validateApiKey('anthropic', 'sk-test-key');

        expect(result.valid).toBe(false);
        expect(result.error).toContain('status 500');
      });
    });

    describe('Timeout configuration', () => {
      it('should use custom timeout when provided', async () => {
        vi.mocked(fetch).mockResolvedValueOnce({
          ok: true,
          json: async () => ({}),
        } as Response);

        await validateApiKey('anthropic', 'sk-test-key', { timeout: 5000 });

        // Verify fetch was called with signal (for abort controller)
        expect(fetch).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            signal: expect.any(AbortSignal),
          })
        );
      });
    });
  });
});
