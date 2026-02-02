/**
 * Unit tests for provider registry
 *
 * Tests the provider registry which maps provider IDs to their specifications,
 * including URL generation, special provider identification, and model ID utilities.
 *
 * @module config-generator/providers/registry.unit.test
 */

import { describe, it, expect } from 'vitest';
import type { OllamaCredentials, LiteLLMCredentials, LMStudioCredentials } from '@accomplish/shared';

import {
  PROVIDER_SPECS,
  SPECIAL_PROVIDERS,
  STANDARD_PROVIDER_IDS,
  getProviderSpec,
  isSpecialProvider,
  isStandardProvider,
  getStandardProviderIds,
  stripModelIdPrefix,
  addModelIdPrefix,
  getBaseURL,
} from '../../../../../../src/main/opencode/config-generator/providers/registry';

describe('provider registry', () => {
  describe('PROVIDER_SPECS', () => {
    describe('ollama spec', () => {
      it('should have spec for ollama', () => {
        expect(PROVIDER_SPECS.ollama).toBeDefined();
      });

      it('should have correct id', () => {
        expect(PROVIDER_SPECS.ollama.id).toBe('ollama');
      });

      it('should have correct openCodeId', () => {
        expect(PROVIDER_SPECS.ollama.openCodeId).toBe('ollama');
      });

      it('should have correct displayName', () => {
        expect(PROVIDER_SPECS.ollama.displayName).toBe('Ollama (local)');
      });

      it('should have correct npm package', () => {
        expect(PROVIDER_SPECS.ollama.npm).toBe('@ai-sdk/openai-compatible');
      });

      it('should have correct credentialsType', () => {
        expect(PROVIDER_SPECS.ollama.credentialsType).toBe('ollama');
      });

      it('should have correct modelIdPrefix', () => {
        expect(PROVIDER_SPECS.ollama.modelIdPrefix).toBe('ollama/');
      });

      it('should not require API key', () => {
        expect(PROVIDER_SPECS.ollama.requiresApiKey).toBe(false);
      });

      it('should have defaultToolSupport as true', () => {
        expect(PROVIDER_SPECS.ollama.defaultToolSupport).toBe(true);
      });
    });

    describe('openrouter spec', () => {
      it('should have spec for openrouter', () => {
        expect(PROVIDER_SPECS.openrouter).toBeDefined();
      });

      it('should have correct id', () => {
        expect(PROVIDER_SPECS.openrouter.id).toBe('openrouter');
      });

      it('should have correct openCodeId', () => {
        expect(PROVIDER_SPECS.openrouter.openCodeId).toBe('openrouter');
      });

      it('should have correct displayName', () => {
        expect(PROVIDER_SPECS.openrouter.displayName).toBe('OpenRouter');
      });

      it('should have correct npm package', () => {
        expect(PROVIDER_SPECS.openrouter.npm).toBe('@ai-sdk/openai-compatible');
      });

      it('should have correct credentialsType', () => {
        expect(PROVIDER_SPECS.openrouter.credentialsType).toBe('openrouter');
      });

      it('should have correct modelIdPrefix', () => {
        expect(PROVIDER_SPECS.openrouter.modelIdPrefix).toBe('openrouter/');
      });

      it('should require API key', () => {
        expect(PROVIDER_SPECS.openrouter.requiresApiKey).toBe(true);
      });

      it('should have defaultToolSupport as true', () => {
        expect(PROVIDER_SPECS.openrouter.defaultToolSupport).toBe(true);
      });
    });

    describe('moonshot spec', () => {
      it('should have spec for moonshot', () => {
        expect(PROVIDER_SPECS.moonshot).toBeDefined();
      });

      it('should have correct id', () => {
        expect(PROVIDER_SPECS.moonshot.id).toBe('moonshot');
      });

      it('should have correct openCodeId', () => {
        expect(PROVIDER_SPECS.moonshot.openCodeId).toBe('moonshot');
      });

      it('should have correct displayName', () => {
        expect(PROVIDER_SPECS.moonshot.displayName).toBe('Moonshot AI');
      });

      it('should have correct npm package', () => {
        expect(PROVIDER_SPECS.moonshot.npm).toBe('@ai-sdk/openai-compatible');
      });

      it('should have correct credentialsType', () => {
        expect(PROVIDER_SPECS.moonshot.credentialsType).toBe('api_key');
      });

      it('should have correct modelIdPrefix', () => {
        expect(PROVIDER_SPECS.moonshot.modelIdPrefix).toBe('moonshot/');
      });

      it('should require API key', () => {
        expect(PROVIDER_SPECS.moonshot.requiresApiKey).toBe(true);
      });

      it('should have defaultToolSupport as true', () => {
        expect(PROVIDER_SPECS.moonshot.defaultToolSupport).toBe(true);
      });
    });

    describe('litellm spec', () => {
      it('should have spec for litellm', () => {
        expect(PROVIDER_SPECS.litellm).toBeDefined();
      });

      it('should have correct id', () => {
        expect(PROVIDER_SPECS.litellm.id).toBe('litellm');
      });

      it('should have correct openCodeId', () => {
        expect(PROVIDER_SPECS.litellm.openCodeId).toBe('litellm');
      });

      it('should have correct displayName', () => {
        expect(PROVIDER_SPECS.litellm.displayName).toBe('LiteLLM');
      });

      it('should have correct npm package', () => {
        expect(PROVIDER_SPECS.litellm.npm).toBe('@ai-sdk/openai-compatible');
      });

      it('should have correct credentialsType', () => {
        expect(PROVIDER_SPECS.litellm.credentialsType).toBe('litellm');
      });

      it('should have correct modelIdPrefix', () => {
        expect(PROVIDER_SPECS.litellm.modelIdPrefix).toBe('litellm/');
      });

      it('should have requiresApiKey as false (optional)', () => {
        expect(PROVIDER_SPECS.litellm.requiresApiKey).toBe(false);
      });

      it('should have defaultToolSupport as true', () => {
        expect(PROVIDER_SPECS.litellm.defaultToolSupport).toBe(true);
      });
    });

    describe('lmstudio spec', () => {
      it('should have spec for lmstudio', () => {
        expect(PROVIDER_SPECS.lmstudio).toBeDefined();
      });

      it('should have correct id', () => {
        expect(PROVIDER_SPECS.lmstudio.id).toBe('lmstudio');
      });

      it('should have correct openCodeId', () => {
        expect(PROVIDER_SPECS.lmstudio.openCodeId).toBe('lmstudio');
      });

      it('should have correct displayName', () => {
        expect(PROVIDER_SPECS.lmstudio.displayName).toBe('LM Studio');
      });

      it('should have correct npm package', () => {
        expect(PROVIDER_SPECS.lmstudio.npm).toBe('@ai-sdk/openai-compatible');
      });

      it('should have correct credentialsType', () => {
        expect(PROVIDER_SPECS.lmstudio.credentialsType).toBe('lmstudio');
      });

      it('should have correct modelIdPrefix', () => {
        expect(PROVIDER_SPECS.lmstudio.modelIdPrefix).toBe('lmstudio/');
      });

      it('should not require API key', () => {
        expect(PROVIDER_SPECS.lmstudio.requiresApiKey).toBe(false);
      });

      it('should have defaultToolSupport as false (varies by model)', () => {
        expect(PROVIDER_SPECS.lmstudio.defaultToolSupport).toBe(false);
      });
    });

    describe('all specs have required fields', () => {
      const requiredFields = [
        'id',
        'openCodeId',
        'displayName',
        'npm',
        'credentialsType',
        'modelIdPrefix',
        'requiresApiKey',
        'defaultToolSupport',
      ] as const;

      for (const providerId of Object.keys(PROVIDER_SPECS)) {
        describe(`${providerId} spec`, () => {
          for (const field of requiredFields) {
            it(`should have ${field} field`, () => {
              expect(PROVIDER_SPECS[providerId]).toHaveProperty(field);
            });
          }
        });
      }
    });
  });

  describe('getBaseURL', () => {
    describe('ollama', () => {
      it('should return serverUrl + /v1 for ollama', () => {
        const credentials: OllamaCredentials = {
          type: 'ollama',
          serverUrl: 'http://localhost:11434',
        };

        const result = getBaseURL('ollama', credentials);

        expect(result).toBe('http://localhost:11434/v1');
      });

      it('should handle trailing slash in serverUrl', () => {
        const credentials: OllamaCredentials = {
          type: 'ollama',
          serverUrl: 'http://localhost:11434/',
        };

        const result = getBaseURL('ollama', credentials);

        expect(result).toBe('http://localhost:11434/v1');
      });

      it('should handle custom port', () => {
        const credentials: OllamaCredentials = {
          type: 'ollama',
          serverUrl: 'http://192.168.1.100:8080',
        };

        const result = getBaseURL('ollama', credentials);

        expect(result).toBe('http://192.168.1.100:8080/v1');
      });
    });

    describe('openrouter', () => {
      it('should return fixed OpenRouter URL', () => {
        const credentials = { type: 'openrouter' as const, keyPrefix: 'sk-***' };

        const result = getBaseURL('openrouter', credentials);

        expect(result).toBe('https://openrouter.ai/api/v1');
      });

      it('should ignore credentials and always return same URL', () => {
        const result = getBaseURL('openrouter', undefined);

        expect(result).toBe('https://openrouter.ai/api/v1');
      });
    });

    describe('moonshot', () => {
      it('should return default Moonshot URL when no proxy', () => {
        const credentials = { type: 'api_key' as const, keyPrefix: 'sk-***' };

        const result = getBaseURL('moonshot', credentials);

        expect(result).toBe('https://api.moonshot.ai/v1');
      });

      it('should return proxy URL when proxy is provided', () => {
        const credentials = { type: 'api_key' as const, keyPrefix: 'sk-***' };

        const result = getBaseURL('moonshot', credentials, 'http://localhost:3000/proxy');

        expect(result).toBe('http://localhost:3000/proxy');
      });
    });

    describe('litellm', () => {
      it('should return serverUrl + /v1 for litellm', () => {
        const credentials: LiteLLMCredentials = {
          type: 'litellm',
          serverUrl: 'http://localhost:4000',
          hasApiKey: false,
        };

        const result = getBaseURL('litellm', credentials);

        expect(result).toBe('http://localhost:4000/v1');
      });

      it('should handle trailing slash in serverUrl', () => {
        const credentials: LiteLLMCredentials = {
          type: 'litellm',
          serverUrl: 'http://localhost:4000/',
          hasApiKey: true,
          keyPrefix: 'sk-***',
        };

        const result = getBaseURL('litellm', credentials);

        expect(result).toBe('http://localhost:4000/v1');
      });
    });

    describe('lmstudio', () => {
      it('should return serverUrl + /v1 for lmstudio', () => {
        const credentials: LMStudioCredentials = {
          type: 'lmstudio',
          serverUrl: 'http://localhost:1234',
        };

        const result = getBaseURL('lmstudio', credentials);

        expect(result).toBe('http://localhost:1234/v1');
      });

      it('should handle trailing slash in serverUrl', () => {
        const credentials: LMStudioCredentials = {
          type: 'lmstudio',
          serverUrl: 'http://localhost:1234/',
        };

        const result = getBaseURL('lmstudio', credentials);

        expect(result).toBe('http://localhost:1234/v1');
      });
    });

    describe('unknown provider', () => {
      it('should return undefined for unknown provider', () => {
        const result = getBaseURL('unknown-provider', undefined);

        expect(result).toBeUndefined();
      });
    });
  });

  describe('SPECIAL_PROVIDERS', () => {
    it('should contain bedrock', () => {
      expect(SPECIAL_PROVIDERS).toContain('bedrock');
    });

    it('should contain azure-foundry', () => {
      expect(SPECIAL_PROVIDERS).toContain('azure-foundry');
    });

    it('should contain zai', () => {
      expect(SPECIAL_PROVIDERS).toContain('zai');
    });

    it('should have exactly 3 special providers', () => {
      expect(SPECIAL_PROVIDERS).toHaveLength(3);
    });

    it('should NOT contain ollama (standard provider)', () => {
      expect(SPECIAL_PROVIDERS).not.toContain('ollama');
    });

    it('should NOT contain openrouter (standard provider)', () => {
      expect(SPECIAL_PROVIDERS).not.toContain('openrouter');
    });

    it('should NOT contain moonshot (standard provider)', () => {
      expect(SPECIAL_PROVIDERS).not.toContain('moonshot');
    });

    it('should NOT contain litellm (standard provider)', () => {
      expect(SPECIAL_PROVIDERS).not.toContain('litellm');
    });

    it('should NOT contain lmstudio (standard provider)', () => {
      expect(SPECIAL_PROVIDERS).not.toContain('lmstudio');
    });
  });

  describe('STANDARD_PROVIDER_IDS', () => {
    it('should contain ollama', () => {
      expect(STANDARD_PROVIDER_IDS).toContain('ollama');
    });

    it('should contain openrouter', () => {
      expect(STANDARD_PROVIDER_IDS).toContain('openrouter');
    });

    it('should contain moonshot', () => {
      expect(STANDARD_PROVIDER_IDS).toContain('moonshot');
    });

    it('should contain litellm', () => {
      expect(STANDARD_PROVIDER_IDS).toContain('litellm');
    });

    it('should contain lmstudio', () => {
      expect(STANDARD_PROVIDER_IDS).toContain('lmstudio');
    });

    it('should have exactly 5 standard providers', () => {
      expect(STANDARD_PROVIDER_IDS).toHaveLength(5);
    });
  });

  describe('getProviderSpec', () => {
    it('should return spec for ollama', () => {
      const spec = getProviderSpec('ollama');

      expect(spec).toBeDefined();
      expect(spec?.id).toBe('ollama');
    });

    it('should return spec for openrouter', () => {
      const spec = getProviderSpec('openrouter');

      expect(spec).toBeDefined();
      expect(spec?.id).toBe('openrouter');
    });

    it('should return spec for moonshot', () => {
      const spec = getProviderSpec('moonshot');

      expect(spec).toBeDefined();
      expect(spec?.id).toBe('moonshot');
    });

    it('should return spec for litellm', () => {
      const spec = getProviderSpec('litellm');

      expect(spec).toBeDefined();
      expect(spec?.id).toBe('litellm');
    });

    it('should return spec for lmstudio', () => {
      const spec = getProviderSpec('lmstudio');

      expect(spec).toBeDefined();
      expect(spec?.id).toBe('lmstudio');
    });

    it('should return undefined for invalid provider id', () => {
      const spec = getProviderSpec('invalid-provider');

      expect(spec).toBeUndefined();
    });

    it('should return undefined for empty string', () => {
      const spec = getProviderSpec('');

      expect(spec).toBeUndefined();
    });

    it('should return undefined for special provider (bedrock)', () => {
      const spec = getProviderSpec('bedrock');

      expect(spec).toBeUndefined();
    });

    it('should return undefined for special provider (azure-foundry)', () => {
      const spec = getProviderSpec('azure-foundry');

      expect(spec).toBeUndefined();
    });

    it('should return undefined for special provider (zai)', () => {
      const spec = getProviderSpec('zai');

      expect(spec).toBeUndefined();
    });
  });

  describe('isSpecialProvider', () => {
    it('should return true for bedrock', () => {
      expect(isSpecialProvider('bedrock')).toBe(true);
    });

    it('should return true for azure-foundry', () => {
      expect(isSpecialProvider('azure-foundry')).toBe(true);
    });

    it('should return true for zai', () => {
      expect(isSpecialProvider('zai')).toBe(true);
    });

    it('should return false for ollama', () => {
      expect(isSpecialProvider('ollama')).toBe(false);
    });

    it('should return false for openrouter', () => {
      expect(isSpecialProvider('openrouter')).toBe(false);
    });

    it('should return false for moonshot', () => {
      expect(isSpecialProvider('moonshot')).toBe(false);
    });

    it('should return false for litellm', () => {
      expect(isSpecialProvider('litellm')).toBe(false);
    });

    it('should return false for lmstudio', () => {
      expect(isSpecialProvider('lmstudio')).toBe(false);
    });

    it('should return false for unknown provider', () => {
      expect(isSpecialProvider('unknown')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isSpecialProvider('')).toBe(false);
    });
  });

  describe('isStandardProvider', () => {
    it('should return true for ollama', () => {
      expect(isStandardProvider('ollama')).toBe(true);
    });

    it('should return true for openrouter', () => {
      expect(isStandardProvider('openrouter')).toBe(true);
    });

    it('should return true for moonshot', () => {
      expect(isStandardProvider('moonshot')).toBe(true);
    });

    it('should return true for litellm', () => {
      expect(isStandardProvider('litellm')).toBe(true);
    });

    it('should return true for lmstudio', () => {
      expect(isStandardProvider('lmstudio')).toBe(true);
    });

    it('should return false for bedrock', () => {
      expect(isStandardProvider('bedrock')).toBe(false);
    });

    it('should return false for azure-foundry', () => {
      expect(isStandardProvider('azure-foundry')).toBe(false);
    });

    it('should return false for zai', () => {
      expect(isStandardProvider('zai')).toBe(false);
    });

    it('should return false for unknown provider', () => {
      expect(isStandardProvider('unknown')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isStandardProvider('')).toBe(false);
    });
  });

  describe('getStandardProviderIds', () => {
    it('should return array of standard provider IDs', () => {
      const ids = getStandardProviderIds();

      expect(Array.isArray(ids)).toBe(true);
      expect(ids.length).toBeGreaterThan(0);
    });

    it('should include ollama', () => {
      const ids = getStandardProviderIds();

      expect(ids).toContain('ollama');
    });

    it('should include openrouter', () => {
      const ids = getStandardProviderIds();

      expect(ids).toContain('openrouter');
    });

    it('should include moonshot', () => {
      const ids = getStandardProviderIds();

      expect(ids).toContain('moonshot');
    });

    it('should include litellm', () => {
      const ids = getStandardProviderIds();

      expect(ids).toContain('litellm');
    });

    it('should include lmstudio', () => {
      const ids = getStandardProviderIds();

      expect(ids).toContain('lmstudio');
    });

    it('should NOT include bedrock', () => {
      const ids = getStandardProviderIds();

      expect(ids).not.toContain('bedrock');
    });

    it('should NOT include azure-foundry', () => {
      const ids = getStandardProviderIds();

      expect(ids).not.toContain('azure-foundry');
    });

    it('should NOT include zai', () => {
      const ids = getStandardProviderIds();

      expect(ids).not.toContain('zai');
    });

    it('should return exactly 5 providers', () => {
      const ids = getStandardProviderIds();

      expect(ids).toHaveLength(5);
    });
  });

  describe('stripModelIdPrefix', () => {
    it('should strip ollama/ prefix', () => {
      const result = stripModelIdPrefix('ollama/llama3');

      expect(result).toBe('llama3');
    });

    it('should strip openrouter/ prefix', () => {
      const result = stripModelIdPrefix('openrouter/anthropic/claude-3-opus');

      expect(result).toBe('anthropic/claude-3-opus');
    });

    it('should strip moonshot/ prefix', () => {
      const result = stripModelIdPrefix('moonshot/kimi-latest');

      expect(result).toBe('kimi-latest');
    });

    it('should strip litellm/ prefix', () => {
      const result = stripModelIdPrefix('litellm/gpt-4');

      expect(result).toBe('gpt-4');
    });

    it('should strip lmstudio/ prefix', () => {
      const result = stripModelIdPrefix('lmstudio/local-model');

      expect(result).toBe('local-model');
    });

    it('should return modelId unchanged if no prefix', () => {
      const result = stripModelIdPrefix('llama3');

      expect(result).toBe('llama3');
    });

    it('should return modelId unchanged if prefix is not a known provider', () => {
      const result = stripModelIdPrefix('unknown/model');

      expect(result).toBe('unknown/model');
    });

    it('should handle empty string', () => {
      const result = stripModelIdPrefix('');

      expect(result).toBe('');
    });

    it('should handle model with multiple slashes after prefix', () => {
      const result = stripModelIdPrefix('openrouter/meta/llama-3.1/70b');

      expect(result).toBe('meta/llama-3.1/70b');
    });

    it('should be case-sensitive for prefix', () => {
      const result = stripModelIdPrefix('OLLAMA/llama3');

      expect(result).toBe('OLLAMA/llama3');
    });
  });

  describe('addModelIdPrefix', () => {
    it('should add ollama prefix', () => {
      const result = addModelIdPrefix('ollama', 'llama3');

      expect(result).toBe('ollama/llama3');
    });

    it('should add openrouter prefix', () => {
      const result = addModelIdPrefix('openrouter', 'anthropic/claude-3-opus');

      expect(result).toBe('openrouter/anthropic/claude-3-opus');
    });

    it('should add moonshot prefix', () => {
      const result = addModelIdPrefix('moonshot', 'kimi-latest');

      expect(result).toBe('moonshot/kimi-latest');
    });

    it('should add litellm prefix', () => {
      const result = addModelIdPrefix('litellm', 'gpt-4');

      expect(result).toBe('litellm/gpt-4');
    });

    it('should add lmstudio prefix', () => {
      const result = addModelIdPrefix('lmstudio', 'local-model');

      expect(result).toBe('lmstudio/local-model');
    });

    it('should not double-add prefix if already present', () => {
      const result = addModelIdPrefix('ollama', 'ollama/llama3');

      expect(result).toBe('ollama/llama3');
    });

    it('should handle empty modelId', () => {
      const result = addModelIdPrefix('ollama', '');

      expect(result).toBe('ollama/');
    });

    it('should use generic prefix for unknown provider', () => {
      const result = addModelIdPrefix('unknown', 'model');

      expect(result).toBe('unknown/model');
    });
  });
});
