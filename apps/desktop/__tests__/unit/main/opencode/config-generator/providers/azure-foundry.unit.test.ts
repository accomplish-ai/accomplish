/**
 * Unit tests for Azure Foundry provider configuration builder
 *
 * Tests the buildAzureFoundryProviderConfig function which generates
 * Azure AI Foundry provider configuration for OpenCode CLI.
 *
 * Based on lines 444-490 and 811-860 of the original config-generator.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type {
  ConnectedProvider,
  AzureFoundryCredentials,
} from '@accomplish/shared';

// Mock the secure storage module
vi.mock('../../../../../../src/main/store/secureStorage', () => ({
  getApiKey: vi.fn(),
}));

// Mock the azure-foundry-proxy module
vi.mock('../../../../../../src/main/opencode/azure-foundry-proxy', () => ({
  ensureAzureFoundryProxy: vi.fn(),
}));

// Import after mocks are set up
import { buildAzureFoundryProviderConfig } from '../../../../../../src/main/opencode/config-generator/providers/azure-foundry';
import { getApiKey } from '../../../../../../src/main/store/secureStorage';
import { ensureAzureFoundryProxy } from '../../../../../../src/main/opencode/azure-foundry-proxy';

const mockGetApiKey = vi.mocked(getApiKey);
const mockEnsureAzureFoundryProxy = vi.mocked(ensureAzureFoundryProxy);

describe('buildAzureFoundryProviderConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default proxy mock - returns a local proxy URL
    mockEnsureAzureFoundryProxy.mockResolvedValue({
      baseURL: 'http://127.0.0.1:9228',
      targetBaseURL: 'https://my-endpoint.openai.azure.com/openai/v1',
      port: 9228,
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('connection status checks', () => {
    it('should return null when provider is not connected', async () => {
      const provider: ConnectedProvider = {
        providerId: 'azure-foundry',
        connectionStatus: 'disconnected',
        selectedModelId: 'gpt-4o',
        credentials: {
          type: 'azure-foundry',
          authMethod: 'api-key',
          endpoint: 'https://my-endpoint.openai.azure.com',
          deploymentName: 'gpt-4o-deployment',
          keyPrefix: 'abc***',
        },
        lastConnectedAt: '2024-01-01T00:00:00Z',
      };

      const result = await buildAzureFoundryProviderConfig(provider);

      expect(result).toBeNull();
    });

    it('should return null when connection status is "connecting"', async () => {
      const provider: ConnectedProvider = {
        providerId: 'azure-foundry',
        connectionStatus: 'connecting',
        selectedModelId: 'gpt-4o',
        credentials: {
          type: 'azure-foundry',
          authMethod: 'api-key',
          endpoint: 'https://my-endpoint.openai.azure.com',
          deploymentName: 'gpt-4o-deployment',
          keyPrefix: 'abc***',
        },
        lastConnectedAt: '2024-01-01T00:00:00Z',
      };

      const result = await buildAzureFoundryProviderConfig(provider);

      expect(result).toBeNull();
    });

    it('should return null when connection status is "error"', async () => {
      const provider: ConnectedProvider = {
        providerId: 'azure-foundry',
        connectionStatus: 'error',
        selectedModelId: 'gpt-4o',
        credentials: {
          type: 'azure-foundry',
          authMethod: 'api-key',
          endpoint: 'https://my-endpoint.openai.azure.com',
          deploymentName: 'gpt-4o-deployment',
          keyPrefix: 'abc***',
        },
        lastConnectedAt: '2024-01-01T00:00:00Z',
      };

      const result = await buildAzureFoundryProviderConfig(provider);

      expect(result).toBeNull();
    });

    it('should return null when provider is undefined', async () => {
      const result = await buildAzureFoundryProviderConfig(undefined);

      expect(result).toBeNull();
    });
  });

  describe('credentials type validation', () => {
    it('should return null for wrong credentials type (api_key)', async () => {
      const provider: ConnectedProvider = {
        providerId: 'azure-foundry',
        connectionStatus: 'connected',
        selectedModelId: 'gpt-4o',
        credentials: {
          type: 'api_key',
          keyPrefix: 'sk-***',
        },
        lastConnectedAt: '2024-01-01T00:00:00Z',
      };

      const result = await buildAzureFoundryProviderConfig(provider);

      expect(result).toBeNull();
    });

    it('should return null for wrong credentials type (bedrock)', async () => {
      const provider: ConnectedProvider = {
        providerId: 'azure-foundry',
        connectionStatus: 'connected',
        selectedModelId: 'gpt-4o',
        credentials: {
          type: 'bedrock',
          authMethod: 'profile',
          region: 'us-east-1',
          profileName: 'default',
        },
        lastConnectedAt: '2024-01-01T00:00:00Z',
      };

      const result = await buildAzureFoundryProviderConfig(provider);

      expect(result).toBeNull();
    });
  });

  describe('Entra ID authentication', () => {
    it('should return null for entra-id without token', async () => {
      const provider: ConnectedProvider = {
        providerId: 'azure-foundry',
        connectionStatus: 'connected',
        selectedModelId: 'gpt-4o',
        credentials: {
          type: 'azure-foundry',
          authMethod: 'entra-id',
          endpoint: 'https://my-endpoint.openai.azure.com',
          deploymentName: 'gpt-4o-deployment',
        },
        lastConnectedAt: '2024-01-01T00:00:00Z',
      };

      const result = await buildAzureFoundryProviderConfig(provider);

      expect(result).toBeNull();
    });

    it('should return null for entra-id with undefined token', async () => {
      const provider: ConnectedProvider = {
        providerId: 'azure-foundry',
        connectionStatus: 'connected',
        selectedModelId: 'gpt-4o',
        credentials: {
          type: 'azure-foundry',
          authMethod: 'entra-id',
          endpoint: 'https://my-endpoint.openai.azure.com',
          deploymentName: 'gpt-4o-deployment',
        },
        lastConnectedAt: '2024-01-01T00:00:00Z',
      };

      const result = await buildAzureFoundryProviderConfig(provider, undefined);

      expect(result).toBeNull();
    });

    it('should return null for entra-id with empty string token', async () => {
      const provider: ConnectedProvider = {
        providerId: 'azure-foundry',
        connectionStatus: 'connected',
        selectedModelId: 'gpt-4o',
        credentials: {
          type: 'azure-foundry',
          authMethod: 'entra-id',
          endpoint: 'https://my-endpoint.openai.azure.com',
          deploymentName: 'gpt-4o-deployment',
        },
        lastConnectedAt: '2024-01-01T00:00:00Z',
      };

      const result = await buildAzureFoundryProviderConfig(provider, '');

      expect(result).toBeNull();
    });

    it('should set Authorization header for entra-id auth', async () => {
      const provider: ConnectedProvider = {
        providerId: 'azure-foundry',
        connectionStatus: 'connected',
        selectedModelId: 'gpt-4o',
        credentials: {
          type: 'azure-foundry',
          authMethod: 'entra-id',
          endpoint: 'https://my-endpoint.openai.azure.com',
          deploymentName: 'gpt-4o-deployment',
        },
        lastConnectedAt: '2024-01-01T00:00:00Z',
      };

      const result = await buildAzureFoundryProviderConfig(provider, 'my-entra-id-token');

      expect(result).not.toBeNull();
      expect(result!.options.headers).toEqual({
        Authorization: 'Bearer my-entra-id-token',
      });
    });

    it('should set empty apiKey for entra-id (required for SDK)', async () => {
      const provider: ConnectedProvider = {
        providerId: 'azure-foundry',
        connectionStatus: 'connected',
        selectedModelId: 'gpt-4o',
        credentials: {
          type: 'azure-foundry',
          authMethod: 'entra-id',
          endpoint: 'https://my-endpoint.openai.azure.com',
          deploymentName: 'gpt-4o-deployment',
        },
        lastConnectedAt: '2024-01-01T00:00:00Z',
      };

      const result = await buildAzureFoundryProviderConfig(provider, 'my-entra-id-token');

      expect(result).not.toBeNull();
      expect(result!.options.apiKey).toBe('');
    });
  });

  describe('API key authentication', () => {
    it('should set apiKey for api-key auth', async () => {
      mockGetApiKey.mockReturnValue('my-azure-api-key-12345');

      const provider: ConnectedProvider = {
        providerId: 'azure-foundry',
        connectionStatus: 'connected',
        selectedModelId: 'gpt-4o',
        credentials: {
          type: 'azure-foundry',
          authMethod: 'api-key',
          endpoint: 'https://my-endpoint.openai.azure.com',
          deploymentName: 'gpt-4o-deployment',
          keyPrefix: 'abc***',
        },
        lastConnectedAt: '2024-01-01T00:00:00Z',
      };

      const result = await buildAzureFoundryProviderConfig(provider);

      expect(mockGetApiKey).toHaveBeenCalledWith('azure-foundry');
      expect(result).not.toBeNull();
      expect(result!.options.apiKey).toBe('my-azure-api-key-12345');
    });

    it('should not set apiKey when getApiKey returns null', async () => {
      mockGetApiKey.mockReturnValue(null);

      const provider: ConnectedProvider = {
        providerId: 'azure-foundry',
        connectionStatus: 'connected',
        selectedModelId: 'gpt-4o',
        credentials: {
          type: 'azure-foundry',
          authMethod: 'api-key',
          endpoint: 'https://my-endpoint.openai.azure.com',
          deploymentName: 'gpt-4o-deployment',
          keyPrefix: 'abc***',
        },
        lastConnectedAt: '2024-01-01T00:00:00Z',
      };

      const result = await buildAzureFoundryProviderConfig(provider);

      expect(result).not.toBeNull();
      expect(result!.options.apiKey).toBeUndefined();
    });

    it('should not set headers for api-key auth', async () => {
      mockGetApiKey.mockReturnValue('my-azure-api-key-12345');

      const provider: ConnectedProvider = {
        providerId: 'azure-foundry',
        connectionStatus: 'connected',
        selectedModelId: 'gpt-4o',
        credentials: {
          type: 'azure-foundry',
          authMethod: 'api-key',
          endpoint: 'https://my-endpoint.openai.azure.com',
          deploymentName: 'gpt-4o-deployment',
          keyPrefix: 'abc***',
        },
        lastConnectedAt: '2024-01-01T00:00:00Z',
      };

      const result = await buildAzureFoundryProviderConfig(provider);

      expect(result).not.toBeNull();
      expect(result!.options.headers).toBeUndefined();
    });
  });

  describe('proxy configuration', () => {
    it('should use proxy baseURL from ensureAzureFoundryProxy', async () => {
      mockGetApiKey.mockReturnValue('my-api-key');
      mockEnsureAzureFoundryProxy.mockResolvedValue({
        baseURL: 'http://127.0.0.1:9228',
        targetBaseURL: 'https://custom-endpoint.openai.azure.com/openai/v1',
        port: 9228,
      });

      const provider: ConnectedProvider = {
        providerId: 'azure-foundry',
        connectionStatus: 'connected',
        selectedModelId: 'gpt-4o',
        credentials: {
          type: 'azure-foundry',
          authMethod: 'api-key',
          endpoint: 'https://custom-endpoint.openai.azure.com',
          deploymentName: 'gpt-4o-deployment',
          keyPrefix: 'abc***',
        },
        lastConnectedAt: '2024-01-01T00:00:00Z',
      };

      const result = await buildAzureFoundryProviderConfig(provider);

      expect(result).not.toBeNull();
      expect(result!.options.baseURL).toBe('http://127.0.0.1:9228');
    });

    it('should call ensureAzureFoundryProxy with correct target URL', async () => {
      mockGetApiKey.mockReturnValue('my-api-key');

      const provider: ConnectedProvider = {
        providerId: 'azure-foundry',
        connectionStatus: 'connected',
        selectedModelId: 'gpt-4o',
        credentials: {
          type: 'azure-foundry',
          authMethod: 'api-key',
          endpoint: 'https://my-resource.openai.azure.com',
          deploymentName: 'gpt-4o-deployment',
          keyPrefix: 'abc***',
        },
        lastConnectedAt: '2024-01-01T00:00:00Z',
      };

      await buildAzureFoundryProviderConfig(provider);

      expect(mockEnsureAzureFoundryProxy).toHaveBeenCalledWith(
        'https://my-resource.openai.azure.com/openai/v1'
      );
    });
  });

  describe('endpoint URL handling', () => {
    it('should strip trailing slash from endpoint', async () => {
      mockGetApiKey.mockReturnValue('my-api-key');

      const provider: ConnectedProvider = {
        providerId: 'azure-foundry',
        connectionStatus: 'connected',
        selectedModelId: 'gpt-4o',
        credentials: {
          type: 'azure-foundry',
          authMethod: 'api-key',
          endpoint: 'https://my-endpoint.openai.azure.com/',
          deploymentName: 'gpt-4o-deployment',
          keyPrefix: 'abc***',
        },
        lastConnectedAt: '2024-01-01T00:00:00Z',
      };

      await buildAzureFoundryProviderConfig(provider);

      // Should have been called with trailing slash removed
      expect(mockEnsureAzureFoundryProxy).toHaveBeenCalledWith(
        'https://my-endpoint.openai.azure.com/openai/v1'
      );
    });

    it('should handle endpoint without trailing slash', async () => {
      mockGetApiKey.mockReturnValue('my-api-key');

      const provider: ConnectedProvider = {
        providerId: 'azure-foundry',
        connectionStatus: 'connected',
        selectedModelId: 'gpt-4o',
        credentials: {
          type: 'azure-foundry',
          authMethod: 'api-key',
          endpoint: 'https://my-endpoint.openai.azure.com',
          deploymentName: 'gpt-4o-deployment',
          keyPrefix: 'abc***',
        },
        lastConnectedAt: '2024-01-01T00:00:00Z',
      };

      await buildAzureFoundryProviderConfig(provider);

      expect(mockEnsureAzureFoundryProxy).toHaveBeenCalledWith(
        'https://my-endpoint.openai.azure.com/openai/v1'
      );
    });
  });

  describe('model configuration', () => {
    it('should use correct deployment name in model config', async () => {
      mockGetApiKey.mockReturnValue('my-api-key');

      const provider: ConnectedProvider = {
        providerId: 'azure-foundry',
        connectionStatus: 'connected',
        selectedModelId: 'gpt-4o',
        credentials: {
          type: 'azure-foundry',
          authMethod: 'api-key',
          endpoint: 'https://my-endpoint.openai.azure.com',
          deploymentName: 'my-gpt4o-deployment',
          keyPrefix: 'abc***',
        },
        lastConnectedAt: '2024-01-01T00:00:00Z',
      };

      const result = await buildAzureFoundryProviderConfig(provider);

      expect(result).not.toBeNull();
      expect(result!.models).toHaveProperty('my-gpt4o-deployment');
      expect(result!.models['my-gpt4o-deployment'].name).toBe('Azure Foundry (my-gpt4o-deployment)');
    });

    it('should have tools: true in model config', async () => {
      mockGetApiKey.mockReturnValue('my-api-key');

      const provider: ConnectedProvider = {
        providerId: 'azure-foundry',
        connectionStatus: 'connected',
        selectedModelId: 'gpt-4o',
        credentials: {
          type: 'azure-foundry',
          authMethod: 'api-key',
          endpoint: 'https://my-endpoint.openai.azure.com',
          deploymentName: 'test-deployment',
          keyPrefix: 'abc***',
        },
        lastConnectedAt: '2024-01-01T00:00:00Z',
      };

      const result = await buildAzureFoundryProviderConfig(provider);

      expect(result).not.toBeNull();
      expect(result!.models['test-deployment'].tools).toBe(true);
    });

    it('should have conservative token limits in model config', async () => {
      mockGetApiKey.mockReturnValue('my-api-key');

      const provider: ConnectedProvider = {
        providerId: 'azure-foundry',
        connectionStatus: 'connected',
        selectedModelId: 'gpt-4o',
        credentials: {
          type: 'azure-foundry',
          authMethod: 'api-key',
          endpoint: 'https://my-endpoint.openai.azure.com',
          deploymentName: 'test-deployment',
          keyPrefix: 'abc***',
        },
        lastConnectedAt: '2024-01-01T00:00:00Z',
      };

      const result = await buildAzureFoundryProviderConfig(provider);

      expect(result).not.toBeNull();
      expect(result!.models['test-deployment'].limit).toEqual({
        context: 128000,
        output: 16384,
      });
    });
  });

  describe('config structure', () => {
    it('should return correct provider config structure', async () => {
      mockGetApiKey.mockReturnValue('my-api-key');
      mockEnsureAzureFoundryProxy.mockResolvedValue({
        baseURL: 'http://127.0.0.1:9228',
        targetBaseURL: 'https://test.openai.azure.com/openai/v1',
        port: 9228,
      });

      const provider: ConnectedProvider = {
        providerId: 'azure-foundry',
        connectionStatus: 'connected',
        selectedModelId: 'gpt-4o',
        credentials: {
          type: 'azure-foundry',
          authMethod: 'api-key',
          endpoint: 'https://test.openai.azure.com',
          deploymentName: 'gpt4o-deploy',
          keyPrefix: 'abc***',
        },
        lastConnectedAt: '2024-01-01T00:00:00Z',
      };

      const result = await buildAzureFoundryProviderConfig(provider);

      expect(result).not.toBeNull();
      expect(result).toEqual({
        npm: '@ai-sdk/openai-compatible',
        name: 'Azure AI Foundry',
        options: {
          baseURL: 'http://127.0.0.1:9228',
          apiKey: 'my-api-key',
        },
        models: {
          'gpt4o-deploy': {
            name: 'Azure Foundry (gpt4o-deploy)',
            tools: true,
            limit: {
              context: 128000,
              output: 16384,
            },
          },
        },
      });
    });

    it('should have npm property set to @ai-sdk/openai-compatible', async () => {
      mockGetApiKey.mockReturnValue('my-api-key');

      const provider: ConnectedProvider = {
        providerId: 'azure-foundry',
        connectionStatus: 'connected',
        selectedModelId: 'gpt-4o',
        credentials: {
          type: 'azure-foundry',
          authMethod: 'api-key',
          endpoint: 'https://my-endpoint.openai.azure.com',
          deploymentName: 'test-deployment',
          keyPrefix: 'abc***',
        },
        lastConnectedAt: '2024-01-01T00:00:00Z',
      };

      const result = await buildAzureFoundryProviderConfig(provider);

      expect(result).not.toBeNull();
      expect(result!.npm).toBe('@ai-sdk/openai-compatible');
    });

    it('should have name property set to "Azure AI Foundry"', async () => {
      mockGetApiKey.mockReturnValue('my-api-key');

      const provider: ConnectedProvider = {
        providerId: 'azure-foundry',
        connectionStatus: 'connected',
        selectedModelId: 'gpt-4o',
        credentials: {
          type: 'azure-foundry',
          authMethod: 'api-key',
          endpoint: 'https://my-endpoint.openai.azure.com',
          deploymentName: 'test-deployment',
          keyPrefix: 'abc***',
        },
        lastConnectedAt: '2024-01-01T00:00:00Z',
      };

      const result = await buildAzureFoundryProviderConfig(provider);

      expect(result).not.toBeNull();
      expect(result!.name).toBe('Azure AI Foundry');
    });
  });

  describe('edge cases', () => {
    it('should handle deployment names with special characters', async () => {
      mockGetApiKey.mockReturnValue('my-api-key');

      const provider: ConnectedProvider = {
        providerId: 'azure-foundry',
        connectionStatus: 'connected',
        selectedModelId: 'gpt-4o',
        credentials: {
          type: 'azure-foundry',
          authMethod: 'api-key',
          endpoint: 'https://my-endpoint.openai.azure.com',
          deploymentName: 'gpt-4o_turbo-2024-01',
          keyPrefix: 'abc***',
        },
        lastConnectedAt: '2024-01-01T00:00:00Z',
      };

      const result = await buildAzureFoundryProviderConfig(provider);

      expect(result).not.toBeNull();
      expect(result!.models).toHaveProperty('gpt-4o_turbo-2024-01');
      expect(result!.models['gpt-4o_turbo-2024-01'].name).toBe('Azure Foundry (gpt-4o_turbo-2024-01)');
    });

    it('should handle very long Entra ID tokens', async () => {
      const longToken = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIs'.repeat(100);

      const provider: ConnectedProvider = {
        providerId: 'azure-foundry',
        connectionStatus: 'connected',
        selectedModelId: 'gpt-4o',
        credentials: {
          type: 'azure-foundry',
          authMethod: 'entra-id',
          endpoint: 'https://my-endpoint.openai.azure.com',
          deploymentName: 'test-deployment',
        },
        lastConnectedAt: '2024-01-01T00:00:00Z',
      };

      const result = await buildAzureFoundryProviderConfig(provider, longToken);

      expect(result).not.toBeNull();
      expect(result!.options.headers?.Authorization).toBe(`Bearer ${longToken}`);
    });
  });
});
