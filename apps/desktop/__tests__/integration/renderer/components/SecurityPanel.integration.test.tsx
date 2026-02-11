/**
 * Integration tests for SecurityPanel component
 * @module __tests__/integration/renderer/components/SecurityPanel.integration.test
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mockGetSandboxConfig = vi.fn();
const mockSetSandboxConfig = vi.fn();

vi.mock('@/lib/accomplish', () => ({
  getAccomplish: () => ({
    getSandboxConfig: mockGetSandboxConfig,
    setSandboxConfig: mockSetSandboxConfig,
  }),
}));

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: { children?: React.ReactNode; [key: string]: unknown }) => (
      <div {...props}>{children}</div>
    ),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { SecurityPanel } from '@/components/settings/SecurityPanel';

describe('SecurityPanel Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSetSandboxConfig.mockResolvedValue(undefined);
  });

  it('renders with partial persisted sandbox config without crashing', async () => {
    mockGetSandboxConfig.mockResolvedValue({
      enabled: true,
      allowedDomains: ['news.ycombinator.com'],
    });

    render(<SecurityPanel />);

    await waitFor(() => {
      expect(screen.getByText('Sandbox Security')).toBeInTheDocument();
    });

    expect(screen.getByPlaceholderText('/path/to/directory')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('/path/to/sensitive/directory')).toBeInTheDocument();
    expect(screen.getByText('news.ycombinator.com')).toBeInTheDocument();
  });

  it('allows adding multiple domains and does not refetch config on each edit', async () => {
    mockGetSandboxConfig.mockResolvedValue({
      enabled: true,
      allowedDomains: [],
      additionalWritePaths: [],
      denyReadPaths: [],
      allowPty: true,
      allowLocalBinding: true,
      allowAllUnixSockets: true,
      enableWeakerNestedSandbox: false,
    });

    const onApplied = vi.fn();
    render(<SecurityPanel onApplied={onApplied} />);

    const domainInput = await screen.findByPlaceholderText('example.com or *.example.com');
    expect(mockGetSandboxConfig).toHaveBeenCalledTimes(1);

    fireEvent.change(domainInput, { target: { value: 'news.ycombinator.com' } });
    fireEvent.keyDown(domainInput, { key: 'Enter', code: 'Enter' });
    expect(await screen.findByText('news.ycombinator.com')).toBeInTheDocument();

    fireEvent.change(domainInput, { target: { value: 'example.com' } });
    fireEvent.keyDown(domainInput, { key: 'Enter', code: 'Enter' });
    expect(await screen.findByText('example.com')).toBeInTheDocument();
    expect(screen.getByText('news.ycombinator.com')).toBeInTheDocument();

    expect(mockGetSandboxConfig).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Apply Changes' }));
    await waitFor(() => {
      expect(mockSetSandboxConfig).toHaveBeenCalledTimes(1);
    });
    expect(onApplied).toHaveBeenCalledTimes(1);
    expect(mockSetSandboxConfig).toHaveBeenLastCalledWith(
      expect.objectContaining({
        allowedDomains: ['news.ycombinator.com', 'example.com'],
      })
    );
  });
});
