/**
 * Unit tests for Z.AI (ZAI) provider configuration builder
 *
 * Tests the buildZaiProviderConfig function which generates
 * Z.AI Coding Plan provider configuration for OpenCode CLI.
 *
 * Based on lines 863-890 of the original config-generator.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type {
  ConnectedProvider,
  ZaiCredentials,
  ProviderSettings,
} from '@accomplish/shared';

// Mock the secure storage module
vi.mock('../../../../../../src/main/store/secureStorage', () => ({
  getApiKey: vi.fn(),
}));

// Import after mocks are set up
import { buildZaiProviderConfig, ZAI_MODELS } from '../../../../../../src/main/opencode/config-generator/providers/zai';
import { getApiKey } from '../../../../../../src/main/store/secureStorage';

const mockGetApiKey = vi.mocked(getApiKey);

describe('buildZaiProviderConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('API key validation', () => {
    it('should return null when no API key is available', () => {
      mockGetApiKey.mockReturnValue(null);

      const result = buildZaiProviderConfig();

      expect(mockGetApiKey).toHaveBeenCalledWith('zai');
      expect(result).toBeNull();
    });

    it('should return null when API key is undefined', () => {
      mockGetApiKey.mockReturnValue(undefined);

      const result = buildZaiProviderConfig();

      expect(result).toBeNull();
    });

    it('should return null when API key is empty string', () => {
      mockGetApiKey.mockReturnValue('');

      const result = buildZaiProviderConfig();

      expect(result).toBeNull();
    });

    it('should return config when API key is available', () => {
      mockGetApiKey.mockReturnValue('zai-api-key-12345');

      const result = buildZaiProviderConfig();

      expect(result).not.toBeNull();
    });
  });

  describe('region-based URL selection', () => {
    it('should use international URL by default (no provider settings)', () => {
      mockGetApiKey.mockReturnValue('zai-api-key-12345');

      const result = buildZaiProviderConfig();

      expect(result).not.toBeNull();
      expect(result!.options.baseURL).toBe('https://api.z.ai/api/coding/paas/v4');
    });

    it('should use international URL when region is "international"', () => {
      mockGetApiKey.mockReturnValue('zai-api-key-12345');

      const providerSettings: Partial<ProviderSettings> = {
        connectedProviders: {
          zai: {
            providerId: 'zai',
            connectionStatus: 'connected',
            selectedModelId: 'zai/glm-4.7',
            credentials: {
              type: 'zai',
              keyPrefix: 'zai***',
              region: 'international',
            },
            lastConnectedAt: '2024-01-01T00:00:00Z',
          },
        },
      };

      const result = buildZaiProviderConfig(providerSettings as ProviderSettings);

      expect(result).not.toBeNull();
      expect(result!.options.baseURL).toBe('https://api.z.ai/api/coding/paas/v4');
    });

    it('should use China URL when region is "china"', () => {
      mockGetApiKey.mockReturnValue('zai-api-key-12345');

      const providerSettings: Partial<ProviderSettings> = {
        connectedProviders: {
          zai: {
            providerId: 'zai',
            connectionStatus: 'connected',
            selectedModelId: 'zai/glm-4.7',
            credentials: {
              type: 'zai',
              keyPrefix: 'zai***',
              region: 'china',
            },
            lastConnectedAt: '2024-01-01T00:00:00Z',
          },
        },
      };

      const result = buildZaiProviderConfig(providerSettings as ProviderSettings);

      expect(result).not.toBeNull();
      expect(result!.options.baseURL).toBe('https://open.bigmodel.cn/api/paas/v4');
    });

    it('should use international URL when zai credentials are not present', () => {
      mockGetApiKey.mockReturnValue('zai-api-key-12345');

      const providerSettings: Partial<ProviderSettings> = {
        connectedProviders: {},
      };

      const result = buildZaiProviderConfig(providerSettings as ProviderSettings);

      expect(result).not.toBeNull();
      expect(result!.options.baseURL).toBe('https://api.z.ai/api/coding/paas/v4');
    });

    it('should use international URL when credentials type is not zai', () => {
      mockGetApiKey.mockReturnValue('zai-api-key-12345');

      const providerSettings: Partial<ProviderSettings> = {
        connectedProviders: {
          zai: {
            providerId: 'zai',
            connectionStatus: 'connected',
            selectedModelId: 'zai/glm-4.7',
            credentials: {
              type: 'api_key',
              keyPrefix: 'sk-***',
            },
            lastConnectedAt: '2024-01-01T00:00:00Z',
          },
        },
      };

      const result = buildZaiProviderConfig(providerSettings as ProviderSettings);

      expect(result).not.toBeNull();
      expect(result!.options.baseURL).toBe('https://api.z.ai/api/coding/paas/v4');
    });

    it('should use international URL when region is undefined in credentials', () => {
      mockGetApiKey.mockReturnValue('zai-api-key-12345');

      const providerSettings: Partial<ProviderSettings> = {
        connectedProviders: {
          zai: {
            providerId: 'zai',
            connectionStatus: 'connected',
            selectedModelId: 'zai/glm-4.7',
            credentials: {
              type: 'zai',
              keyPrefix: 'zai***',
              // region is intentionally omitted
            } as ZaiCredentials,
            lastConnectedAt: '2024-01-01T00:00:00Z',
          },
        },
      };

      const result = buildZaiProviderConfig(providerSettings as ProviderSettings);

      expect(result).not.toBeNull();
      expect(result!.options.baseURL).toBe('https://api.z.ai/api/coding/paas/v4');
    });
  });

  describe('model configuration', () => {
    it('should include all 5 ZAI models', () => {
      mockGetApiKey.mockReturnValue('zai-api-key-12345');

      const result = buildZaiProviderConfig();

      expect(result).not.toBeNull();
      const modelIds = Object.keys(result!.models);
      expect(modelIds).toHaveLength(5);
      expect(modelIds).toContain('glm-4.7-flashx');
      expect(modelIds).toContain('glm-4.7');
      expect(modelIds).toContain('glm-4.7-flash');
      expect(modelIds).toContain('glm-4.6');
      expect(modelIds).toContain('glm-4.5-flash');
    });

    it('should have tools: true for all models', () => {
      mockGetApiKey.mockReturnValue('zai-api-key-12345');

      const result = buildZaiProviderConfig();

      expect(result).not.toBeNull();
      for (const modelId of Object.keys(result!.models)) {
        expect(result!.models[modelId].tools).toBe(true);
      }
    });

    it('should have correct model names', () => {
      mockGetApiKey.mockReturnValue('zai-api-key-12345');

      const result = buildZaiProviderConfig();

      expect(result).not.toBeNull();
      expect(result!.models['glm-4.7-flashx'].name).toBe('GLM-4.7 FlashX (Latest)');
      expect(result!.models['glm-4.7'].name).toBe('GLM-4.7');
      expect(result!.models['glm-4.7-flash'].name).toBe('GLM-4.7 Flash');
      expect(result!.models['glm-4.6'].name).toBe('GLM-4.6');
      expect(result!.models['glm-4.5-flash'].name).toBe('GLM-4.5 Flash');
    });
  });

  describe('config structure', () => {
    it('should return correct provider config structure', () => {
      mockGetApiKey.mockReturnValue('zai-api-key-12345');

      const result = buildZaiProviderConfig();

      expect(result).not.toBeNull();
      expect(result).toHaveProperty('npm');
      expect(result).toHaveProperty('name');
      expect(result).toHaveProperty('options');
      expect(result).toHaveProperty('models');
    });

    it('should have npm property set to @ai-sdk/openai-compatible', () => {
      mockGetApiKey.mockReturnValue('zai-api-key-12345');

      const result = buildZaiProviderConfig();

      expect(result).not.toBeNull();
      expect(result!.npm).toBe('@ai-sdk/openai-compatible');
    });

    it('should have name property set to "Z.AI Coding Plan"', () => {
      mockGetApiKey.mockReturnValue('zai-api-key-12345');

      const result = buildZaiProviderConfig();

      expect(result).not.toBeNull();
      expect(result!.name).toBe('Z.AI Coding Plan');
    });

    it('should have options with baseURL', () => {
      mockGetApiKey.mockReturnValue('zai-api-key-12345');

      const result = buildZaiProviderConfig();

      expect(result).not.toBeNull();
      expect(result!.options).toHaveProperty('baseURL');
      expect(typeof result!.options.baseURL).toBe('string');
    });

    it('should not include apiKey in options (handled via auth.json sync)', () => {
      mockGetApiKey.mockReturnValue('zai-api-key-12345');

      const result = buildZaiProviderConfig();

      expect(result).not.toBeNull();
      // API key is synced via syncApiKeysToOpenCodeAuth(), not in config
      expect(result!.options).not.toHaveProperty('apiKey');
    });
  });

  describe('ZAI_MODELS constant', () => {
    it('should export ZAI_MODELS constant with all model definitions', () => {
      expect(ZAI_MODELS).toBeDefined();
      expect(typeof ZAI_MODELS).toBe('object');
      expect(Object.keys(ZAI_MODELS)).toHaveLength(5);
    });

    it('should have consistent model definitions with buildZaiProviderConfig', () => {
      mockGetApiKey.mockReturnValue('zai-api-key-12345');

      const result = buildZaiProviderConfig();

      expect(result).not.toBeNull();
      // Verify the exported constant matches what's used in the config
      for (const [modelId, modelConfig] of Object.entries(ZAI_MODELS)) {
        expect(result!.models[modelId]).toEqual(modelConfig);
      }
    });
  });

  describe('edge cases', () => {
    it('should handle whitespace-only API key as invalid', () => {
      mockGetApiKey.mockReturnValue('   ');

      const result = buildZaiProviderConfig();

      // Whitespace-only should be treated as empty/invalid
      expect(result).toBeNull();
    });

    it('should handle provider settings with null connectedProviders', () => {
      mockGetApiKey.mockReturnValue('zai-api-key-12345');

      const providerSettings: Partial<ProviderSettings> = {
        connectedProviders: null as unknown as Partial<Record<string, ConnectedProvider>>,
      };

      const result = buildZaiProviderConfig(providerSettings as ProviderSettings);

      // Should fall back to international URL
      expect(result).not.toBeNull();
      expect(result!.options.baseURL).toBe('https://api.z.ai/api/coding/paas/v4');
    });

    it('should handle provider settings being undefined', () => {
      mockGetApiKey.mockReturnValue('zai-api-key-12345');

      const result = buildZaiProviderConfig(undefined);

      expect(result).not.toBeNull();
      expect(result!.options.baseURL).toBe('https://api.z.ai/api/coding/paas/v4');
    });

    it('should handle zai provider with disconnected status', () => {
      mockGetApiKey.mockReturnValue('zai-api-key-12345');

      const providerSettings: Partial<ProviderSettings> = {
        connectedProviders: {
          zai: {
            providerId: 'zai',
            connectionStatus: 'disconnected',
            selectedModelId: null,
            credentials: {
              type: 'zai',
              keyPrefix: 'zai***',
              region: 'china',
            },
            lastConnectedAt: '2024-01-01T00:00:00Z',
          },
        },
      };

      const result = buildZaiProviderConfig(providerSettings as ProviderSettings);

      // Should still use the region from credentials even if disconnected
      // (the API key check determines if config is generated)
      expect(result).not.toBeNull();
      expect(result!.options.baseURL).toBe('https://open.bigmodel.cn/api/paas/v4');
    });
  });

  describe('URL constants', () => {
    it('should use correct international URL format', () => {
      mockGetApiKey.mockReturnValue('zai-api-key-12345');

      const providerSettings: Partial<ProviderSettings> = {
        connectedProviders: {
          zai: {
            providerId: 'zai',
            connectionStatus: 'connected',
            selectedModelId: 'zai/glm-4.7',
            credentials: {
              type: 'zai',
              keyPrefix: 'zai***',
              region: 'international',
            },
            lastConnectedAt: '2024-01-01T00:00:00Z',
          },
        },
      };

      const result = buildZaiProviderConfig(providerSettings as ProviderSettings);

      expect(result!.options.baseURL).toBe('https://api.z.ai/api/coding/paas/v4');
      // Verify URL structure: https + domain + path
      expect(result!.options.baseURL).toMatch(/^https:\/\/api\.z\.ai\/api\/coding\/paas\/v4$/);
    });

    it('should use correct China URL format', () => {
      mockGetApiKey.mockReturnValue('zai-api-key-12345');

      const providerSettings: Partial<ProviderSettings> = {
        connectedProviders: {
          zai: {
            providerId: 'zai',
            connectionStatus: 'connected',
            selectedModelId: 'zai/glm-4.7',
            credentials: {
              type: 'zai',
              keyPrefix: 'zai***',
              region: 'china',
            },
            lastConnectedAt: '2024-01-01T00:00:00Z',
          },
        },
      };

      const result = buildZaiProviderConfig(providerSettings as ProviderSettings);

      expect(result!.options.baseURL).toBe('https://open.bigmodel.cn/api/paas/v4');
      // Verify URL structure: https + domain + path
      expect(result!.options.baseURL).toMatch(/^https:\/\/open\.bigmodel\.cn\/api\/paas\/v4$/);
    });
  });
});
