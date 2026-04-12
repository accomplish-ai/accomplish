/**
 * @vitest-environment jsdom
 */

import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { ProviderSettings } from '@accomplish_ai/agent-core/common';
import { baseSettings } from './ModelIndicator.test-utils';

const mocks = vi.hoisted(() => ({
  state: { settings: null as ProviderSettings | null },
  updateModel: vi.fn().mockResolvedValue(undefined),
  switchProviderModel: vi.fn().mockResolvedValue(undefined),
  refetch: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode; asChild?: boolean }) => (
    <div data-testid="dropdown-trigger">{children}</div>
  ),
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dropdown-content">{children}</div>
  ),
  DropdownMenuItem: ({
    children,
    onSelect,
    disabled,
  }: {
    children: React.ReactNode;
    onSelect?: (event: Event) => void;
    disabled?: boolean;
  }) => (
    <button
      data-testid="menu-item"
      onClick={() => onSelect?.(new Event('select'))}
      disabled={disabled}
    >
      {children}
    </button>
  ),
  DropdownMenuSeparator: () => <hr data-testid="separator" />,
}));

vi.mock('@/components/ui/ProviderSubMenu', () => ({
  ProviderSubMenu: ({
    providerId,
    disabled,
    onSelectModel,
  }: {
    providerId: string;
    disabled: boolean;
    onSelectModel: (providerId: string, modelId: string) => Promise<void>;
  }) => (
    <div data-testid={`provider-sub-menu-${providerId}`}>
      <button
        data-testid={`select-model-${providerId}`}
        disabled={disabled}
        onClick={() => void onSelectModel(providerId, `${providerId}/test-model`)}
      >
        {providerId} model
      </button>
    </div>
  ),
}));

vi.mock('@/components/settings/hooks/useProviderSettings', () => ({
  useProviderSettings: () => ({
    settings: mocks.state.settings,
    loading: false,
    refetch: mocks.refetch,
    updateModel: mocks.updateModel,
    switchProviderModel: mocks.switchProviderModel,
  }),
}));

import { ModelIndicator } from '@/components/ui/ModelIndicator';

const twoProviderSettings = () =>
  baseSettings({
    connectedProviders: {
      anthropic: {
        providerId: 'anthropic',
        connectionStatus: 'connected',
        selectedModelId: 'anthropic/claude-sonnet-4-6',
        credentials: { type: 'api_key', keyPrefix: 'sk-ant-' },
        lastConnectedAt: '2026-04-12T00:00:00Z',
      },
      openai: {
        providerId: 'openai',
        connectionStatus: 'connected',
        selectedModelId: 'openai/gpt-4o',
        credentials: { type: 'api_key', keyPrefix: 'sk-' },
        lastConnectedAt: '2026-04-12T00:00:00Z',
      },
    },
  });

describe('ModelIndicator — US2: Cross-provider model switching', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateModel.mockResolvedValue(undefined);
    mocks.switchProviderModel.mockResolvedValue(undefined);
    mocks.refetch.mockResolvedValue(undefined);
    mocks.state.settings = twoProviderSettings();
  });

  it('renders a ProviderSubMenu for each alternative connected provider', () => {
    render(<ModelIndicator />);
    expect(screen.getByTestId('provider-sub-menu-openai')).toBeInTheDocument();
  });

  it('does not render a ProviderSubMenu for the active provider', () => {
    render(<ModelIndicator />);
    expect(screen.queryByTestId('provider-sub-menu-anthropic')).not.toBeInTheDocument();
  });

  it('calls switchProviderModel when cross-provider model is selected', async () => {
    render(<ModelIndicator />);
    fireEvent.click(screen.getByTestId('select-model-openai'));
    await waitFor(() => {
      expect(mocks.switchProviderModel).toHaveBeenCalledWith('openai', 'openai/test-model');
    });
  });

  it('does not render alternative providers section when only one provider is connected', () => {
    mocks.state.settings = baseSettings();
    render(<ModelIndicator />);
    expect(screen.queryByTestId(/provider-sub-menu-/)).not.toBeInTheDocument();
  });

  it('renders otherProviders even when active provider has no model set', () => {
    mocks.state.settings = baseSettings({
      connectedProviders: {
        anthropic: {
          providerId: 'anthropic',
          connectionStatus: 'connected',
          selectedModelId: null,
          credentials: { type: 'api_key', keyPrefix: 'sk-ant-' },
          lastConnectedAt: '2026-04-12T00:00:00Z',
        },
        openai: {
          providerId: 'openai',
          connectionStatus: 'connected',
          selectedModelId: 'openai/gpt-4o',
          credentials: { type: 'api_key', keyPrefix: 'sk-' },
          lastConnectedAt: '2026-04-12T00:00:00Z',
        },
      },
    });
    render(<ModelIndicator />);
    expect(screen.getByTestId('provider-sub-menu-openai')).toBeInTheDocument();
  });
});
