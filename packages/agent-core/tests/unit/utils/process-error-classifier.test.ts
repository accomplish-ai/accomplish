import { describe, it, expect } from 'vitest';
import { classifyProcessError } from '../../../src/internal/utils/process-error-classifier.js';

describe('classifyProcessError', () => {
  describe('quota / billing patterns', () => {
    it('matches insufficient_quota', () => {
      const result = classifyProcessError(1, 'Error: insufficient_quota reached');
      expect(result).toContain('quota');
    });

    it('matches exceeded your current quota', () => {
      const result = classifyProcessError(
        1,
        'You exceeded your current quota, please check your plan',
      );
      expect(result).toContain('quota');
    });

    it('matches billing_hard_limit_reached', () => {
      const result = classifyProcessError(1, 'billing_hard_limit_reached for this account');
      expect(result).toContain('quota');
    });

    it('matches insufficient credits', () => {
      const result = classifyProcessError(
        1,
        'You have insufficient credits to complete this request',
      );
      expect(result).toContain('quota');
    });

    it('matches resource_exhausted (Gemini quota)', () => {
      const result = classifyProcessError(1, 'RESOURCE_EXHAUSTED: quota exceeded');
      expect(result).toContain('quota');
      // Must NOT be classified as rate limit
      expect(result).not.toContain('Rate limit');
    });
  });

  describe('rate limit patterns', () => {
    it('matches rate limit', () => {
      const result = classifyProcessError(1, 'Error: rate limit exceeded');
      expect(result).toContain('Rate limit');
    });

    it('matches ratelimit', () => {
      const result = classifyProcessError(1, 'ratelimit error from provider');
      expect(result).toContain('Rate limit');
    });

    it('matches too many requests', () => {
      const result = classifyProcessError(1, 'Error: too many requests sent');
      expect(result).toContain('Rate limit');
    });

    it('matches HTTP 429 status code', () => {
      const result = classifyProcessError(1, 'HTTP status 429 received from API');
      expect(result).toContain('Rate limit');
    });
  });

  describe('authentication patterns', () => {
    it('matches invalid_api_key', () => {
      const result = classifyProcessError(1, 'Error: invalid_api_key provided');
      expect(result).toContain('API key');
    });

    it('matches incorrect api key', () => {
      const result = classifyProcessError(1, 'Incorrect api key provided');
      expect(result).toContain('API key');
    });

    it('matches unauthenticated', () => {
      const result = classifyProcessError(1, 'unauthenticated request received');
      expect(result).toContain('API key');
    });

    it('matches unauthorized', () => {
      const result = classifyProcessError(1, 'unauthorized access attempt');
      expect(result).toContain('API key');
    });

    it('matches authentication failed', () => {
      const result = classifyProcessError(1, 'authentication failed for user');
      expect(result).toContain('API key');
    });
  });

  describe('network patterns', () => {
    it('matches ECONNREFUSED', () => {
      const result = classifyProcessError(1, 'Error: ECONNREFUSED 127.0.0.1:8080');
      expect(result).toContain('Network error');
    });

    it('matches ENOTFOUND', () => {
      const result = classifyProcessError(1, 'Error: ENOTFOUND api.openai.com');
      expect(result).toContain('Network error');
    });

    it('matches network error', () => {
      const result = classifyProcessError(1, 'A network error occurred');
      expect(result).toContain('Network error');
    });

    it('matches connection refused', () => {
      const result = classifyProcessError(1, 'connection refused to upstream server');
      expect(result).toContain('Network error');
    });
  });

  describe('model not found patterns', () => {
    it('matches model_not_found', () => {
      const result = classifyProcessError(1, 'Error: model_not_found for gpt-5');
      expect(result).toContain('Model not found');
    });

    it('matches model not found', () => {
      const result = classifyProcessError(1, 'model not found in registry');
      expect(result).toContain('Model not found');
    });

    it('matches no such model', () => {
      const result = classifyProcessError(1, 'no such model: claude-4-opus');
      expect(result).toContain('Model not found');
    });
  });

  describe('context length patterns', () => {
    it('matches context_length_exceeded', () => {
      const result = classifyProcessError(1, 'Error: context_length_exceeded for this model');
      expect(result).toContain('too long');
    });

    it('matches maximum context length', () => {
      const result = classifyProcessError(1, 'maximum context length reached');
      expect(result).toContain('too long');
    });

    it('matches context window', () => {
      const result = classifyProcessError(1, 'context window exceeded');
      expect(result).toContain('too long');
    });

    it('matches too many tokens', () => {
      const result = classifyProcessError(1, 'too many tokens in the request');
      expect(result).toContain('too long');
    });
  });

  describe('fallback', () => {
    it('returns generic message for empty buffer', () => {
      const result = classifyProcessError(undefined, '');
      expect(result).toContain('Task failed');
    });

    it('returns exit-code message when exit code is provided', () => {
      const result = classifyProcessError(1, 'some unknown error');
      expect(result).toContain('exit code 1');
    });

    it('returns generic message when exit code is undefined and no pattern matches', () => {
      const result = classifyProcessError(undefined, 'some unknown error');
      expect(result).toBe('Task failed. Check the debug panel for details.');
    });
  });
});
