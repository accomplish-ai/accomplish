/**
 * @vitest-environment jsdom
 *
 * Unit tests for OAuthConnectorCard (T015)
 *
 * Validates:
 * - Connect button shown when disconnected; Disconnect button when connected
 * - Button is disabled while actionLoading is true
 * - marketplaceUrl renders a link when disconnected, hidden when connected
 * - Pending authorization shows "Reconnect" button text
 * - Provider-specific displayName and icon rendered
 */

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import settingsEn from '../../../../locales/en/settings.json';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const value = key.split('.').reduce<unknown>((cur, seg) => {
        if (cur && typeof cur === 'object' && seg in cur) {
          return (cur as Record<string, unknown>)[seg];
        }
        return undefined;
      }, settingsEn);
      return typeof value === 'string' ? value : key;
    },
    i18n: { changeLanguage: vi.fn() },
  }),
}));

import { OAuthConnectorCard } from '@/components/settings/connectors/OAuthConnectorCard';

const disconnected = { connected: false, pendingAuthorization: false };
const connected = { connected: true, pendingAuthorization: false };
const pending = { connected: false, pendingAuthorization: true };

const baseProps = {
  iconSrc: '/assets/icons/integrations/jira.svg',
  displayName: 'Jira',
  actionLoading: false,
  onAuthenticate: vi.fn(),
  onDisconnect: vi.fn(),
  testId: 'jira-card',
};

afterEach(cleanup);

describe('OAuthConnectorCard', () => {
  describe('disconnected state', () => {
    it('renders the Connect button', () => {
      render(<OAuthConnectorCard {...baseProps} authState={disconnected} />);
      expect(screen.getByRole('button', { name: /connect/i })).toBeInTheDocument();
    });

    it('renders the provider display name', () => {
      render(<OAuthConnectorCard {...baseProps} authState={disconnected} />);
      expect(screen.getByText('Jira')).toBeInTheDocument();
    });

    it('renders the icon img', () => {
      const { container } = render(<OAuthConnectorCard {...baseProps} authState={disconnected} />);
      // alt="" makes the img presentational; query via container
      const img = container.querySelector('img');
      expect(img).not.toBeNull();
      expect(img).toHaveAttribute('src', '/assets/icons/integrations/jira.svg');
    });

    it('calls onAuthenticate when Connect is clicked', () => {
      const onAuthenticate = vi.fn();
      render(
        <OAuthConnectorCard
          {...baseProps}
          authState={disconnected}
          onAuthenticate={onAuthenticate}
        />,
      );
      fireEvent.click(screen.getByTestId('jira-card-button'));
      expect(onAuthenticate).toHaveBeenCalledOnce();
    });
  });

  describe('connected state', () => {
    it('renders the Disconnect button instead of Connect', () => {
      render(<OAuthConnectorCard {...baseProps} authState={connected} />);
      expect(screen.getByRole('button', { name: /disconnect/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^connect$/i })).not.toBeInTheDocument();
    });

    it('calls onDisconnect when Disconnect is clicked', () => {
      const onDisconnect = vi.fn();
      render(
        <OAuthConnectorCard {...baseProps} authState={connected} onDisconnect={onDisconnect} />,
      );
      fireEvent.click(screen.getByRole('button', { name: /disconnect/i }));
      expect(onDisconnect).toHaveBeenCalledOnce();
    });

    it('hides marketplaceUrl link when connected', () => {
      render(
        <OAuthConnectorCard
          {...baseProps}
          authState={connected}
          marketplaceUrl="https://monday.com/marketplace"
        />,
      );
      expect(screen.queryByRole('link')).not.toBeInTheDocument();
    });
  });

  describe('pending authorization state', () => {
    it('renders "Reconnect" button text when pending', () => {
      render(<OAuthConnectorCard {...baseProps} authState={pending} />);
      expect(screen.getByRole('button', { name: /reconnect/i })).toBeInTheDocument();
    });
  });

  describe('loading state (actionLoading = true)', () => {
    it('shows spinner and "Waiting for browser" text instead of Connect button while loading', () => {
      render(<OAuthConnectorCard {...baseProps} authState={disconnected} actionLoading={true} />);
      expect(screen.queryByTestId('jira-card-button')).not.toBeInTheDocument();
      expect(screen.getByText(/waiting for browser/i)).toBeInTheDocument();
    });

    it('disables the Disconnect button while loading', () => {
      render(<OAuthConnectorCard {...baseProps} authState={connected} actionLoading={true} />);
      expect(screen.getByRole('button', { name: /disconnect/i })).toBeDisabled();
    });
  });

  describe('marketplaceUrl', () => {
    it('renders a marketplace link when disconnected and marketplaceUrl provided', () => {
      render(
        <OAuthConnectorCard
          {...baseProps}
          authState={disconnected}
          marketplaceUrl="https://monday.com/marketplace"
        />,
      );
      const link = screen.getByRole('link');
      expect(link).toHaveAttribute('href', 'https://monday.com/marketplace');
      expect(link).toHaveAttribute('target', '_blank');
    });

    it('does not render a link when marketplaceUrl is absent', () => {
      render(<OAuthConnectorCard {...baseProps} authState={disconnected} />);
      expect(screen.queryByRole('link')).not.toBeInTheDocument();
    });
  });
});
