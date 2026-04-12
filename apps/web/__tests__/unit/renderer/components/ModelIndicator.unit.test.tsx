/**
 * @vitest-environment jsdom
 */

import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { ProviderSettings } from '@accomplish_ai/agent-core/common';

// Render Radix dropdown as plain markup so test logic is not blocked by pointer events
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
    onClick,
    disabled,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button data-testid="menu-item" onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
  DropdownMenuSeparator: () => <hr data-testid="separator" />,
}));

// Mock ProviderSubMenu so cross-provider tests are isolated
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

const mockUpdateModel = vi.fn().mockResolvedValue(undefined);
const mockSwitchProviderModel = vi.fn().mockResolvedValue(undefined);
const mockRefetch = vi.fn().mockResolvedValue(undefined);

vi.mock('@/components/settings/hooks/useProviderSettings', () => ({
  useProviderSettings: () => ({
    settings: mockSettings,
    loading: false,
    refetch: mockRefetch,
    updateModel: mockUpdateModel,
    switchProviderModel: mockSwitchProviderModel,
  }),
}));

// settings is module-level so tests can mutate it via Object.assign
let mockSettings: ProviderSettings | null = null;

import { ModelIndicator } from '@/components/ui/ModelIndicator';

const baseSettings = (overrides: Partial<ProviderSettings> = {}): ProviderSettings => ({
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

describe('ModelIndicator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSettings = baseSettings();
  });

  describe('US1 — Same-provider model switching', () => {
    it('shows current model with "Current" label and model display name', () => {
      render(<ModelIndicator onOpenSettings={vi.fn()} />);
      const content = screen.getByTestId('dropdown-content');
      expect(content).toHaveTextContent('Current');
      expect(content).toHaveTextContent(/claude/i);
    });

    it('lists sibling models below current model', () => {
      // Add a second model by using availableModels
      mockSettings = baseSettings({
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
      render(<ModelIndicator onOpenSettings={vi.fn()} />);
      const items = screen.getAllByTestId('menu-item');
      const itemTexts = items.map((i) => i.textContent);
      // Opus and Haiku should appear as sibling items; Sonnet should NOT appear as a menu item
      expect(itemTexts).toContain('Claude Opus 4.6');
      expect(itemTexts).toContain('Claude Haiku 4.5');
      expect(itemTexts).not.toContain('Claude Sonnet 4.6');
    });

    it('calls updateModel when a sibling model is clicked', async () => {
      mockSettings = baseSettings({
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
      render(<ModelIndicator onOpenSettings={vi.fn()} />);
      fireEvent.click(screen.getByText('Claude Opus 4.6'));
      // Allow the async handler to flush
      await waitFor(() => {
        expect(mockUpdateModel).toHaveBeenCalledWith('anthropic', 'anthropic/claude-opus-4-6');
      });
    });

    it('shows no sibling items when provider has only one model', () => {
      mockSettings = baseSettings({
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
      render(<ModelIndicator onOpenSettings={vi.fn()} />);
      // No clickable model items should be present (only the static "current" block)
      expect(screen.queryAllByTestId('menu-item')).toHaveLength(0);
    });
  });

  describe('US2 — Cross-provider model switching', () => {
    beforeEach(() => {
      mockSettings = baseSettings({
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
    });

    it('renders a ProviderSubMenu for each alternative connected provider', () => {
      render(<ModelIndicator onOpenSettings={vi.fn()} />);
      expect(screen.getByTestId('provider-sub-menu-openai')).toBeInTheDocument();
    });

    it('does not render a ProviderSubMenu for the active provider', () => {
      render(<ModelIndicator onOpenSettings={vi.fn()} />);
      expect(screen.queryByTestId('provider-sub-menu-anthropic')).not.toBeInTheDocument();
    });

    it('calls switchProviderModel when cross-provider model is selected', async () => {
      render(<ModelIndicator onOpenSettings={vi.fn()} />);
      fireEvent.click(screen.getByTestId('select-model-openai'));
      await waitFor(() => {
        expect(mockSwitchProviderModel).toHaveBeenCalledWith('openai', 'openai/test-model');
      });
    });

    it('does not render alternative providers section when only one provider is connected', () => {
      mockSettings = baseSettings(); // single provider
      render(<ModelIndicator onOpenSettings={vi.fn()} />);
      expect(screen.queryByTestId(/provider-sub-menu-/)).not.toBeInTheDocument();
    });
  });

  describe('US3 — No settings navigation in dropdown', () => {
    it('has no "Change Model" text in any dropdown state', () => {
      render(<ModelIndicator onOpenSettings={vi.fn()} />);
      expect(screen.queryByText(/change model/i)).not.toBeInTheDocument();
    });

    it('has no "Configure Model" text in warning state (no model configured)', () => {
      mockSettings = {
        activeProviderId: null,
        connectedProviders: {},
        debugMode: false,
      };
      render(<ModelIndicator onOpenSettings={vi.fn()} />);
      expect(screen.queryByText(/configure model/i)).not.toBeInTheDocument();
    });
  });

  describe('Running state', () => {
    it('renders plain text instead of dropdown when isRunning=true', () => {
      render(<ModelIndicator onOpenSettings={vi.fn()} isRunning={true} />);
      expect(screen.queryByTestId('dropdown-content')).not.toBeInTheDocument();
      expect(screen.queryByTestId('dropdown-trigger')).not.toBeInTheDocument();
    });
  });

  describe('hideWhenNoModel', () => {
    it('returns null when no model and hideWhenNoModel=true', () => {
      mockSettings = { activeProviderId: null, connectedProviders: {}, debugMode: false };
      const { container } = render(
        <ModelIndicator onOpenSettings={vi.fn()} hideWhenNoModel={true} />,
      );
      expect(container.innerHTML).toBe('');
    });
  });
});
