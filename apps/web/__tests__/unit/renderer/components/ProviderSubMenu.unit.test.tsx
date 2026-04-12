/**
 * @vitest-environment jsdom
 */

import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ConnectedProvider } from '@accomplish_ai/agent-core/common';

// Render Radix sub-menu primitives as plain markup so we can test content
vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenuSub: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuSubTrigger: ({
    children,
    disabled,
  }: {
    children: React.ReactNode;
    disabled?: boolean;
  }) => (
    <button data-testid="sub-trigger" disabled={disabled}>
      {children}
    </button>
  ),
  DropdownMenuSubContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="sub-content">{children}</div>
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
}));

import { ProviderSubMenu } from '@/components/ui/ProviderSubMenu';

const makeProvider = (overrides: Partial<ConnectedProvider> = {}): ConnectedProvider => ({
  providerId: 'openai',
  connectionStatus: 'connected',
  selectedModelId: 'openai/gpt-4o',
  credentials: { type: 'api_key', keyPrefix: 'sk-' },
  lastConnectedAt: '2026-04-12T00:00:00Z',
  ...overrides,
});

describe('ProviderSubMenu', () => {
  const onSelectModel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders provider name in the sub-menu trigger', () => {
    render(
      <ProviderSubMenu
        providerId="openai"
        provider={makeProvider()}
        onSelectModel={onSelectModel}
        disabled={false}
      />,
    );
    expect(screen.getByTestId('sub-trigger')).toHaveTextContent('OpenAI');
  });

  it('lists static models when no availableModels set', () => {
    render(
      <ProviderSubMenu
        providerId="openai"
        provider={makeProvider({ availableModels: undefined })}
        onSelectModel={onSelectModel}
        disabled={false}
      />,
    );
    const items = screen.getAllByTestId('menu-item');
    // OpenAI has static models in DEFAULT_PROVIDERS
    expect(items.length).toBeGreaterThan(0);
  });

  it('lists dynamic models when availableModels is provided', () => {
    const provider = makeProvider({
      availableModels: [
        { id: 'custom-model-1', name: 'Custom Model 1' },
        { id: 'custom-model-2', name: 'Custom Model 2' },
      ],
    });
    render(
      <ProviderSubMenu
        providerId="openai"
        provider={provider}
        onSelectModel={onSelectModel}
        disabled={false}
      />,
    );
    expect(screen.getByText('Custom Model 1')).toBeInTheDocument();
    expect(screen.getByText('Custom Model 2')).toBeInTheDocument();
  });

  it('shows "No models available" when both sources are empty', () => {
    render(
      <ProviderSubMenu
        providerId="custom"
        provider={makeProvider({ providerId: 'custom', availableModels: [] })}
        onSelectModel={onSelectModel}
        disabled={false}
      />,
    );
    expect(screen.getByText('No models available')).toBeInTheDocument();
  });

  it('calls onSelectModel with correct args when a model is clicked', () => {
    const provider = makeProvider({
      availableModels: [{ id: 'openai/gpt-4o', name: 'GPT-4o' }],
    });
    render(
      <ProviderSubMenu
        providerId="openai"
        provider={provider}
        onSelectModel={onSelectModel}
        disabled={false}
      />,
    );
    fireEvent.click(screen.getByText('GPT-4o'));
    expect(onSelectModel).toHaveBeenCalledWith('openai', 'openai/gpt-4o');
  });

  it('disables all items when disabled=true', () => {
    const provider = makeProvider({
      availableModels: [{ id: 'openai/gpt-4o', name: 'GPT-4o' }],
    });
    render(
      <ProviderSubMenu
        providerId="openai"
        provider={provider}
        onSelectModel={onSelectModel}
        disabled={true}
      />,
    );
    expect(screen.getByTestId('sub-trigger')).toBeDisabled();
    screen.getAllByTestId('menu-item').forEach((item) => {
      expect(item).toBeDisabled();
    });
  });
});
