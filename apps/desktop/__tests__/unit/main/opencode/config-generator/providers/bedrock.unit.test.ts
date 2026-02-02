/**
 * Unit tests for Bedrock provider configuration builder
 *
 * Tests the buildBedrockProviderConfig function which generates
 * Amazon Bedrock provider configuration for OpenCode CLI.
 *
 * Based on lines 689-728 of the original config-generator.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type {
  ConnectedProvider,
  BedrockProviderCredentials,
} from '@accomplish/shared';

// Mock the secure storage module
vi.mock('../../../../../../src/main/store/secureStorage', () => ({
  getApiKey: vi.fn(),
}));

// Import after mocks are set up
import { buildBedrockProviderConfig } from '../../../../../../src/main/opencode/config-generator/providers/bedrock';
import { getApiKey } from '../../../../../../src/main/store/secureStorage';

const mockGetApiKey = vi.mocked(getApiKey);

describe('buildBedrockProviderConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('connection status checks', () => {
    it('should return null when provider is not connected', () => {
      const provider: ConnectedProvider = {
        providerId: 'bedrock',
        connectionStatus: 'disconnected',
        selectedModelId: 'anthropic.claude-3-sonnet',
        credentials: {
          type: 'bedrock',
          authMethod: 'profile',
          region: 'us-east-1',
          profileName: 'default',
        },
        lastConnectedAt: '2024-01-01T00:00:00Z',
      };

      const result = buildBedrockProviderConfig(provider);

      expect(result).toBeNull();
    });

    it('should return null when connection status is "connecting"', () => {
      const provider: ConnectedProvider = {
        providerId: 'bedrock',
        connectionStatus: 'connecting',
        selectedModelId: 'anthropic.claude-3-sonnet',
        credentials: {
          type: 'bedrock',
          authMethod: 'profile',
          region: 'us-west-2',
          profileName: 'dev',
        },
        lastConnectedAt: '2024-01-01T00:00:00Z',
      };

      const result = buildBedrockProviderConfig(provider);

      expect(result).toBeNull();
    });

    it('should return null when connection status is "error"', () => {
      const provider: ConnectedProvider = {
        providerId: 'bedrock',
        connectionStatus: 'error',
        selectedModelId: 'anthropic.claude-3-sonnet',
        credentials: {
          type: 'bedrock',
          authMethod: 'profile',
          region: 'eu-west-1',
          profileName: 'prod',
        },
        lastConnectedAt: '2024-01-01T00:00:00Z',
      };

      const result = buildBedrockProviderConfig(provider);

      expect(result).toBeNull();
    });

    it('should return null when provider is undefined', () => {
      const result = buildBedrockProviderConfig(undefined);

      expect(result).toBeNull();
    });
  });

  describe('credentials type validation', () => {
    it('should return null for wrong credentials type (api_key)', () => {
      const provider: ConnectedProvider = {
        providerId: 'bedrock',
        connectionStatus: 'connected',
        selectedModelId: 'anthropic.claude-3-sonnet',
        credentials: {
          type: 'api_key',
          keyPrefix: 'sk-***',
        },
        lastConnectedAt: '2024-01-01T00:00:00Z',
      };

      const result = buildBedrockProviderConfig(provider);

      expect(result).toBeNull();
    });

    it('should return null for wrong credentials type (ollama)', () => {
      const provider: ConnectedProvider = {
        providerId: 'bedrock',
        connectionStatus: 'connected',
        selectedModelId: 'anthropic.claude-3-sonnet',
        credentials: {
          type: 'ollama',
          serverUrl: 'http://localhost:11434',
        },
        lastConnectedAt: '2024-01-01T00:00:00Z',
      };

      const result = buildBedrockProviderConfig(provider);

      expect(result).toBeNull();
    });
  });

  describe('region configuration', () => {
    it('should return correct config with default region (us-east-1) when region is missing', () => {
      const provider: ConnectedProvider = {
        providerId: 'bedrock',
        connectionStatus: 'connected',
        selectedModelId: 'anthropic.claude-3-sonnet',
        credentials: {
          type: 'bedrock',
          authMethod: 'profile',
          region: '', // Empty region
          profileName: 'default',
        } as BedrockProviderCredentials,
        lastConnectedAt: '2024-01-01T00:00:00Z',
      };

      const result = buildBedrockProviderConfig(provider);

      expect(result).not.toBeNull();
      expect(result!.options.region).toBe('us-east-1');
    });

    it('should return correct config with custom region (us-west-2)', () => {
      const provider: ConnectedProvider = {
        providerId: 'bedrock',
        connectionStatus: 'connected',
        selectedModelId: 'anthropic.claude-3-sonnet',
        credentials: {
          type: 'bedrock',
          authMethod: 'profile',
          region: 'us-west-2',
          profileName: 'default',
        },
        lastConnectedAt: '2024-01-01T00:00:00Z',
      };

      const result = buildBedrockProviderConfig(provider);

      expect(result).not.toBeNull();
      expect(result!.options.region).toBe('us-west-2');
    });

    it('should return correct config with eu-central-1 region', () => {
      const provider: ConnectedProvider = {
        providerId: 'bedrock',
        connectionStatus: 'connected',
        selectedModelId: 'anthropic.claude-3-haiku',
        credentials: {
          type: 'bedrock',
          authMethod: 'accessKey',
          region: 'eu-central-1',
          accessKeyIdPrefix: 'AKIA***',
        },
        lastConnectedAt: '2024-01-01T00:00:00Z',
      };

      const result = buildBedrockProviderConfig(provider);

      expect(result).not.toBeNull();
      expect(result!.options.region).toBe('eu-central-1');
    });

    it('should return correct config with ap-northeast-1 region', () => {
      const provider: ConnectedProvider = {
        providerId: 'bedrock',
        connectionStatus: 'connected',
        selectedModelId: 'anthropic.claude-3-opus',
        credentials: {
          type: 'bedrock',
          authMethod: 'profile',
          region: 'ap-northeast-1',
          profileName: 'tokyo-profile',
        },
        lastConnectedAt: '2024-01-01T00:00:00Z',
      };

      const result = buildBedrockProviderConfig(provider);

      expect(result).not.toBeNull();
      expect(result!.options.region).toBe('ap-northeast-1');
    });
  });

  describe('profile authentication', () => {
    it('should include profile when authMethod is "profile"', () => {
      const provider: ConnectedProvider = {
        providerId: 'bedrock',
        connectionStatus: 'connected',
        selectedModelId: 'anthropic.claude-3-sonnet',
        credentials: {
          type: 'bedrock',
          authMethod: 'profile',
          region: 'us-east-1',
          profileName: 'my-aws-profile',
        },
        lastConnectedAt: '2024-01-01T00:00:00Z',
      };

      const result = buildBedrockProviderConfig(provider);

      expect(result).not.toBeNull();
      expect(result!.options.profile).toBe('my-aws-profile');
    });

    it('should omit profile when authMethod is "accessKey"', () => {
      const provider: ConnectedProvider = {
        providerId: 'bedrock',
        connectionStatus: 'connected',
        selectedModelId: 'anthropic.claude-3-sonnet',
        credentials: {
          type: 'bedrock',
          authMethod: 'accessKey',
          region: 'us-east-1',
          accessKeyIdPrefix: 'AKIA***',
        },
        lastConnectedAt: '2024-01-01T00:00:00Z',
      };

      const result = buildBedrockProviderConfig(provider);

      expect(result).not.toBeNull();
      expect(result!.options.profile).toBeUndefined();
    });

    it('should omit profile when authMethod is "apiKey"', () => {
      const provider: ConnectedProvider = {
        providerId: 'bedrock',
        connectionStatus: 'connected',
        selectedModelId: 'anthropic.claude-3-sonnet',
        credentials: {
          type: 'bedrock',
          authMethod: 'apiKey',
          region: 'us-west-2',
          apiKeyPrefix: 'br-***',
        },
        lastConnectedAt: '2024-01-01T00:00:00Z',
      };

      const result = buildBedrockProviderConfig(provider);

      expect(result).not.toBeNull();
      expect(result!.options.profile).toBeUndefined();
    });

    it('should omit profile when profileName is empty string', () => {
      const provider: ConnectedProvider = {
        providerId: 'bedrock',
        connectionStatus: 'connected',
        selectedModelId: 'anthropic.claude-3-sonnet',
        credentials: {
          type: 'bedrock',
          authMethod: 'profile',
          region: 'us-east-1',
          profileName: '',
        },
        lastConnectedAt: '2024-01-01T00:00:00Z',
      };

      const result = buildBedrockProviderConfig(provider);

      expect(result).not.toBeNull();
      expect(result!.options.profile).toBeUndefined();
    });
  });

  describe('config structure', () => {
    it('should return amazon-bedrock provider config structure', () => {
      const provider: ConnectedProvider = {
        providerId: 'bedrock',
        connectionStatus: 'connected',
        selectedModelId: 'anthropic.claude-3-sonnet',
        credentials: {
          type: 'bedrock',
          authMethod: 'profile',
          region: 'us-east-1',
          profileName: 'default',
        },
        lastConnectedAt: '2024-01-01T00:00:00Z',
      };

      const result = buildBedrockProviderConfig(provider);

      expect(result).not.toBeNull();
      expect(result).toEqual({
        options: {
          region: 'us-east-1',
          profile: 'default',
        },
      });
    });

    it('should only include options object (no npm, name, or models)', () => {
      const provider: ConnectedProvider = {
        providerId: 'bedrock',
        connectionStatus: 'connected',
        selectedModelId: 'anthropic.claude-3-sonnet',
        credentials: {
          type: 'bedrock',
          authMethod: 'accessKey',
          region: 'us-west-2',
          accessKeyIdPrefix: 'AKIA***',
        },
        lastConnectedAt: '2024-01-01T00:00:00Z',
      };

      const result = buildBedrockProviderConfig(provider);

      expect(result).not.toBeNull();
      expect(Object.keys(result!)).toEqual(['options']);
      expect(result).not.toHaveProperty('npm');
      expect(result).not.toHaveProperty('name');
      expect(result).not.toHaveProperty('models');
    });
  });

  describe('legacy JSON credentials parsing', () => {
    it('should parse legacy JSON credentials with profile auth', () => {
      const legacyCredentials = JSON.stringify({
        authType: 'profile',
        profileName: 'legacy-profile',
        region: 'eu-west-1',
      });
      mockGetApiKey.mockReturnValue(legacyCredentials);

      const result = buildBedrockProviderConfig(undefined, { useLegacyFallback: true });

      expect(mockGetApiKey).toHaveBeenCalledWith('bedrock');
      expect(result).not.toBeNull();
      expect(result!.options.region).toBe('eu-west-1');
      expect(result!.options.profile).toBe('legacy-profile');
    });

    it('should parse legacy JSON credentials with access keys auth', () => {
      const legacyCredentials = JSON.stringify({
        authType: 'accessKeys',
        accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
        secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
        region: 'ap-southeast-1',
      });
      mockGetApiKey.mockReturnValue(legacyCredentials);

      const result = buildBedrockProviderConfig(undefined, { useLegacyFallback: true });

      expect(result).not.toBeNull();
      expect(result!.options.region).toBe('ap-southeast-1');
      expect(result!.options.profile).toBeUndefined();
    });

    it('should default to us-east-1 when legacy credentials have no region', () => {
      const legacyCredentials = JSON.stringify({
        authType: 'profile',
        profileName: 'no-region-profile',
      });
      mockGetApiKey.mockReturnValue(legacyCredentials);

      const result = buildBedrockProviderConfig(undefined, { useLegacyFallback: true });

      expect(result).not.toBeNull();
      expect(result!.options.region).toBe('us-east-1');
    });

    it('should return null when legacy credentials JSON is invalid', () => {
      mockGetApiKey.mockReturnValue('not valid json {');

      const result = buildBedrockProviderConfig(undefined, { useLegacyFallback: true });

      expect(result).toBeNull();
    });

    it('should return null when legacy credentials are empty', () => {
      mockGetApiKey.mockReturnValue(null);

      const result = buildBedrockProviderConfig(undefined, { useLegacyFallback: true });

      expect(result).toBeNull();
    });

    it('should return null when legacy credentials are undefined', () => {
      mockGetApiKey.mockReturnValue(undefined);

      const result = buildBedrockProviderConfig(undefined, { useLegacyFallback: true });

      expect(result).toBeNull();
    });

    it('should prefer new provider settings over legacy fallback when both exist', () => {
      const provider: ConnectedProvider = {
        providerId: 'bedrock',
        connectionStatus: 'connected',
        selectedModelId: 'anthropic.claude-3-sonnet',
        credentials: {
          type: 'bedrock',
          authMethod: 'profile',
          region: 'us-west-2',
          profileName: 'new-profile',
        },
        lastConnectedAt: '2024-01-01T00:00:00Z',
      };

      const legacyCredentials = JSON.stringify({
        authType: 'profile',
        profileName: 'legacy-profile',
        region: 'eu-west-1',
      });
      mockGetApiKey.mockReturnValue(legacyCredentials);

      const result = buildBedrockProviderConfig(provider, { useLegacyFallback: true });

      // Should use new provider settings, not legacy
      expect(result).not.toBeNull();
      expect(result!.options.region).toBe('us-west-2');
      expect(result!.options.profile).toBe('new-profile');
      // Should not have called getApiKey since new provider is valid
      expect(mockGetApiKey).not.toHaveBeenCalled();
    });
  });
});
