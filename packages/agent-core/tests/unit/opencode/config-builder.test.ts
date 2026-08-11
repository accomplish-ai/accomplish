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

  describe('Atlas Cloud provider', () => {
    it('preserves slash-delimited model IDs in the OpenAI-compatible config', async () => {
      const result = await buildProviderConfigs({
        getApiKey: (provider) =>
          provider === 'atlascloud' ? 'test-atlascloud-api-key' : undefined,
        providerSettings: {
          connectedProviders: {
            atlascloud: {
              providerId: 'atlascloud',
              connectionStatus: 'connected',
              selectedModelId: 'atlascloud/qwen/qwen3.8-max',
              credentials: { type: 'api_key', keyPrefix: 'test-atlascloud...' },
              availableModels: [{ id: 'atlascloud/qwen/qwen3.8-max', name: 'Qwen3.8 Max' }],
            },
          },
        } as never,
      });

      const atlasConfig = result.providerConfigs.find((provider) => provider.id === 'atlascloud');
      expect(atlasConfig).toMatchObject({
        id: 'atlascloud',
        npm: '@ai-sdk/openai-compatible',
        name: 'Atlas Cloud',
        options: {
          baseURL: 'https://api.atlascloud.ai/v1',
          apiKey: 'test-atlascloud-api-key',
        },
      });
      expect(atlasConfig?.models?.['qwen/qwen3.8-max']).toEqual({
        name: 'Qwen3.8 Max',
        tools: true,
      });
    });
  });
});
