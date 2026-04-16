/**
 * @vitest-environment jsdom
 *
 * Unit tests for LightdashConnectorCard (T023)
 *
 * Validates:
 * - Empty URL disables Save button and does not call lightdashSetServerUrl
 * - HTTP URLs accepted
 * - HTTPS URLs accepted
 * - URL field pre-populated from lightdashGetServerUrl() after mount
 * - noInstance status shown when no URL stored
 * - URL persists in input after disconnect (field still populated when authState.connected flips)
 */

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import settingsEn from '../../../../locales/en/settings.json';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetServerUrl = vi.fn();
const mockSetServerUrl = vi.fn();

vi.mock('@/lib/accomplish', () => ({
  getAccomplish: () => ({
    lightdashGetServerUrl: mockGetServerUrl,
    lightdashSetServerUrl: mockSetServerUrl,
  }),
}));

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

import { LightdashConnectorCard } from '@/components/settings/connectors/LightdashConnectorCard';

const disconnected = { connected: false, pendingAuthorization: false };
const connected = { connected: true, pendingAuthorization: false };

const baseProps = {
  authState: disconnected,
  actionLoading: false,
  onAuthenticate: vi.fn(),
  onDisconnect: vi.fn(),
  refetch: vi.fn().mockResolvedValue(undefined),
};

afterEach(cleanup);

describe('LightdashConnectorCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    baseProps.refetch = vi.fn().mockResolvedValue(undefined);
    mockGetServerUrl.mockResolvedValue(null);
    mockSetServerUrl.mockResolvedValue(undefined);
  });

  describe('noInstance state (no URL stored)', () => {
    it('shows the URL input field', async () => {
      render(<LightdashConnectorCard {...baseProps} />);
      await waitFor(() => {
        expect(screen.getByPlaceholderText(/lightdash/i)).toBeInTheDocument();
      });
    });

    it('shows noInstance status text', async () => {
      render(<LightdashConnectorCard {...baseProps} />);
      await waitFor(() => {
        const ldSection = (settingsEn.connectors as Record<string, unknown>)?.lightdash as Record<
          string,
          unknown
        >;
        const statusSection = ldSection?.status as Record<string, string>;
        const noInstanceLabel = statusSection?.noInstance;
        expect(noInstanceLabel).toBeDefined();
        expect(screen.getByText(noInstanceLabel!)).toBeInTheDocument();
      });
    });
  });

  describe('URL validation', () => {
    it('disables Save button and does not call lightdashSetServerUrl for empty input', async () => {
      render(<LightdashConnectorCard {...baseProps} />);
      await waitFor(() => {
        expect(screen.getByPlaceholderText(/lightdash/i)).toBeInTheDocument();
      });

      // Click Save without entering a URL (button disabled when input is empty — check it stays disabled)
      const saveBtn = screen.getByRole('button', { name: /save/i });
      expect(saveBtn).toBeDisabled();
      expect(mockSetServerUrl).not.toHaveBeenCalled();
    });

    it('accepts HTTPS URLs and calls lightdashSetServerUrl', async () => {
      render(<LightdashConnectorCard {...baseProps} />);
      await waitFor(() => {
        expect(screen.getByPlaceholderText(/lightdash/i)).toBeInTheDocument();
      });

      fireEvent.change(screen.getByPlaceholderText(/lightdash/i), {
        target: { value: 'https://lightdash.mycompany.com' },
      });
      fireEvent.click(screen.getByRole('button', { name: /save/i }));

      await waitFor(() => {
        expect(mockSetServerUrl).toHaveBeenCalledWith(
          expect.stringContaining('https://lightdash.mycompany.com'),
        );
      });
    });

    it('accepts HTTP URLs and calls lightdashSetServerUrl', async () => {
      render(<LightdashConnectorCard {...baseProps} />);
      await waitFor(() => {
        expect(screen.getByPlaceholderText(/lightdash/i)).toBeInTheDocument();
      });

      fireEvent.change(screen.getByPlaceholderText(/lightdash/i), {
        target: { value: 'http://internal.lightdash.local' },
      });
      fireEvent.click(screen.getByRole('button', { name: /save/i }));

      await waitFor(() => {
        expect(mockSetServerUrl).toHaveBeenCalledWith(
          expect.stringContaining('http://internal.lightdash.local'),
        );
      });
    });
  });

  describe('URL pre-population', () => {
    it('pre-populates the URL input from lightdashGetServerUrl() on mount', async () => {
      mockGetServerUrl.mockResolvedValue('https://analytics.mycompany.com/api/v1/mcp');

      render(<LightdashConnectorCard {...baseProps} />);

      // The URL is stored — card hides the input and shows the saved URL instead
      await waitFor(() => {
        expect(screen.getByText('https://analytics.mycompany.com/api/v1/mcp')).toBeInTheDocument();
      });
    });

    it('shows Edit button once a URL is saved (not the input form)', async () => {
      mockGetServerUrl.mockResolvedValue('https://analytics.mycompany.com/api/v1/mcp');
      render(<LightdashConnectorCard {...baseProps} />);

      await waitFor(() => {
        expect(screen.queryByPlaceholderText(/lightdash/i)).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: /edit/i })).toBeInTheDocument();
      });
    });
  });

  describe('URL persistence after disconnect', () => {
    it('URL field is still populated after transitioning from connected to disconnected', async () => {
      const savedUrl = 'https://analytics.mycompany.com/api/v1/mcp';
      mockGetServerUrl.mockResolvedValue(savedUrl);

      const { rerender } = render(<LightdashConnectorCard {...baseProps} authState={connected} />);

      await waitFor(() => {
        expect(screen.getByText(savedUrl)).toBeInTheDocument();
      });

      // Simulate disconnect
      rerender(<LightdashConnectorCard {...baseProps} authState={disconnected} />);

      // URL should still be displayed (not cleared)
      expect(screen.getByText(savedUrl)).toBeInTheDocument();
    });
  });

  describe('Edit flow', () => {
    it('clicking Edit re-shows the URL input with the existing value', async () => {
      mockGetServerUrl.mockResolvedValue('https://analytics.mycompany.com/api/v1/mcp');
      render(<LightdashConnectorCard {...baseProps} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /edit/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /edit/i }));

      const input = screen.getByPlaceholderText(/lightdash/i);
      expect(input).toBeInTheDocument();
      expect((input as HTMLInputElement).value).toBe('https://analytics.mycompany.com/api/v1/mcp');
    });
  });
});
