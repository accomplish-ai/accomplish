import type { ProviderSettings } from '@accomplish_ai/agent-core/common';

export const baseSettings = (overrides: Partial<ProviderSettings> = {}): ProviderSettings => ({
  activeProviderId: 'anthropic',
  connectedProviders: {
    anthropic: {
      providerId: 'anthropic',
      connectionStatus: 'connected',
      selectedModelId: 'anthropic/claude-sonnet-4-6',
      credentials: { type: 'api_key', keyPrefix: 'sk-ant-' },
      lastConnectedAt: '2026-04-12T00:00:00Z',
    },
  },
  debugMode: false,
  ...overrides,
});
