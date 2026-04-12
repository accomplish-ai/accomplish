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
  ProviderSubMenu: ({ providerId }: { providerId: string }) => (
    <div data-testid={`provider-sub-menu-${providerId}`} />
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

describe('ModelIndicator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateModel.mockResolvedValue(undefined);
    mocks.switchProviderModel.mockResolvedValue(undefined);
    mocks.refetch.mockResolvedValue(undefined);
    mocks.state.settings = baseSettings();
  });

  describe('US1 — Same-provider model switching', () => {
    it('shows current model with "Current" label and model display name', () => {
      render(<ModelIndicator />);
      const content = screen.getByTestId('dropdown-content');
      expect(content).toHaveTextContent('Current');
      expect(content).toHaveTextContent(/claude/i);
    });

    it('lists sibling models below current model', () => {
      mocks.state.settings = baseSettings({
        connectedProviders: {
          anthropic: {
            providerId: 'anthropic',
            connectionStatus: 'connected',
            selectedModelId: 'anthropic/claude-sonnet-4-6',
            credentials: { type: 'api_key', keyPrefix: 'sk-ant-' },
            lastConnectedAt: '2026-04-12T00:00:00Z',
            availableModels: [
              { id: 'anthropic/claude-sonnet-4-6', name: 'Claude Sonnet 4.6' },
              { id: 'anthropic/claude-opus-4-6', name: 'Claude Opus 4.6' },
              { id: 'anthropic/claude-haiku-4-5', name: 'Claude Haiku 4.5' },
            ],
          },
        },
      });
      render(<ModelIndicator />);
      const itemTexts = screen.getAllByTestId('menu-item').map((i) => i.textContent);
      expect(itemTexts).toContain('Claude Opus 4.6');
      expect(itemTexts).toContain('Claude Haiku 4.5');
      // Selected model must not appear as a switchable item
      expect(itemTexts).not.toContain('Claude Sonnet 4.6');
    });

    it('calls updateModel when a sibling model is clicked', async () => {
      mocks.state.settings = baseSettings({
        connectedProviders: {
          anthropic: {
            providerId: 'anthropic',
            connectionStatus: 'connected',
            selectedModelId: 'anthropic/claude-sonnet-4-6',
            credentials: { type: 'api_key', keyPrefix: 'sk-ant-' },
            lastConnectedAt: '2026-04-12T00:00:00Z',
            availableModels: [
              { id: 'anthropic/claude-sonnet-4-6', name: 'Claude Sonnet 4.6' },
              { id: 'anthropic/claude-opus-4-6', name: 'Claude Opus 4.6' },
            ],
          },
        },
      });
      render(<ModelIndicator />);
      fireEvent.click(screen.getByText('Claude Opus 4.6'));
      await waitFor(() => {
        expect(mocks.updateModel).toHaveBeenCalledWith('anthropic', 'anthropic/claude-opus-4-6');
      });
    });

    it('shows no sibling items when provider has only one model', () => {
      mocks.state.settings = baseSettings({
        connectedProviders: {
          anthropic: {
            providerId: 'anthropic',
            connectionStatus: 'connected',
            selectedModelId: 'anthropic/claude-sonnet-4-6',
            credentials: { type: 'api_key', keyPrefix: 'sk-ant-' },
            lastConnectedAt: '2026-04-12T00:00:00Z',
            availableModels: [{ id: 'anthropic/claude-sonnet-4-6', name: 'Claude Sonnet 4.6' }],
          },
        },
      });
      render(<ModelIndicator />);
      expect(screen.queryAllByTestId('menu-item')).toHaveLength(0);
    });
  });

  describe('US3 — No settings navigation in dropdown', () => {
    it('has no "Change Model" text in any dropdown state', () => {
      render(<ModelIndicator />);
      expect(screen.queryByText(/change model/i)).not.toBeInTheDocument();
    });

    it('has no "Configure Model" text in warning state (no model configured)', () => {
      mocks.state.settings = { activeProviderId: null, connectedProviders: {}, debugMode: false };
      render(<ModelIndicator />);
      expect(screen.queryByText(/configure model/i)).not.toBeInTheDocument();
    });
  });

  describe('Running state', () => {
    it('renders plain text instead of dropdown when isRunning=true', () => {
      render(<ModelIndicator isRunning={true} />);
      expect(screen.queryByTestId('dropdown-content')).not.toBeInTheDocument();
      expect(screen.queryByTestId('dropdown-trigger')).not.toBeInTheDocument();
    });
  });

  describe('hideWhenNoModel', () => {
    it('returns null when no model and hideWhenNoModel=true', () => {
      mocks.state.settings = { activeProviderId: null, connectedProviders: {}, debugMode: false };
      const { container } = render(<ModelIndicator hideWhenNoModel={true} />);
      expect(container.innerHTML).toBe('');
    });
  });
});
