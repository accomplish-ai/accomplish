import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildProviderConfigs } from '../../../src/opencode/config-builder.js';

// Mock storage repositories so the test doesn't hit the DB
vi.mock('../../../src/storage/repositories/index.js', () => ({
  getOllamaConfig: () => null,
  getLMStudioConfig: () => null,
  getProviderSettings: () => ({
    connectedProviders: {},
  }),
  getActiveProviderModel: () => null,
  getConnectedProviderIds: () => [],
  getActiveProviderId: () => null,
  getConnectedProvider: () => null,
  getSelectedModel: () => null,
  getAzureFoundryConfig: () => null,
}));

// Mock proxy helpers
vi.mock('../../../src/opencode/proxies/index.js', () => ({
  ensureAzureFoundryProxy: vi.fn().mockResolvedValue({ baseURL: 'http://proxy' }),
  ensureMoonshotProxy: vi.fn().mockResolvedValue({ baseURL: 'http://proxy' }),
}));

describe('buildProviderConfigs', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Google AI provider', () => {
    it('registers the selected Google model so OpenCode can resolve it', async () => {
      const result = await buildProviderConfigs({
        getApiKey: (p) => (p === 'google' ? 'test-google-api-key' : undefined),
        providerSettings: {
          connectedProviders: {
            google: {
              providerId: 'google',
              connectionStatus: 'connected',
              selectedModelId: 'google/gemini-3.1-flash-lite-preview',
              credentials: { type: 'google' },
              availableModels: [
                {
                  id: 'google/gemini-3.1-flash-lite-preview',
                  name: 'Gemini 3.1 Flash Lite Preview',
                },
                { id: 'google/gemini-3-pro-preview', name: 'Gemini 3 Pro' },
              ],
            },
          },
        } as never,
      });

      const googleConfig = result.providerConfigs.find((p) => p.id === 'google');
      expect(googleConfig).toBeDefined();
      expect(googleConfig?.models).toBeDefined();
      expect(googleConfig?.models?.['gemini-3.1-flash-lite-preview']).toBeDefined();
      expect(googleConfig?.models?.['gemini-3-pro-preview']).toBeDefined();
    });

    it('falls back to registering only the selected model when availableModels is empty', async () => {
      const result = await buildProviderConfigs({
        getApiKey: (p) => (p === 'google' ? 'test-google-api-key' : undefined),
        providerSettings: {
          connectedProviders: {
            google: {
              providerId: 'google',
              connectionStatus: 'connected',
              selectedModelId: 'google/gemini-3.1-flash-lite-preview',
              credentials: { type: 'google' },
              availableModels: [],
            },
          },
        } as never,
      });

      const googleConfig = result.providerConfigs.find((p) => p.id === 'google');
      expect(googleConfig).toBeDefined();
      expect(googleConfig?.models?.['gemini-3.1-flash-lite-preview']).toBeDefined();
    });

    it('falls back to registering only the selected model when availableModels is undefined', async () => {
      const result = await buildProviderConfigs({
        getApiKey: (p) => (p === 'google' ? 'test-google-api-key' : undefined),
        providerSettings: {
          connectedProviders: {
            google: {
              providerId: 'google',
              connectionStatus: 'connected',
              selectedModelId: 'google/gemini-3.1-flash-lite-preview',
              credentials: { type: 'google' },
            },
          },
        } as never,
      });

      const googleConfig = result.providerConfigs.find((p) => p.id === 'google');
      expect(googleConfig).toBeDefined();
      expect(googleConfig?.models?.['gemini-3.1-flash-lite-preview']).toBeDefined();
    });

    it('does not push google providerConfig when no API key is set', async () => {
      const result = await buildProviderConfigs({
        getApiKey: () => undefined,
        providerSettings: {
          connectedProviders: {
            google: {
              providerId: 'google',
              connectionStatus: 'connected',
              selectedModelId: 'google/gemini-3-pro-preview',
              credentials: { type: 'google' },
              availableModels: [],
            },
          },
        } as never,
      });

      const googleConfig = result.providerConfigs.find((p) => p.id === 'google');
      expect(googleConfig).toBeUndefined();
    });
  });

  describe('Anthropic provider (custom base URL)', () => {
    it('emits an anthropic override with options.baseURL when a custom base URL is set', async () => {
      const result = await buildProviderConfigs({
        getApiKey: (p) => (p === 'anthropic' ? 'sk-ant-test' : undefined),
        providerSettings: {
          connectedProviders: {
            anthropic: {
              providerId: 'anthropic',
              connectionStatus: 'connected',
              selectedModelId: 'anthropic/claude-opus-4-5',
              credentials: { type: 'api_key' },
              customBaseUrl: 'https://proxy.example.com/v1/',
            },
          },
        } as never,
      });

      const anthropicConfig = result.providerConfigs.find((p) => p.id === 'anthropic');
      expect(anthropicConfig).toBeDefined();
      // Trailing slash is stripped.
      expect(anthropicConfig?.options?.baseURL).toBe('https://proxy.example.com/v1');
      expect(anthropicConfig?.options?.apiKey).toBe('sk-ant-test');
      expect(anthropicConfig?.models?.['claude-opus-4-5']).toBeDefined();
    });

    it('does not emit an anthropic override when no custom base URL is set (built-in provider is used)', async () => {
      const result = await buildProviderConfigs({
        getApiKey: (p) => (p === 'anthropic' ? 'sk-ant-test' : undefined),
        providerSettings: {
          connectedProviders: {
            anthropic: {
              providerId: 'anthropic',
              connectionStatus: 'connected',
              selectedModelId: 'anthropic/claude-opus-4-5',
              credentials: { type: 'api_key' },
            },
          },
        } as never,
      });

      const anthropicConfig = result.providerConfigs.find((p) => p.id === 'anthropic');
      expect(anthropicConfig).toBeUndefined();
    });

    it('does not emit an anthropic override when the base URL is only whitespace', async () => {
      const result = await buildProviderConfigs({
        getApiKey: (p) => (p === 'anthropic' ? 'sk-ant-test' : undefined),
        providerSettings: {
          connectedProviders: {
            anthropic: {
              providerId: 'anthropic',
              connectionStatus: 'connected',
              selectedModelId: 'anthropic/claude-opus-4-5',
              credentials: { type: 'api_key' },
              customBaseUrl: '   ',
            },
          },
        } as never,
      });

      const anthropicConfig = result.providerConfigs.find((p) => p.id === 'anthropic');
      expect(anthropicConfig).toBeUndefined();
    });
  });
});
