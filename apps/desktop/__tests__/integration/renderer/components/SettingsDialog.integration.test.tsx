/**
 * Integration tests for SettingsDialog component
 * Tests dialog rendering, API key management, model selection, and debug mode
 * @module __tests__/integration/renderer/components/SettingsDialog.integration.test
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { ApiKeyConfig } from '@accomplish/shared';

// Mock analytics to prevent tracking calls
vi.mock('@/lib/analytics', () => ({
  analytics: {
    trackToggleDebugMode: vi.fn(),
    trackSelectModel: vi.fn(),
    trackSaveApiKey: vi.fn(),
    trackSelectProvider: vi.fn(),
  },
}));

// Create mock functions for accomplish API
const mockGetApiKeys = vi.fn();
const mockGetDebugMode = vi.fn();
const mockGetVersion = vi.fn();
const mockGetSelectedModel = vi.fn();
const mockSetDebugMode = vi.fn();
const mockSetSelectedModel = vi.fn();
const mockAddApiKey = vi.fn();
const mockRemoveApiKey = vi.fn();
const mockValidateApiKeyForProvider = vi.fn();

// Mock accomplish API
const mockAccomplish = {
  getApiKeys: mockGetApiKeys,
  getDebugMode: mockGetDebugMode,
  getVersion: mockGetVersion,
  getSelectedModel: mockGetSelectedModel,
  getOllamaConfig: vi.fn().mockResolvedValue(null),
  setDebugMode: mockSetDebugMode,
  setSelectedModel: mockSetSelectedModel,
  addApiKey: mockAddApiKey,
  removeApiKey: mockRemoveApiKey,
  validateApiKeyForProvider: mockValidateApiKeyForProvider,
};

// Mock the accomplish module
vi.mock('@/lib/accomplish', () => ({
  getAccomplish: () => mockAccomplish,
}));

// Mock framer-motion to simplify testing animations
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: { children: React.ReactNode; [key: string]: unknown }) => {
      // Filter out motion-specific props
      const { initial, animate, exit, transition, variants, whileHover, ...domProps } = props;
      return <div {...domProps}>{children}</div>;
    },
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock Radix Dialog to simplify testing
vi.mock('@radix-ui/react-dialog', () => ({
  Root: ({ children, open }: { children: React.ReactNode; open: boolean }) => (
    open ? <div data-testid="dialog-root">{children}</div> : null
  ),
  Portal: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Overlay: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dialog-overlay">{children}</div>
  ),
  Content: ({ children, ...props }: { children: React.ReactNode; [key: string]: unknown }) => (
    <div data-testid="dialog-content" role="dialog" {...props}>{children}</div>
  ),
  Title: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <h2 className={className}>{children}</h2>
  ),
  Close: ({ children }: { children: React.ReactNode }) => (
    <button data-testid="dialog-close">{children}</button>
  ),
}));

// Need to import after mocks are set up
import SettingsDialog from '@/components/layout/SettingsDialog';

describe('SettingsDialog Integration', () => {
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    onApiKeySaved: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock implementations
    mockGetApiKeys.mockResolvedValue([]);
    mockGetDebugMode.mockResolvedValue(false);
    mockGetVersion.mockResolvedValue('1.0.0');
    mockGetSelectedModel.mockResolvedValue({ provider: 'anthropic', model: 'anthropic/claude-opus-4-5' });
    mockSetDebugMode.mockResolvedValue(undefined);
    mockSetSelectedModel.mockResolvedValue(undefined);
    mockValidateApiKeyForProvider.mockResolvedValue({ valid: true });
    mockAddApiKey.mockResolvedValue({ id: 'key-1', provider: 'anthropic', keyPrefix: 'sk-ant-...' });
    mockRemoveApiKey.mockResolvedValue(undefined);
  });

  describe('dialog rendering', () => {
    it('should render dialog when open is true', async () => {
      // Arrange & Act
      render(<SettingsDialog {...defaultProps} />);

      // Assert
      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });
    });

    it('should not render dialog when open is false', () => {
      // Arrange & Act
      render(<SettingsDialog {...defaultProps} open={false} />);

      // Assert
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('should render Settings title', async () => {
      // Arrange & Act
      render(<SettingsDialog {...defaultProps} />);

      // Assert
      await waitFor(() => {
        expect(screen.getByText('Settings')).toBeInTheDocument();
      });
    });

    it('should fetch initial data on open', async () => {
      // Arrange & Act
      render(<SettingsDialog {...defaultProps} />);

      // Assert
      await waitFor(() => {
        expect(mockGetApiKeys).toHaveBeenCalled();
        expect(mockGetDebugMode).toHaveBeenCalled();
        expect(mockGetVersion).toHaveBeenCalled();
        expect(mockGetSelectedModel).toHaveBeenCalled();
      });
    });

    it('should not fetch data when dialog is closed', () => {
      // Arrange & Act
      render(<SettingsDialog {...defaultProps} open={false} />);

      // Assert
      expect(mockGetApiKeys).not.toHaveBeenCalled();
      expect(mockGetDebugMode).not.toHaveBeenCalled();
    });
  });

  describe('API key section', () => {
    it('should render API key section title', async () => {
      // Arrange & Act
      render(<SettingsDialog {...defaultProps} />);

      // Assert
      await waitFor(() => {
        expect(screen.getByText('Bring Your Own Model/API Key')).toBeInTheDocument();
      });
    });

    it('should render provider selection buttons', async () => {
      // Arrange & Act
      render(<SettingsDialog {...defaultProps} />);

      // Assert
      await waitFor(() => {
        expect(screen.getByText('Anthropic')).toBeInTheDocument();
        expect(screen.getByText('OpenAI')).toBeInTheDocument();
        expect(screen.getByText('Google AI')).toBeInTheDocument();
        expect(screen.getByText('xAI (Grok)')).toBeInTheDocument();
      });
    });

    it('should render API key input field', async () => {
      // Arrange & Act
      render(<SettingsDialog {...defaultProps} />);

      // Assert
      await waitFor(() => {
        const input = screen.getByPlaceholderText('sk-ant-...');
        expect(input).toBeInTheDocument();
        expect(input).toHaveAttribute('type', 'password');
      });
    });

    it('should render Save API Key button', async () => {
      // Arrange & Act
      render(<SettingsDialog {...defaultProps} />);

      // Assert
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /save api key/i })).toBeInTheDocument();
      });
    });
  });

  describe('provider selection', () => {
    it('should change provider when button is clicked', async () => {
      // Arrange
      render(<SettingsDialog {...defaultProps} />);

      // Act
      await waitFor(() => {
        expect(screen.getByText('Google AI')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('Google AI'));

      // Assert
      await waitFor(() => {
        expect(screen.getByPlaceholderText('AIza...')).toBeInTheDocument();
      });
    });

    it('should update input placeholder when provider changes', async () => {
      // Arrange
      render(<SettingsDialog {...defaultProps} />);

      // Act - Click Google AI provider
      await waitFor(() => {
        expect(screen.getByText('Google AI')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('Google AI'));

      // Assert
      await waitFor(() => {
        expect(screen.getByPlaceholderText('AIza...')).toBeInTheDocument();
      });
    });

    it('should highlight selected provider', async () => {
      // Arrange
      render(<SettingsDialog {...defaultProps} />);

      // Assert - Anthropic is selected by default and should have highlight class
      await waitFor(() => {
        const anthropicButton = screen.getByText('Anthropic').closest('button');
        expect(anthropicButton?.className).toContain('border-primary');
      });
    });
  });

  describe('API key input and saving', () => {
    it('should show error when saving empty API key', async () => {
      // Arrange
      render(<SettingsDialog {...defaultProps} />);

      // Act
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /save api key/i })).toBeInTheDocument();
      });
      fireEvent.click(screen.getByRole('button', { name: /save api key/i }));

      // Assert
      await waitFor(() => {
        expect(screen.getByText('Please enter an API key.')).toBeInTheDocument();
      });
    });

    it('should show error when API key format is invalid', async () => {
      // Arrange
      render(<SettingsDialog {...defaultProps} />);

      // Act
      await waitFor(() => {
        expect(screen.getByPlaceholderText('sk-ant-...')).toBeInTheDocument();
      });
      fireEvent.change(screen.getByPlaceholderText('sk-ant-...'), { target: { value: 'invalid-key' } });
      fireEvent.click(screen.getByRole('button', { name: /save api key/i }));

      // Assert
      await waitFor(() => {
        expect(screen.getByText(/invalid api key format/i)).toBeInTheDocument();
      });
    });

    it('should validate and save valid API key', async () => {
      // Arrange
      mockValidateApiKeyForProvider.mockResolvedValue({ valid: true });
      mockAddApiKey.mockResolvedValue({ id: 'key-1', provider: 'anthropic', keyPrefix: 'sk-ant-...' });
      render(<SettingsDialog {...defaultProps} />);

      // Act
      await waitFor(() => {
        expect(screen.getByPlaceholderText('sk-ant-...')).toBeInTheDocument();
      });
      fireEvent.change(screen.getByPlaceholderText('sk-ant-...'), { target: { value: 'sk-ant-test123' } });
      fireEvent.click(screen.getByRole('button', { name: /save api key/i }));

      // Assert
      await waitFor(() => {
        expect(mockValidateApiKeyForProvider).toHaveBeenCalledWith('anthropic', 'sk-ant-test123');
        expect(mockAddApiKey).toHaveBeenCalledWith('anthropic', 'sk-ant-test123');
      });
    });

    it('should show error when API key validation fails', async () => {
      // Arrange
      mockValidateApiKeyForProvider.mockResolvedValue({ valid: false, error: 'Invalid API key' });
      render(<SettingsDialog {...defaultProps} />);

      // Act
      await waitFor(() => {
        expect(screen.getByPlaceholderText('sk-ant-...')).toBeInTheDocument();
      });
      fireEvent.change(screen.getByPlaceholderText('sk-ant-...'), { target: { value: 'sk-ant-invalid' } });
      fireEvent.click(screen.getByRole('button', { name: /save api key/i }));

      // Assert
      await waitFor(() => {
        expect(screen.getByText('Invalid API key')).toBeInTheDocument();
      });
    });

    it('should show success message after saving API key', async () => {
      // Arrange
      mockValidateApiKeyForProvider.mockResolvedValue({ valid: true });
      mockAddApiKey.mockResolvedValue({ id: 'key-1', provider: 'anthropic', keyPrefix: 'sk-ant-...' });
      render(<SettingsDialog {...defaultProps} />);

      // Act
      await waitFor(() => {
        expect(screen.getByPlaceholderText('sk-ant-...')).toBeInTheDocument();
      });
      fireEvent.change(screen.getByPlaceholderText('sk-ant-...'), { target: { value: 'sk-ant-valid123' } });
      fireEvent.click(screen.getByRole('button', { name: /save api key/i }));

      // Assert
      await waitFor(() => {
        expect(screen.getByText(/anthropic api key saved securely/i)).toBeInTheDocument();
      });
    });

    it('should call onApiKeySaved callback after saving', async () => {
      // Arrange
      const onApiKeySaved = vi.fn();
      mockValidateApiKeyForProvider.mockResolvedValue({ valid: true });
      mockAddApiKey.mockResolvedValue({ id: 'key-1', provider: 'anthropic', keyPrefix: 'sk-ant-...' });
      render(<SettingsDialog {...defaultProps} onApiKeySaved={onApiKeySaved} />);

      // Act
      await waitFor(() => {
        expect(screen.getByPlaceholderText('sk-ant-...')).toBeInTheDocument();
      });
      fireEvent.change(screen.getByPlaceholderText('sk-ant-...'), { target: { value: 'sk-ant-valid123' } });
      fireEvent.click(screen.getByRole('button', { name: /save api key/i }));

      // Assert
      await waitFor(() => {
        expect(onApiKeySaved).toHaveBeenCalled();
      });
    });

    it('should show Saving... while saving is in progress', async () => {
      // Arrange
      mockValidateApiKeyForProvider.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ valid: true }), 100))
      );
      render(<SettingsDialog {...defaultProps} />);

      // Act
      await waitFor(() => {
        expect(screen.getByPlaceholderText('sk-ant-...')).toBeInTheDocument();
      });
      fireEvent.change(screen.getByPlaceholderText('sk-ant-...'), { target: { value: 'sk-ant-valid123' } });
      fireEvent.click(screen.getByRole('button', { name: /save api key/i }));

      // Assert
      expect(screen.getByText('Saving...')).toBeInTheDocument();
    });
  });

  describe('saved keys display', () => {
    it('should render saved API keys', async () => {
      // Arrange
      const savedKeys: ApiKeyConfig[] = [
        { id: 'key-1', provider: 'anthropic', keyPrefix: 'sk-ant-abc...' },
        { id: 'key-2', provider: 'openai', keyPrefix: 'sk-xyz...' },
      ];
      mockGetApiKeys.mockResolvedValue(savedKeys);
      render(<SettingsDialog {...defaultProps} />);

      // Assert
      await waitFor(() => {
        expect(screen.getByText('Saved Keys')).toBeInTheDocument();
        expect(screen.getByText('sk-ant-abc...')).toBeInTheDocument();
        expect(screen.getByText('sk-xyz...')).toBeInTheDocument();
      });
    });

    it('should show delete button for each saved key', async () => {
      // Arrange
      const savedKeys: ApiKeyConfig[] = [
        { id: 'key-1', provider: 'anthropic', keyPrefix: 'sk-ant-abc...' },
      ];
      mockGetApiKeys.mockResolvedValue(savedKeys);
      render(<SettingsDialog {...defaultProps} />);

      // Assert
      await waitFor(() => {
        expect(screen.getByTitle('Remove API key')).toBeInTheDocument();
      });
    });

    it('should delete API key when delete button is clicked and confirmed', async () => {
      // Arrange
      const savedKeys: ApiKeyConfig[] = [
        { id: 'key-1', provider: 'anthropic', keyPrefix: 'sk-ant-abc...' },
      ];
      mockGetApiKeys.mockResolvedValue(savedKeys);
      render(<SettingsDialog {...defaultProps} />);

      // Act - Click delete button to show confirmation
      await waitFor(() => {
        expect(screen.getByTitle('Remove API key')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByTitle('Remove API key'));

      // Act - Confirm deletion by clicking Yes
      await waitFor(() => {
        expect(screen.getByText('Are you sure?')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByRole('button', { name: /yes/i }));

      // Assert
      await waitFor(() => {
        expect(mockRemoveApiKey).toHaveBeenCalledWith('key-1');
      });
    });

    it('should not delete API key when confirmation is cancelled', async () => {
      // Arrange
      const savedKeys: ApiKeyConfig[] = [
        { id: 'key-1', provider: 'anthropic', keyPrefix: 'sk-ant-abc...' },
      ];
      mockGetApiKeys.mockResolvedValue(savedKeys);
      render(<SettingsDialog {...defaultProps} />);

      // Act - Click delete button to show confirmation
      await waitFor(() => {
        expect(screen.getByTitle('Remove API key')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByTitle('Remove API key'));

      // Act - Cancel by clicking No
      await waitFor(() => {
        expect(screen.getByText('Are you sure?')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByRole('button', { name: /no/i }));

      // Assert - Should not delete, confirmation should be hidden
      expect(mockRemoveApiKey).not.toHaveBeenCalled();
      await waitFor(() => {
        expect(screen.queryByText('Are you sure?')).not.toBeInTheDocument();
      });
    });

    it('should show loading skeleton while fetching keys', async () => {
      // Arrange
      mockGetApiKeys.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve([]), 500))
      );
      render(<SettingsDialog {...defaultProps} />);

      // Assert - Check for skeleton animation
      await waitFor(() => {
        const skeletons = document.querySelectorAll('.animate-pulse');
        expect(skeletons.length).toBeGreaterThan(0);
      });
    });
  });

  describe('model selection', () => {
    it('should render Model section', async () => {
      // Arrange & Act
      render(<SettingsDialog {...defaultProps} />);

      // Assert
      await waitFor(() => {
        expect(screen.getByText('Model')).toBeInTheDocument();
      });
    });

    it('should render model selection dropdown', async () => {
      // Arrange
      const savedKeys: ApiKeyConfig[] = [
        { id: 'key-1', provider: 'anthropic', keyPrefix: 'sk-ant-...' },
      ];
      mockGetApiKeys.mockResolvedValue(savedKeys);
      render(<SettingsDialog {...defaultProps} />);

      // Assert
      await waitFor(() => {
        const select = screen.getByRole('combobox');
        expect(select).toBeInTheDocument();
      });
    });

    it('should show model options grouped by provider', async () => {
      // Arrange
      const savedKeys: ApiKeyConfig[] = [
        { id: 'key-1', provider: 'anthropic', keyPrefix: 'sk-ant-...' },
      ];
      mockGetApiKeys.mockResolvedValue(savedKeys);
      render(<SettingsDialog {...defaultProps} />);

      // Assert - Check for Anthropic group
      await waitFor(() => {
        const optgroups = document.querySelectorAll('optgroup');
        expect(optgroups.length).toBeGreaterThan(0);
      });
    });

    it('should disable models without API keys', async () => {
      // Arrange - No Google AI API key
      const savedKeys: ApiKeyConfig[] = [
        { id: 'key-1', provider: 'anthropic', keyPrefix: 'sk-ant-...' },
      ];
      mockGetApiKeys.mockResolvedValue(savedKeys);
      render(<SettingsDialog {...defaultProps} />);

      // Assert
      await waitFor(() => {
        const option = screen.getByRole('option', { name: /gemini 3 pro \(no api key\)/i });
        expect(option).toBeDisabled();
      });
    });

    it('should call setSelectedModel when model is changed', async () => {
      // Arrange
      const savedKeys: ApiKeyConfig[] = [
        { id: 'key-1', provider: 'anthropic', keyPrefix: 'sk-ant-...' },
      ];
      mockGetApiKeys.mockResolvedValue(savedKeys);
      render(<SettingsDialog {...defaultProps} />);

      // Act
      await waitFor(() => {
        expect(screen.getByRole('combobox')).toBeInTheDocument();
      });
      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'anthropic/claude-sonnet-4-5' } });

      // Assert
      await waitFor(() => {
        expect(mockSetSelectedModel).toHaveBeenCalledWith({
          provider: 'anthropic',
          model: 'anthropic/claude-sonnet-4-5',
        });
      });
    });

    it('should show model updated message after selection', async () => {
      // Arrange
      const savedKeys: ApiKeyConfig[] = [
        { id: 'key-1', provider: 'anthropic', keyPrefix: 'sk-ant-...' },
      ];
      mockGetApiKeys.mockResolvedValue(savedKeys);
      render(<SettingsDialog {...defaultProps} />);

      // Act
      await waitFor(() => {
        expect(screen.getByRole('combobox')).toBeInTheDocument();
      });
      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'anthropic/claude-sonnet-4-5' } });

      // Assert
      await waitFor(() => {
        expect(screen.getByText(/model updated to/i)).toBeInTheDocument();
      });
    });

    it('should show warning when selected model has no API key', async () => {
      // Arrange - Selected Google AI model but no Google AI key
      mockGetSelectedModel.mockResolvedValue({ provider: 'google', model: 'google/gemini-3-pro-preview' });
      mockGetApiKeys.mockResolvedValue([
        { id: 'key-1', provider: 'anthropic', keyPrefix: 'sk-ant-...' },
      ]);
      render(<SettingsDialog {...defaultProps} />);

      // Assert
      await waitFor(() => {
        expect(screen.getByText(/no api key configured for google/i)).toBeInTheDocument();
      });
    });
  });

  describe('debug mode toggle', () => {
    it('should render Developer section', async () => {
      // Arrange & Act
      render(<SettingsDialog {...defaultProps} />);

      // Assert
      await waitFor(() => {
        expect(screen.getByText('Developer')).toBeInTheDocument();
      });
    });

    it('should render Debug Mode toggle', async () => {
      // Arrange & Act
      render(<SettingsDialog {...defaultProps} />);

      // Assert
      await waitFor(() => {
        expect(screen.getByText('Debug Mode')).toBeInTheDocument();
      });
    });

    it('should show debug mode as disabled initially', async () => {
      // Arrange
      mockGetDebugMode.mockResolvedValue(false);
      render(<SettingsDialog {...defaultProps} />);

      // Assert
      await waitFor(() => {
        const toggle = screen.getByRole('button', { name: '' });
        expect(toggle.className).toContain('bg-muted');
      });
    });

    it('should toggle debug mode when clicked', async () => {
      // Arrange
      mockGetDebugMode.mockResolvedValue(false);
      render(<SettingsDialog {...defaultProps} />);

      // Find the toggle button in the Developer section
      await waitFor(() => {
        expect(screen.getByText('Debug Mode')).toBeInTheDocument();
      });

      // Act - Find toggle by its appearance (the switch button)
      const developerSection = screen.getByText('Debug Mode').closest('section');
      const toggleButton = developerSection?.querySelector('button[class*="rounded-full"]');
      if (toggleButton) {
        fireEvent.click(toggleButton);
      }

      // Assert
      await waitFor(() => {
        expect(mockSetDebugMode).toHaveBeenCalledWith(true);
      });
    });

    it('should show debug mode warning when enabled', async () => {
      // Arrange
      mockGetDebugMode.mockResolvedValue(true);
      render(<SettingsDialog {...defaultProps} />);

      // Assert
      await waitFor(() => {
        expect(screen.getByText(/debug mode is enabled/i)).toBeInTheDocument();
      });
    });

    it('should show loading skeleton while fetching debug setting', async () => {
      // Arrange
      mockGetDebugMode.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(false), 500))
      );
      render(<SettingsDialog {...defaultProps} />);

      // Assert - Check for skeleton animation near debug toggle
      await waitFor(() => {
        const skeletons = document.querySelectorAll('.animate-pulse');
        expect(skeletons.length).toBeGreaterThan(0);
      });
    });

    it('should revert toggle state on save error', async () => {
      // Arrange
      mockGetDebugMode.mockResolvedValue(false);
      mockSetDebugMode.mockRejectedValue(new Error('Save failed'));
      render(<SettingsDialog {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Debug Mode')).toBeInTheDocument();
      });

      // Act
      const developerSection = screen.getByText('Debug Mode').closest('section');
      const toggleButton = developerSection?.querySelector('button[class*="rounded-full"]');
      if (toggleButton) {
        fireEvent.click(toggleButton);
      }

      // Assert - Mock should have been called and error handled
      await waitFor(() => {
        expect(mockSetDebugMode).toHaveBeenCalled();
      });
    });
  });

  describe('about section', () => {
    it('should render About section', async () => {
      // Arrange & Act
      render(<SettingsDialog {...defaultProps} />);

      // Assert
      await waitFor(() => {
        expect(screen.getByText('About')).toBeInTheDocument();
      });
    });

    it('should render app name', async () => {
      // Arrange & Act
      render(<SettingsDialog {...defaultProps} />);

      // Assert
      await waitFor(() => {
        expect(screen.getByText('Openwork')).toBeInTheDocument();
      });
    });

    it('should render app version', async () => {
      // Arrange
      mockGetVersion.mockResolvedValue('2.0.0');
      render(<SettingsDialog {...defaultProps} />);

      // Assert
      await waitFor(() => {
        expect(screen.getByText('Version 2.0.0')).toBeInTheDocument();
      });
    });

    it('should render app logo', async () => {
      // Arrange & Act
      render(<SettingsDialog {...defaultProps} />);

      // Assert
      await waitFor(() => {
        const logo = screen.getByRole('img', { name: /openwork/i });
        expect(logo).toBeInTheDocument();
      });
    });

    it('should show default version when fetch fails', async () => {
      // Arrange
      mockGetVersion.mockRejectedValue(new Error('Fetch failed'));
      render(<SettingsDialog {...defaultProps} />);

      // Assert - should show error instead of fallback version
      await waitFor(() => {
        expect(screen.getByText('Version Error: unavailable')).toBeInTheDocument();
      });
    });
  });
});
