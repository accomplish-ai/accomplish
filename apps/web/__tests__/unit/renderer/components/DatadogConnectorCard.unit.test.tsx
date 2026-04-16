/**
 * @vitest-environment jsdom
 *
 * Unit tests for DatadogConnectorCard.
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
    datadogGetServerUrl: mockGetServerUrl,
    datadogSetServerUrl: mockSetServerUrl,
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

import { DatadogConnectorCard } from '@/components/settings/connectors/DatadogConnectorCard';
import { DATADOG_REGIONS } from '@/components/settings/connectors/datadog/regions';

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

describe('DatadogConnectorCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    baseProps.refetch = vi.fn().mockResolvedValue(undefined);
    // Default: no server URL stored → show region picker immediately
    mockGetServerUrl.mockResolvedValue(null);
    mockSetServerUrl.mockResolvedValue(undefined);
  });

  describe('noSite state (no server URL stored)', () => {
    it('renders all 6 region options in the dropdown', async () => {
      render(<DatadogConnectorCard {...baseProps} />);

      await waitFor(() => {
        expect(screen.getByTestId('datadog-region-select')).toBeInTheDocument();
      });

      const select = screen.getByTestId('datadog-region-select');
      const options = Array.from(select.querySelectorAll('option[value]')).filter(
        (o) => (o as HTMLOptionElement).value !== '',
      );
      expect(options).toHaveLength(DATADOG_REGIONS.length); // 6 regions
      const labels = options.map((o) => (o as HTMLOptionElement).value);
      expect(labels).toContain('us1');
      expect(labels).toContain('eu');
      expect(labels).toContain('ap2');
    });

    it('shows noSite status text when no URL stored', async () => {
      render(<DatadogConnectorCard {...baseProps} />);
      await waitFor(() => {
        // Status text should say "No region selected" or equivalent noSite key
        expect(screen.getByTestId('datadog-region-select')).toBeInTheDocument();
      });
      // The noSite text is rendered via t('connectors.datadog.status.noSite')
      const noSiteText = settingsEn as Record<string, unknown>;
      const ddSection = (noSiteText.connectors as Record<string, unknown>)?.datadog as Record<
        string,
        unknown
      >;
      const statusSection = ddSection?.status as Record<string, string>;
      const noSiteLabel = statusSection?.noSite;
      expect(noSiteLabel).toBeDefined();
      expect(screen.getByText(noSiteLabel!)).toBeInTheDocument();
    });
  });

  describe('selecting and saving a region', () => {
    it('calls datadogSetServerUrl with the correct MCP URL for EU region', async () => {
      render(<DatadogConnectorCard {...baseProps} />);

      await waitFor(() => {
        expect(screen.getByTestId('datadog-region-select')).toBeInTheDocument();
      });

      // Select EU region
      fireEvent.change(screen.getByTestId('datadog-region-select'), { target: { value: 'eu' } });

      // Click Save
      const saveBtn = screen.getByRole('button', { name: /save/i });
      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(mockSetServerUrl).toHaveBeenCalledWith(
          'https://mcp.datadoghq.eu/api/unstable/mcp-server/mcp',
        );
        expect(baseProps.refetch).toHaveBeenCalled();
      });
    });

    it('calls datadogSetServerUrl with US1 MCP URL when US1 selected', async () => {
      render(<DatadogConnectorCard {...baseProps} />);

      await waitFor(() => {
        expect(screen.getByTestId('datadog-region-select')).toBeInTheDocument();
      });

      fireEvent.change(screen.getByTestId('datadog-region-select'), { target: { value: 'us1' } });
      fireEvent.click(screen.getByRole('button', { name: /save/i }));

      await waitFor(() => {
        expect(mockSetServerUrl).toHaveBeenCalledWith(
          'https://mcp.datadoghq.com/api/unstable/mcp-server/mcp',
        );
      });
    });
  });

  describe('saved region state', () => {
    beforeEach(() => {
      // US1 region already saved
      mockGetServerUrl.mockResolvedValue('https://mcp.datadoghq.com/api/unstable/mcp-server/mcp');
    });

    it('hides the region picker and shows Edit button after region is saved', async () => {
      render(<DatadogConnectorCard {...baseProps} />);

      await waitFor(() => {
        expect(screen.queryByTestId('datadog-region-select')).not.toBeInTheDocument();
      });
      expect(screen.getByRole('button', { name: /^edit$/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /connect/i })).toBeInTheDocument();
    });

    it('clicking Edit re-shows the region picker', async () => {
      render(<DatadogConnectorCard {...baseProps} />);

      // Wait until the card has fully loaded and shows the Edit button
      const editBtn = await screen.findByRole('button', { name: /^edit$/i });
      fireEvent.click(editBtn);

      expect(screen.getByTestId('datadog-region-select')).toBeInTheDocument();
    });
  });

  describe('reconnectRequired warning', () => {
    it('shows reconnect warning when connected and editing region', async () => {
      mockGetServerUrl.mockResolvedValue('https://mcp.datadoghq.com/api/unstable/mcp-server/mcp');

      render(<DatadogConnectorCard {...baseProps} authState={connected} />);

      await waitFor(() => {
        // reconnectRequired text should be visible when server URL is set and connected
        const ddSection = (settingsEn.connectors as Record<string, unknown>)?.datadog as Record<
          string,
          string
        >;
        const msg = ddSection?.reconnectRequired;
        expect(msg).toBeDefined();
        expect(screen.getByText(msg!)).toBeInTheDocument();
      });
    });
  });
});
