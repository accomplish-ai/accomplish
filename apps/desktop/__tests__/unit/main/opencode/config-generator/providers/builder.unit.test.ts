/**
 * Unit tests for Provider Builder
 *
 * Tests the provider configuration builder functions that construct
 * OpenCode CLI provider configs from ProviderSettings.
 *
 * @module config-generator/providers/builder.unit.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type {
  ConnectedProvider,
  ProviderSettings,
  ProviderId,
  OllamaCredentials,
  OpenRouterCredentials,
  LiteLLMCredentials,
  LMStudioCredentials,
  ApiKeyCredentials,
  ToolSupportStatus,
} from '@accomplish/shared';

import {
  buildProviderConfig,
  buildAllStandardProviders,
  type BuildProviderConfigParams,
} from '@main/opencode/config-generator/providers/builder';

// Helper to create a minimal ProviderSettings object
function createProviderSettings(
  connectedProviders: Partial<Record<ProviderId, ConnectedProvider>> = {}
): ProviderSettings {
  return {
    activeProviderId: null,
    connectedProviders,
    debugMode: false,
  };
}

// Helper to create a connected provider
function createConnectedProvider(
  providerId: ProviderId,
  credentials: ConnectedProvider['credentials'],
  selectedModelId: string | null = 'model-1'
): ConnectedProvider {
  return {
    providerId,
    connectionStatus: 'connected',
    selectedModelId,
    credentials,
    lastConnectedAt: '2024-01-01T00:00:00Z',
  };
}

describe('buildProviderConfig', () => {
  describe('validation', () => {
    it('should return null for unknown provider', () => {
      const providerSettings = createProviderSettings({});
      const params: BuildProviderConfigParams = {
        providerId: 'unknown-provider' as ProviderId,
        providerSettings,
      };

      const result = buildProviderConfig(params);

      expect(result).toBeNull();
    });

    it('should return null for disconnected provider', () => {
      const providerSettings = createProviderSettings({
        ollama: {
          providerId: 'ollama',
          connectionStatus: 'disconnected',
          selectedModelId: 'llama3',
          credentials: {
            type: 'ollama',
            serverUrl: 'http://localhost:11434',
          },
          lastConnectedAt: '2024-01-01T00:00:00Z',
        },
      });
      const params: BuildProviderConfigParams = {
        providerId: 'ollama',
        providerSettings,
      };

      const result = buildProviderConfig(params);

      expect(result).toBeNull();
    });

    it('should return null for wrong credentials type', () => {
      const providerSettings = createProviderSettings({
        ollama: {
          providerId: 'ollama',
          connectionStatus: 'connected',
          selectedModelId: 'llama3',
          credentials: {
            type: 'api_key', // Wrong type for Ollama
            keyPrefix: 'sk-***',
          } as ApiKeyCredentials,
          lastConnectedAt: '2024-01-01T00:00:00Z',
        },
      });
      const params: BuildProviderConfigParams = {
        providerId: 'ollama',
        providerSettings,
      };

      const result = buildProviderConfig(params);

      expect(result).toBeNull();
    });

    it('should return null for missing selectedModelId', () => {
      const providerSettings = createProviderSettings({
        ollama: {
          providerId: 'ollama',
          connectionStatus: 'connected',
          selectedModelId: null, // No model selected
          credentials: {
            type: 'ollama',
            serverUrl: 'http://localhost:11434',
          },
          lastConnectedAt: '2024-01-01T00:00:00Z',
        },
      });
      const params: BuildProviderConfigParams = {
        providerId: 'ollama',
        providerSettings,
      };

      const result = buildProviderConfig(params);

      expect(result).toBeNull();
    });

    it('should return null when provider is in "connecting" status', () => {
      const providerSettings = createProviderSettings({
        ollama: {
          providerId: 'ollama',
          connectionStatus: 'connecting',
          selectedModelId: 'llama3',
          credentials: {
            type: 'ollama',
            serverUrl: 'http://localhost:11434',
          },
          lastConnectedAt: '2024-01-01T00:00:00Z',
        },
      });
      const params: BuildProviderConfigParams = {
        providerId: 'ollama',
        providerSettings,
      };

      const result = buildProviderConfig(params);

      expect(result).toBeNull();
    });

    it('should return null when provider is in "error" status', () => {
      const providerSettings = createProviderSettings({
        ollama: {
          providerId: 'ollama',
          connectionStatus: 'error',
          selectedModelId: 'llama3',
          credentials: {
            type: 'ollama',
            serverUrl: 'http://localhost:11434',
          },
          lastConnectedAt: '2024-01-01T00:00:00Z',
        },
      });
      const params: BuildProviderConfigParams = {
        providerId: 'ollama',
        providerSettings,
      };

      const result = buildProviderConfig(params);

      expect(result).toBeNull();
    });
  });

  describe('Ollama provider', () => {
    it('should build config with custom baseURL from credentials.serverUrl', () => {
      const providerSettings = createProviderSettings({
        ollama: createConnectedProvider('ollama', {
          type: 'ollama',
          serverUrl: 'http://192.168.1.100:11434',
        } as OllamaCredentials, 'llama3'),
      });
      const params: BuildProviderConfigParams = {
        providerId: 'ollama',
        providerSettings,
      };

      const result = buildProviderConfig(params);

      expect(result).not.toBeNull();
      expect(result!.options.baseURL).toBe('http://192.168.1.100:11434/v1');
    });

    it('should not include apiKey in Ollama config', () => {
      const providerSettings = createProviderSettings({
        ollama: createConnectedProvider('ollama', {
          type: 'ollama',
          serverUrl: 'http://localhost:11434',
        } as OllamaCredentials, 'llama3'),
      });
      const params: BuildProviderConfigParams = {
        providerId: 'ollama',
        providerSettings,
      };

      const result = buildProviderConfig(params);

      expect(result).not.toBeNull();
      expect(result!.options).not.toHaveProperty('apiKey');
    });

    it('should strip "ollama/" prefix from modelId', () => {
      const providerSettings = createProviderSettings({
        ollama: createConnectedProvider('ollama', {
          type: 'ollama',
          serverUrl: 'http://localhost:11434',
        } as OllamaCredentials, 'ollama/llama3:latest'),
      });
      const params: BuildProviderConfigParams = {
        providerId: 'ollama',
        providerSettings,
      };

      const result = buildProviderConfig(params);

      expect(result).not.toBeNull();
      expect(result!.models).toHaveProperty('llama3:latest');
      expect(result!.models).not.toHaveProperty('ollama/llama3:latest');
    });

    it('should have correct npm package and name', () => {
      const providerSettings = createProviderSettings({
        ollama: createConnectedProvider('ollama', {
          type: 'ollama',
          serverUrl: 'http://localhost:11434',
        } as OllamaCredentials, 'llama3'),
      });
      const params: BuildProviderConfigParams = {
        providerId: 'ollama',
        providerSettings,
      };

      const result = buildProviderConfig(params);

      expect(result).not.toBeNull();
      expect(result!.npm).toBe('@ai-sdk/openai-compatible');
      expect(result!.name).toBe('Ollama (local)');
    });
  });

  describe('OpenRouter provider', () => {
    it('should build config with fixed baseURL', () => {
      const providerSettings = createProviderSettings({
        openrouter: createConnectedProvider('openrouter', {
          type: 'openrouter',
          keyPrefix: 'sk-or-***',
        } as OpenRouterCredentials, 'anthropic/claude-3-opus'),
      });
      const params: BuildProviderConfigParams = {
        providerId: 'openrouter',
        providerSettings,
      };

      const result = buildProviderConfig(params);

      expect(result).not.toBeNull();
      expect(result!.options.baseURL).toBe('https://openrouter.ai/api/v1');
    });

    it('should strip "openrouter/" prefix from modelId', () => {
      const providerSettings = createProviderSettings({
        openrouter: createConnectedProvider('openrouter', {
          type: 'openrouter',
          keyPrefix: 'sk-or-***',
        } as OpenRouterCredentials, 'openrouter/anthropic/claude-3-opus'),
      });
      const params: BuildProviderConfigParams = {
        providerId: 'openrouter',
        providerSettings,
      };

      const result = buildProviderConfig(params);

      expect(result).not.toBeNull();
      expect(result!.models).toHaveProperty('anthropic/claude-3-opus');
      expect(result!.models).not.toHaveProperty('openrouter/anthropic/claude-3-opus');
    });
  });

  describe('Moonshot provider', () => {
    it('should use proxyBaseURL when provided', async () => {
      const providerSettings = createProviderSettings({
        moonshot: createConnectedProvider('moonshot', {
          type: 'api_key',
          keyPrefix: 'sk-moon-***',
        } as ApiKeyCredentials, 'kimi-latest'),
      });
      const params: BuildProviderConfigParams = {
        providerId: 'moonshot',
        providerSettings,
        proxyBaseURL: 'http://localhost:8080/v1',
      };

      const result = buildProviderConfig(params);

      expect(result).not.toBeNull();
      expect(result!.options.baseURL).toBe('http://localhost:8080/v1');
    });

    it('should strip "moonshot/" prefix from modelId', () => {
      const providerSettings = createProviderSettings({
        moonshot: createConnectedProvider('moonshot', {
          type: 'api_key',
          keyPrefix: 'sk-moon-***',
        } as ApiKeyCredentials, 'moonshot/kimi-latest'),
      });
      const params: BuildProviderConfigParams = {
        providerId: 'moonshot',
        providerSettings,
        proxyBaseURL: 'http://localhost:8080/v1',
      };

      const result = buildProviderConfig(params);

      expect(result).not.toBeNull();
      expect(result!.models).toHaveProperty('kimi-latest');
      expect(result!.models).not.toHaveProperty('moonshot/kimi-latest');
    });
  });

  describe('LiteLLM provider', () => {
    it('should build config with optional apiKey', () => {
      const providerSettings = createProviderSettings({
        litellm: createConnectedProvider('litellm', {
          type: 'litellm',
          serverUrl: 'http://localhost:4000',
          hasApiKey: false,
        } as LiteLLMCredentials, 'gpt-4'),
      });
      const params: BuildProviderConfigParams = {
        providerId: 'litellm',
        providerSettings,
      };

      const result = buildProviderConfig(params);

      expect(result).not.toBeNull();
      expect(result!.options).not.toHaveProperty('apiKey');
    });

    it('should include apiKey when provided via getApiKey', () => {
      const providerSettings = createProviderSettings({
        litellm: createConnectedProvider('litellm', {
          type: 'litellm',
          serverUrl: 'http://localhost:4000',
          hasApiKey: true,
          keyPrefix: 'sk-***',
        } as LiteLLMCredentials, 'gpt-4'),
      });
      const params: BuildProviderConfigParams = {
        providerId: 'litellm',
        providerSettings,
        apiKey: 'sk-litellm-api-key',
      };

      const result = buildProviderConfig(params);

      expect(result).not.toBeNull();
      expect(result!.options.apiKey).toBe('sk-litellm-api-key');
    });

    it('should use custom baseURL from credentials', () => {
      const providerSettings = createProviderSettings({
        litellm: createConnectedProvider('litellm', {
          type: 'litellm',
          serverUrl: 'http://my-litellm-server:4000',
          hasApiKey: false,
        } as LiteLLMCredentials, 'gpt-4'),
      });
      const params: BuildProviderConfigParams = {
        providerId: 'litellm',
        providerSettings,
      };

      const result = buildProviderConfig(params);

      expect(result).not.toBeNull();
      expect(result!.options.baseURL).toBe('http://my-litellm-server:4000/v1');
    });
  });

  describe('LMStudio provider', () => {
    it('should determine tool support from model info metadata (supported)', () => {
      const providerSettings = createProviderSettings({
        lmstudio: {
          providerId: 'lmstudio',
          connectionStatus: 'connected',
          selectedModelId: 'lmstudio/qwen2.5-coder',
          credentials: {
            type: 'lmstudio',
            serverUrl: 'http://localhost:1234',
          } as LMStudioCredentials,
          lastConnectedAt: '2024-01-01T00:00:00Z',
          availableModels: [
            { id: 'lmstudio/qwen2.5-coder', name: 'Qwen 2.5 Coder', toolSupport: 'supported' as ToolSupportStatus },
            { id: 'llama3', name: 'LLaMA 3', toolSupport: 'unsupported' as ToolSupportStatus },
          ],
        },
      });
      const params: BuildProviderConfigParams = {
        providerId: 'lmstudio',
        providerSettings,
      };

      const result = buildProviderConfig(params);

      expect(result).not.toBeNull();
      expect(result!.models['qwen2.5-coder'].tools).toBe(true);
    });

    it('should determine tool support from model info metadata (unsupported)', () => {
      const providerSettings = createProviderSettings({
        lmstudio: {
          providerId: 'lmstudio',
          connectionStatus: 'connected',
          selectedModelId: 'lmstudio/llama3',
          credentials: {
            type: 'lmstudio',
            serverUrl: 'http://localhost:1234',
          } as LMStudioCredentials,
          lastConnectedAt: '2024-01-01T00:00:00Z',
          availableModels: [
            { id: 'qwen2.5-coder', name: 'Qwen 2.5 Coder', toolSupport: 'supported' as ToolSupportStatus },
            { id: 'lmstudio/llama3', name: 'LLaMA 3', toolSupport: 'unsupported' as ToolSupportStatus },
          ],
        },
      });
      const params: BuildProviderConfigParams = {
        providerId: 'lmstudio',
        providerSettings,
      };

      const result = buildProviderConfig(params);

      expect(result).not.toBeNull();
      expect(result!.models['llama3'].tools).toBe(false);
    });

    it('should default to false when tool support is unknown', () => {
      const providerSettings = createProviderSettings({
        lmstudio: {
          providerId: 'lmstudio',
          connectionStatus: 'connected',
          selectedModelId: 'lmstudio/some-model',
          credentials: {
            type: 'lmstudio',
            serverUrl: 'http://localhost:1234',
          } as LMStudioCredentials,
          lastConnectedAt: '2024-01-01T00:00:00Z',
          availableModels: [
            { id: 'lmstudio/some-model', name: 'Some Model', toolSupport: 'unknown' as ToolSupportStatus },
          ],
        },
      });
      const params: BuildProviderConfigParams = {
        providerId: 'lmstudio',
        providerSettings,
      };

      const result = buildProviderConfig(params);

      expect(result).not.toBeNull();
      expect(result!.models['some-model'].tools).toBe(false);
    });

    it('should strip "lmstudio/" prefix from modelId', () => {
      const providerSettings = createProviderSettings({
        lmstudio: createConnectedProvider('lmstudio', {
          type: 'lmstudio',
          serverUrl: 'http://localhost:1234',
        } as LMStudioCredentials, 'lmstudio/deepseek-coder'),
      });
      const params: BuildProviderConfigParams = {
        providerId: 'lmstudio',
        providerSettings,
      };

      const result = buildProviderConfig(params);

      expect(result).not.toBeNull();
      expect(result!.models).toHaveProperty('deepseek-coder');
      expect(result!.models).not.toHaveProperty('lmstudio/deepseek-coder');
    });
  });
});

describe('buildAllStandardProviders', () => {
  const mockGetApiKey = vi.fn<(id: string) => string | null>();
  const mockGetProxyBaseURL = vi.fn<(id: string) => Promise<string>>();

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetApiKey.mockReturnValue(null);
    mockGetProxyBaseURL.mockResolvedValue('http://localhost:8080/v1');
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should return empty object when no providers connected', async () => {
    const providerSettings = createProviderSettings({});

    const result = await buildAllStandardProviders(providerSettings, mockGetApiKey);

    expect(result).toEqual({});
  });

  it('should return configs for multiple connected providers', async () => {
    const providerSettings = createProviderSettings({
      ollama: createConnectedProvider('ollama', {
        type: 'ollama',
        serverUrl: 'http://localhost:11434',
      } as OllamaCredentials, 'llama3'),
      lmstudio: createConnectedProvider('lmstudio', {
        type: 'lmstudio',
        serverUrl: 'http://localhost:1234',
      } as LMStudioCredentials, 'deepseek-coder'),
    });

    const result = await buildAllStandardProviders(providerSettings, mockGetApiKey);

    expect(result).toHaveProperty('ollama');
    expect(result).toHaveProperty('lmstudio');
    expect(Object.keys(result)).toHaveLength(2);
  });

  it('should skip providers that fail validation', async () => {
    const providerSettings = createProviderSettings({
      ollama: createConnectedProvider('ollama', {
        type: 'ollama',
        serverUrl: 'http://localhost:11434',
      } as OllamaCredentials, 'llama3'),
      lmstudio: {
        providerId: 'lmstudio',
        connectionStatus: 'disconnected', // This one should be skipped
        selectedModelId: 'deepseek-coder',
        credentials: {
          type: 'lmstudio',
          serverUrl: 'http://localhost:1234',
        } as LMStudioCredentials,
        lastConnectedAt: '2024-01-01T00:00:00Z',
      },
    });

    const result = await buildAllStandardProviders(providerSettings, mockGetApiKey);

    expect(result).toHaveProperty('ollama');
    expect(result).not.toHaveProperty('lmstudio');
    expect(Object.keys(result)).toHaveLength(1);
  });

  it('should use apiKey from getApiKey for LiteLLM when hasApiKey is true', async () => {
    mockGetApiKey.mockImplementation((id: string) => {
      if (id === 'litellm') return 'sk-litellm-key';
      return null;
    });

    const providerSettings = createProviderSettings({
      litellm: createConnectedProvider('litellm', {
        type: 'litellm',
        serverUrl: 'http://localhost:4000',
        hasApiKey: true,
        keyPrefix: 'sk-***',
      } as LiteLLMCredentials, 'gpt-4'),
    });

    const result = await buildAllStandardProviders(providerSettings, mockGetApiKey);

    expect(result).toHaveProperty('litellm');
    expect(result.litellm.options.apiKey).toBe('sk-litellm-key');
    expect(mockGetApiKey).toHaveBeenCalledWith('litellm');
  });

  it('should not include apiKey for LiteLLM when hasApiKey is false', async () => {
    const providerSettings = createProviderSettings({
      litellm: createConnectedProvider('litellm', {
        type: 'litellm',
        serverUrl: 'http://localhost:4000',
        hasApiKey: false,
      } as LiteLLMCredentials, 'gpt-4'),
    });

    const result = await buildAllStandardProviders(providerSettings, mockGetApiKey);

    expect(result).toHaveProperty('litellm');
    expect(result.litellm.options).not.toHaveProperty('apiKey');
  });

  it('should use proxyURL from getProxyBaseURL for Moonshot', async () => {
    mockGetProxyBaseURL.mockResolvedValue('http://moonshot-proxy:9000/v1');

    const providerSettings = createProviderSettings({
      moonshot: createConnectedProvider('moonshot', {
        type: 'api_key',
        keyPrefix: 'sk-moon-***',
      } as ApiKeyCredentials, 'kimi-latest'),
    });

    const result = await buildAllStandardProviders(providerSettings, mockGetApiKey, mockGetProxyBaseURL);

    expect(result).toHaveProperty('moonshot');
    expect(result.moonshot.options.baseURL).toBe('http://moonshot-proxy:9000/v1');
    expect(mockGetProxyBaseURL).toHaveBeenCalledWith('moonshot');
  });

  it('should skip Moonshot when no proxyBaseURL provider is given', async () => {
    const providerSettings = createProviderSettings({
      moonshot: createConnectedProvider('moonshot', {
        type: 'api_key',
        keyPrefix: 'sk-moon-***',
      } as ApiKeyCredentials, 'kimi-latest'),
    });

    // Don't provide getProxyBaseURL
    const result = await buildAllStandardProviders(providerSettings, mockGetApiKey);

    // Moonshot should be skipped because it requires a proxy
    expect(result).not.toHaveProperty('moonshot');
  });

  it('should include apiKey for Moonshot when provided via getApiKey', async () => {
    mockGetApiKey.mockImplementation((id: string) => {
      if (id === 'moonshot') return 'sk-moonshot-key';
      return null;
    });
    mockGetProxyBaseURL.mockResolvedValue('http://moonshot-proxy:9000/v1');

    const providerSettings = createProviderSettings({
      moonshot: createConnectedProvider('moonshot', {
        type: 'api_key',
        keyPrefix: 'sk-moon-***',
      } as ApiKeyCredentials, 'kimi-latest'),
    });

    const result = await buildAllStandardProviders(providerSettings, mockGetApiKey, mockGetProxyBaseURL);

    expect(result).toHaveProperty('moonshot');
    expect(result.moonshot.options.apiKey).toBe('sk-moonshot-key');
  });
});
