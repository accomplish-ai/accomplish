/**
 * @vitest-environment jsdom
 */

import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import settingsEn from '../../../../locales/en/settings.json';

function translateSettingsKey(key: string, options?: Record<string, unknown>): string {
  const value = key.split('.').reduce<unknown>((current, segment) => {
    if (current && typeof current === 'object' && segment in current) {
      return (current as Record<string, unknown>)[segment];
    }
    return undefined;
  }, settingsEn);

  if (typeof value !== 'string') {
    return key;
  }

  return Object.entries(options ?? {}).reduce((message, [name, replacement]) => {
    return message.replace(new RegExp(`{{\\s*${name}\\s*}}`, 'g'), String(replacement));
  }, value);
}

const mockAccomplish = {
  getConnectors: vi.fn().mockResolvedValue([]),
  getSlackMcpOauthStatus: vi
    .fn()
    .mockResolvedValue({ connected: false, pendingAuthorization: false }),
  loginSlackMcp: vi.fn().mockResolvedValue({ ok: true }),
  logoutSlackMcp: vi.fn().mockResolvedValue(undefined),
  addConnector: vi.fn(),
  deleteConnector: vi.fn(),
  setConnectorEnabled: vi.fn(),
  startConnectorOAuth: vi.fn(),
  disconnectConnector: vi.fn(),
};

vi.mock('@/lib/accomplish', () => ({
  getAccomplish: () => mockAccomplish,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => translateSettingsKey(key, options),
    i18n: { changeLanguage: vi.fn() },
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

import { ConnectorsPanel } from '@/components/settings/connectors';

describe('ConnectorsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAccomplish.getConnectors.mockResolvedValue([]);
    mockAccomplish.getSlackMcpOauthStatus.mockResolvedValue({
      connected: false,
      pendingAuthorization: false,
    });
    mockAccomplish.loginSlackMcp.mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    cleanup();
  });

  it('renders the built-in Slack auth card', async () => {
    render(<ConnectorsPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('slack-auth-card')).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: 'Authenticate Slack' })).toBeInTheDocument();
    expect(screen.getByText('Slack')).toBeInTheDocument();
  });

  it('starts Slack authentication from the card button', async () => {
    mockAccomplish.getSlackMcpOauthStatus
      .mockResolvedValueOnce({ connected: false, pendingAuthorization: false })
      .mockResolvedValueOnce({ connected: true, pendingAuthorization: false });

    render(<ConnectorsPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('slack-auth-button')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('slack-auth-button'));

    await waitFor(() => {
      expect(mockAccomplish.loginSlackMcp).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(screen.getByText('Connected')).toBeInTheDocument();
    });
  });
});
