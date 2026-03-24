/**
 * Unit tests for BedrockApiKeyTab component
 *
 * Tests the Bedrock API Key authentication tab component which provides
 * input fields for API key and region selection.
 *
 * @module __tests__/unit/renderer/components/BedrockApiKeyTab.unit.test
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BedrockApiKeyTab } from '@/components/settings/providers/BedrockApiKeyTab';

describe('BedrockApiKeyTab', () => {
  const defaultProps = {
    apiKey: '',
    region: 'us-east-1',
    onApiKeyChange: vi.fn(),
    onRegionChange: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('should render API key input field', () => {
      // Arrange & Act
      render(<BedrockApiKeyTab {...defaultProps} />);

      // Assert
      const input = screen.getByTestId('bedrock-api-key-input');
      expect(input).toBeInTheDocument();
      expect(input).toHaveAttribute('type', 'password');
    });

    it('should render API key label', () => {
      // Arrange & Act
      render(<BedrockApiKeyTab {...defaultProps} />);

      // Assert
      expect(screen.getByText('API Key')).toBeInTheDocument();
    });

    it('should render "How to get it?" help link', () => {
      // Arrange & Act
      render(<BedrockApiKeyTab {...defaultProps} />);

      // Assert
      const helpLink = screen.getByText('How to get it?');
      expect(helpLink).toBeInTheDocument();
      expect(helpLink).toHaveAttribute(
        'href',
        'https://console.aws.amazon.com/bedrock/home#/api-keys',
      );
      expect(helpLink).toHaveAttribute('target', '_blank');
    });

    it('should render region selector', () => {
      // Arrange & Act
      render(<BedrockApiKeyTab {...defaultProps} />);

      // Assert
      const regionSelect = screen.getByTestId('bedrock-region-select');
      expect(regionSelect).toBeInTheDocument();
    });

    it('should display the provided API key value', () => {
      // Arrange
      const props = { ...defaultProps, apiKey: 'test-api-key-123' };

      // Act
      render(<BedrockApiKeyTab {...props} />);

      // Assert
      const input = screen.getByTestId('bedrock-api-key-input');
      expect(input).toHaveValue('test-api-key-123');
    });

    it('should display the provided region value', () => {
      // Arrange
      const props = { ...defaultProps, region: 'eu-west-1' };

      // Act
      render(<BedrockApiKeyTab {...props} />);

      // Assert
      const regionSelect = screen.getByTestId('bedrock-region-select');
      expect(regionSelect).toHaveTextContent('eu-west-1');
    });
  });

  describe('interactions', () => {
    it('should call onApiKeyChange when API key input changes', () => {
      // Arrange
      const onApiKeyChange = vi.fn();
      render(<BedrockApiKeyTab {...defaultProps} onApiKeyChange={onApiKeyChange} />);

      // Act
      const input = screen.getByTestId('bedrock-api-key-input');
      fireEvent.change(input, { target: { value: 'new-api-key' } });

      // Assert
      expect(onApiKeyChange).toHaveBeenCalledWith('new-api-key');
    });

    it('should call onRegionChange when region selector changes', () => {
      // Arrange
      const onRegionChange = vi.fn();
      render(<BedrockApiKeyTab {...defaultProps} onRegionChange={onRegionChange} />);

      // Act - Click to open dropdown, then click an option
      const regionSelect = screen.getByTestId('bedrock-region-select');
      fireEvent.click(regionSelect);
      const option = screen.getByTestId('bedrock-region-select-option-ap-northeast-1');
      fireEvent.click(option);

      // Assert
      expect(onRegionChange).toHaveBeenCalledWith('ap-northeast-1');
    });

    it('should show clear button when API key has value', () => {
      // Arrange
      const props = { ...defaultProps, apiKey: 'test-key' };

      // Act
      render(<BedrockApiKeyTab {...props} />);

      // Assert
      const clearButton = screen.getByTestId('bedrock-api-key-clear');
      expect(clearButton).toBeInTheDocument();
    });

    it('should not show clear button when API key is empty', () => {
      // Arrange & Act
      render(<BedrockApiKeyTab {...defaultProps} />);

      // Assert
      const clearButton = screen.queryByTestId('bedrock-api-key-clear');
      expect(clearButton).not.toBeInTheDocument();
    });

    it('should call onApiKeyChange with empty string when clear button clicked', () => {
      // Arrange
      const onApiKeyChange = vi.fn();
      const props = { ...defaultProps, apiKey: 'test-key', onApiKeyChange };
      render(<BedrockApiKeyTab {...props} />);

      // Act
      const clearButton = screen.getByTestId('bedrock-api-key-clear');
      fireEvent.click(clearButton);

      // Assert
      expect(onApiKeyChange).toHaveBeenCalledWith('');
    });
  });

  describe('placeholder', () => {
    it('should have correct placeholder text', () => {
      // Arrange & Act
      render(<BedrockApiKeyTab {...defaultProps} />);

      // Assert
      const input = screen.getByTestId('bedrock-api-key-input');
      expect(input).toHaveAttribute('placeholder', 'Enter Bedrock API key');
    });
  });
});
