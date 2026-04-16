/**
 * @vitest-environment jsdom
 *
 * Unit tests for IntegrationsPanel 3-tab layout (T035 / US8)
 *
 * Validates:
 * - Three tabs (Messaging, Connectors, Custom) are rendered
 * - Messaging tab is the default active tab
 * - WhatsApp card and Slack card appear in Messaging tab
 * - Google accounts section appears in Connectors tab
 * - OAuth connector cards (Jira, GitHub, etc.) appear in Connectors tab
 * - Custom tab shows the connector add form
 * - Shared error zone appears between tabs and tab content (always visible)
 * - Error zone dismiss button clears the error
 */

import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import settingsEn from '../../../../locales/en/settings.json';

function t(key: string): string {
  const value = key.split('.').reduce<unknown>((cur, seg) => {
    if (cur && typeof cur === 'object' && seg in cur) {
      return (cur as Record<string, unknown>)[seg];
    }
    return undefined;
  }, settingsEn);
  return typeof value === 'string' ? value : key;
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
  getBuiltInConnectorAuthStatus: vi.fn().mockResolvedValue([]),
  loginBuiltInConnector: vi.fn().mockRejectedValue(new Error('Auth failed')),
  logoutBuiltInConnector: vi.fn().mockResolvedValue(undefined),
  lightdashGetServerUrl: vi.fn().mockResolvedValue(null),
  lightdashSetServerUrl: vi.fn().mockResolvedValue(undefined),
  datadogGetServerUrl: vi.fn().mockResolvedValue(null),
  datadogSetServerUrl: vi.fn().mockResolvedValue(undefined),
  getGoogleAccounts: vi.fn().mockResolvedValue([]),
};

vi.mock('@/lib/accomplish', () => ({
  getAccomplish: () => mockAccomplish,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => t(key),
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

vi.mock('@/components/settings/integrations/WhatsAppCard', () => ({
  WhatsAppCard: () => <div data-testid="whatsapp-card-mock" />,
}));

vi.mock('@/components/settings/google-accounts/GoogleAccountsSection', () => ({
  GoogleAccountsSection: () => <div data-testid="google-accounts-section-mock" />,
}));

import { IntegrationsPanel } from '@/components/settings/integrations';

describe('IntegrationsPanel — 3-tab layout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAccomplish.getConnectors.mockResolvedValue([]);
    mockAccomplish.getSlackMcpOauthStatus.mockResolvedValue({
      connected: false,
      pendingAuthorization: false,
    });
    mockAccomplish.getBuiltInConnectorAuthStatus.mockResolvedValue([]);
    mockAccomplish.loginBuiltInConnector.mockRejectedValue(new Error('Auth failed'));
  });

  afterEach(cleanup);

  describe('tab structure', () => {
    it('renders all three tab triggers', () => {
      render(<IntegrationsPanel />);
      expect(
        screen.getByRole('tab', { name: t('integrations.tabs.messaging') }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('tab', { name: t('integrations.tabs.connectors') }),
      ).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: t('integrations.tabs.custom') })).toBeInTheDocument();
    });

    it('defaults to the Messaging tab as active', () => {
      render(<IntegrationsPanel />);
      const messagingTab = screen.getByRole('tab', { name: t('integrations.tabs.messaging') });
      expect(messagingTab).toHaveAttribute('data-state', 'active');
    });
  });

  describe('Messaging tab', () => {
    it('shows WhatsApp card in the Messaging tab by default', async () => {
      render(<IntegrationsPanel />);
      await waitFor(() => {
        expect(screen.getByTestId('whatsapp-card-mock')).toBeInTheDocument();
      });
    });

    it('shows the Slack auth card in the Messaging tab', async () => {
      render(<IntegrationsPanel />);
      await waitFor(() => {
        expect(screen.getByTestId('slack-auth-card')).toBeInTheDocument();
      });
    });
  });

  describe('Connectors tab', () => {
    it('shows Google accounts section when Connectors tab is active', async () => {
      render(<IntegrationsPanel />);
      fireEvent.click(screen.getByRole('tab', { name: t('integrations.tabs.connectors') }));
      await waitFor(() => {
        expect(screen.getByTestId('google-accounts-section-mock')).toBeVisible();
      });
    });

    it('shows Jira OAuth card when Connectors tab is active', async () => {
      render(<IntegrationsPanel />);
      fireEvent.click(screen.getByRole('tab', { name: t('integrations.tabs.connectors') }));
      await waitFor(() => {
        expect(screen.getByTestId('jira-auth-card')).toBeVisible();
      });
    });

    it('shows GitHub OAuth card when Connectors tab is active', async () => {
      render(<IntegrationsPanel />);
      fireEvent.click(screen.getByRole('tab', { name: t('integrations.tabs.connectors') }));
      await waitFor(() => {
        expect(screen.getByTestId('github-auth-card')).toBeVisible();
      });
    });
  });

  describe('Custom tab', () => {
    it('shows the custom connector add form when Custom tab is active', async () => {
      render(<IntegrationsPanel />);
      fireEvent.click(screen.getByRole('tab', { name: t('integrations.tabs.custom') }));
      await waitFor(() => {
        // ConnectorAddForm renders a URL input for adding custom connectors
        expect(screen.getByPlaceholderText(t('connectors.placeholder'))).toBeVisible();
      });
    });
  });

  describe('shared error zone', () => {
    it('shows error zone after a failed built-in authentication', async () => {
      mockAccomplish.getBuiltInConnectorAuthStatus.mockResolvedValue([
        { providerId: 'jira', connected: false, pendingAuthorization: false },
      ]);
      mockAccomplish.loginBuiltInConnector.mockRejectedValue(new Error('Auth failed'));

      render(<IntegrationsPanel />);

      // Switch to Connectors tab and click Jira Connect
      fireEvent.click(screen.getByRole('tab', { name: t('integrations.tabs.connectors') }));
      await waitFor(() => {
        expect(screen.getByTestId('jira-auth-card')).toBeInTheDocument();
      });

      const jiraConnectBtn = screen.getByTestId('jira-auth-card-button');
      fireEvent.click(jiraConnectBtn);

      await waitFor(() => {
        expect(screen.getByTestId('tab-error-zone')).toBeInTheDocument();
      });
    });

    it('error zone contains a dismiss button', async () => {
      mockAccomplish.loginBuiltInConnector.mockRejectedValue(new Error('Auth failed'));

      render(<IntegrationsPanel />);

      fireEvent.click(screen.getByRole('tab', { name: t('integrations.tabs.connectors') }));
      await waitFor(() => screen.getByTestId('jira-auth-card-button'));
      fireEvent.click(screen.getByTestId('jira-auth-card-button'));

      await waitFor(() => {
        expect(screen.getByTestId('tab-error-zone')).toBeInTheDocument();
      });

      expect(screen.getByTestId('tab-error-dismiss')).toBeInTheDocument();
    });

    it('dismiss button clears the error zone', async () => {
      mockAccomplish.loginBuiltInConnector.mockRejectedValue(new Error('Auth failed'));

      render(<IntegrationsPanel />);

      fireEvent.click(screen.getByRole('tab', { name: t('integrations.tabs.connectors') }));
      await waitFor(() => screen.getByTestId('jira-auth-card-button'));
      fireEvent.click(screen.getByTestId('jira-auth-card-button'));

      await waitFor(() => {
        expect(screen.getByTestId('tab-error-zone')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('tab-error-dismiss'));

      await waitFor(() => {
        expect(screen.queryByTestId('tab-error-zone')).not.toBeInTheDocument();
      });
    });

    it('error zone persists when switching tabs', async () => {
      mockAccomplish.loginBuiltInConnector.mockRejectedValue(new Error('Auth failed'));

      render(<IntegrationsPanel />);

      // Trigger error in Connectors tab
      fireEvent.click(screen.getByRole('tab', { name: t('integrations.tabs.connectors') }));
      await waitFor(() => screen.getByTestId('jira-auth-card-button'));
      fireEvent.click(screen.getByTestId('jira-auth-card-button'));

      await waitFor(() => {
        expect(screen.getByTestId('tab-error-zone')).toBeInTheDocument();
      });

      // Switch to Messaging tab — error zone should still be visible
      fireEvent.click(screen.getByRole('tab', { name: t('integrations.tabs.messaging') }));

      expect(screen.getByTestId('tab-error-zone')).toBeInTheDocument();
    });
  });
});
