/**
 * Integration tests for provider model update functionality
 *
 * Tests that changing the model dropdown correctly updates the selected model
 * for a provider through the full stack: UI -> Hook -> IPC -> Repository
 *
 * @module __tests__/integration/renderer/components/ProviderModelUpdate.integration.test
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { renderHook } from '@testing-library/react';

// Mock accomplish API
const mockUpdateProviderModel = vi.fn();
const mockGetProviderSettings = vi.fn();
const mockSetConnectedProvider = vi.fn();

const mockAccomplish = {
  getProviderSettings: mockGetProviderSettings,
  setActiveProvider: vi.fn().mockResolvedValue(undefined),
  setConnectedProvider: mockSetConnectedProvider,
  removeConnectedProvider: vi.fn().mockResolvedValue(undefined),
  updateProviderModel: mockUpdateProviderModel,
  setProviderDebugMode: vi.fn().mockResolvedValue(undefined),
  getProviderDebugMode: vi.fn().mockResolvedValue(false),
};

vi.mock('@/lib/accomplish', () => ({
  getAccomplish: () => mockAccomplish,
}));

// Mock framer-motion
vi.mock('framer-motion', () => {
  const createMotionMock = (Element: string) => {
    return ({ children, ...props }: { children?: React.ReactNode; [key: string]: unknown }) => {
      const { initial, animate, exit, transition, variants, whileHover, whileTap, layout, layoutId, style, ...domProps } = props;
      const Component = Element as keyof JSX.IntrinsicElements;
      return <Component {...domProps}>{children}</Component>;
    };
  };

  return {
    motion: {
      div: createMotionMock('div'),
      section: createMotionMock('section'),
      p: createMotionMock('p'),
      span: createMotionMock('span'),
      button: createMotionMock('button'),
    },
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

// Import components after mocks are set up
import { ModelSelector } from '@/components/settings/shared/ModelSelector';
import { useProviderSettings } from '@/components/settings/hooks/useProviderSettings';

describe('Provider Model Update Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetProviderSettings.mockResolvedValue({
      activeProviderId: 'bedrock',
      connectedProviders: {
        bedrock: {
          providerId: 'bedrock',
          connectionStatus: 'connected',
          selectedModelId: 'amazon-bedrock/anthropic.claude-haiku-4-5-20251001-v1:0',
          credentials: {
            type: 'bedrock',
            authMethod: 'apiKey',
            region: 'us-east-1',
            keyPrefix: 'bedrock-...',
          },
          lastConnectedAt: new Date().toISOString(),
          availableModels: [
            { id: 'amazon-bedrock/anthropic.claude-haiku-4-5-20251001-v1:0', name: 'Claude Haiku 4.5' },
            { id: 'amazon-bedrock/anthropic.claude-sonnet-4-5-20251022-v1:0', name: 'Claude Sonnet 4.5' },
            { id: 'amazon-bedrock/anthropic.claude-opus-4-5-20251022-v1:0', name: 'Claude Opus 4.5' },
          ],
        },
      },
      debugMode: false,
    });
    mockUpdateProviderModel.mockResolvedValue(undefined);
  });

  describe('ModelSelector component', () => {
    it('should call onChange with the new model ID when selection changes', async () => {
      // Arrange
      const onChange = vi.fn();
      const models = [
        { id: 'amazon-bedrock/anthropic.claude-haiku-4-5-20251001-v1:0', name: 'Claude Haiku 4.5' },
        { id: 'amazon-bedrock/anthropic.claude-sonnet-4-5-20251022-v1:0', name: 'Claude Sonnet 4.5' },
        { id: 'amazon-bedrock/anthropic.claude-opus-4-5-20251022-v1:0', name: 'Claude Opus 4.5' },
      ];

      render(
        <ModelSelector
          models={models}
          value="amazon-bedrock/anthropic.claude-haiku-4-5-20251001-v1:0"
          onChange={onChange}
        />
      );

      // Act - Change selection to Sonnet
      const select = screen.getByTestId('model-selector');
      fireEvent.change(select, {
        target: { value: 'amazon-bedrock/anthropic.claude-sonnet-4-5-20251022-v1:0' },
      });

      // Assert
      expect(onChange).toHaveBeenCalledWith('amazon-bedrock/anthropic.claude-sonnet-4-5-20251022-v1:0');
      expect(onChange).toHaveBeenCalledTimes(1);
    });

    it('should call onChange with correct model ID when switching from Haiku to Opus', async () => {
      // Arrange
      const onChange = vi.fn();
      const models = [
        { id: 'amazon-bedrock/anthropic.claude-haiku-4-5-20251001-v1:0', name: 'Claude Haiku 4.5' },
        { id: 'amazon-bedrock/anthropic.claude-sonnet-4-5-20251022-v1:0', name: 'Claude Sonnet 4.5' },
        { id: 'amazon-bedrock/anthropic.claude-opus-4-5-20251022-v1:0', name: 'Claude Opus 4.5' },
      ];

      render(
        <ModelSelector
          models={models}
          value="amazon-bedrock/anthropic.claude-haiku-4-5-20251001-v1:0"
          onChange={onChange}
        />
      );

      // Act - Change selection to Opus
      const select = screen.getByTestId('model-selector');
      fireEvent.change(select, {
        target: { value: 'amazon-bedrock/anthropic.claude-opus-4-5-20251022-v1:0' },
      });

      // Assert
      expect(onChange).toHaveBeenCalledWith('amazon-bedrock/anthropic.claude-opus-4-5-20251022-v1:0');
    });

    it('should display current selected model correctly', () => {
      // Arrange
      const models = [
        { id: 'amazon-bedrock/anthropic.claude-haiku-4-5-20251001-v1:0', name: 'Claude Haiku 4.5' },
        { id: 'amazon-bedrock/anthropic.claude-sonnet-4-5-20251022-v1:0', name: 'Claude Sonnet 4.5' },
      ];

      // Act
      render(
        <ModelSelector
          models={models}
          value="amazon-bedrock/anthropic.claude-sonnet-4-5-20251022-v1:0"
          onChange={vi.fn()}
        />
      );

      // Assert
      const select = screen.getByTestId('model-selector') as HTMLSelectElement;
      expect(select.value).toBe('amazon-bedrock/anthropic.claude-sonnet-4-5-20251022-v1:0');
    });
  });

  describe('useProviderSettings hook', () => {
    it('should call updateProviderModel with correct providerId and modelId', async () => {
      // Arrange
      const { result } = renderHook(() => useProviderSettings());

      // Wait for initial load
      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Act
      await act(async () => {
        await result.current.updateModel('bedrock', 'amazon-bedrock/anthropic.claude-opus-4-5-20251022-v1:0');
      });

      // Assert
      expect(mockUpdateProviderModel).toHaveBeenCalledWith(
        'bedrock',
        'amazon-bedrock/anthropic.claude-opus-4-5-20251022-v1:0'
      );
    });

    it('should update local state after calling updateProviderModel', async () => {
      // Arrange
      const { result } = renderHook(() => useProviderSettings());

      // Wait for initial load
      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Verify initial state
      expect(result.current.settings?.connectedProviders.bedrock?.selectedModelId).toBe(
        'amazon-bedrock/anthropic.claude-haiku-4-5-20251001-v1:0'
      );

      // Act
      await act(async () => {
        await result.current.updateModel('bedrock', 'amazon-bedrock/anthropic.claude-opus-4-5-20251022-v1:0');
      });

      // Assert - local state should be updated
      expect(result.current.settings?.connectedProviders.bedrock?.selectedModelId).toBe(
        'amazon-bedrock/anthropic.claude-opus-4-5-20251022-v1:0'
      );
    });

    it('should handle updating model for different providers', async () => {
      // Arrange - Add another provider to settings
      mockGetProviderSettings.mockResolvedValue({
        activeProviderId: 'anthropic',
        connectedProviders: {
          anthropic: {
            providerId: 'anthropic',
            connectionStatus: 'connected',
            selectedModelId: 'anthropic/claude-haiku-4-5',
            credentials: { type: 'api_key', keyPrefix: 'sk-ant-...' },
            lastConnectedAt: new Date().toISOString(),
          },
          bedrock: {
            providerId: 'bedrock',
            connectionStatus: 'connected',
            selectedModelId: 'amazon-bedrock/anthropic.claude-haiku-4-5-20251001-v1:0',
            credentials: { type: 'bedrock', authMethod: 'apiKey', region: 'us-east-1' },
            lastConnectedAt: new Date().toISOString(),
          },
        },
        debugMode: false,
      });

      const { result } = renderHook(() => useProviderSettings());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Act - Update bedrock model
      await act(async () => {
        await result.current.updateModel('bedrock', 'amazon-bedrock/anthropic.claude-sonnet-4-5-20251022-v1:0');
      });

      // Assert
      expect(mockUpdateProviderModel).toHaveBeenCalledWith(
        'bedrock',
        'amazon-bedrock/anthropic.claude-sonnet-4-5-20251022-v1:0'
      );

      // Anthropic model should be unchanged
      expect(result.current.settings?.connectedProviders.anthropic?.selectedModelId).toBe(
        'anthropic/claude-haiku-4-5'
      );

      // Bedrock model should be updated
      expect(result.current.settings?.connectedProviders.bedrock?.selectedModelId).toBe(
        'amazon-bedrock/anthropic.claude-sonnet-4-5-20251022-v1:0'
      );
    });

    it('should handle setting model to null', async () => {
      // Arrange
      const { result } = renderHook(() => useProviderSettings());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Act
      await act(async () => {
        await result.current.updateModel('bedrock', null);
      });

      // Assert
      expect(mockUpdateProviderModel).toHaveBeenCalledWith('bedrock', null);
      expect(result.current.settings?.connectedProviders.bedrock?.selectedModelId).toBeNull();
    });
  });

  describe('Full flow: ModelSelector -> useProviderSettings -> IPC', () => {
    it('should propagate model change from UI to IPC call', async () => {
      // This test simulates the full flow from dropdown change to IPC call

      // Arrange
      const { result } = renderHook(() => useProviderSettings());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const models = result.current.settings?.connectedProviders.bedrock?.availableModels || [];

      // Create a wrapper component that uses the hook's updateModel
      const handleModelChange = async (modelId: string) => {
        await result.current.updateModel('bedrock', modelId);
      };

      render(
        <ModelSelector
          models={models}
          value={result.current.settings?.connectedProviders.bedrock?.selectedModelId || null}
          onChange={handleModelChange}
        />
      );

      // Act - Change the dropdown selection
      const select = screen.getByTestId('model-selector');
      await act(async () => {
        fireEvent.change(select, {
          target: { value: 'amazon-bedrock/anthropic.claude-opus-4-5-20251022-v1:0' },
        });
      });

      // Assert - IPC should have been called with correct values
      await waitFor(() => {
        expect(mockUpdateProviderModel).toHaveBeenCalledWith(
          'bedrock',
          'amazon-bedrock/anthropic.claude-opus-4-5-20251022-v1:0'
        );
      });
    });

    it('should update displayed value after model change', async () => {
      // Arrange
      const { result } = renderHook(() => useProviderSettings());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const models = [
        { id: 'amazon-bedrock/anthropic.claude-haiku-4-5-20251001-v1:0', name: 'Claude Haiku 4.5' },
        { id: 'amazon-bedrock/anthropic.claude-opus-4-5-20251022-v1:0', name: 'Claude Opus 4.5' },
      ];

      // Wrapper to track rendered value
      const TestComponent = () => {
        const selectedModelId = result.current.settings?.connectedProviders.bedrock?.selectedModelId;
        return (
          <ModelSelector
            models={models}
            value={selectedModelId || null}
            onChange={async (modelId) => {
              await result.current.updateModel('bedrock', modelId);
            }}
          />
        );
      };

      const { rerender } = render(<TestComponent />);

      // Initial state - Haiku selected
      const select = screen.getByTestId('model-selector') as HTMLSelectElement;
      expect(select.value).toBe('amazon-bedrock/anthropic.claude-haiku-4-5-20251001-v1:0');

      // Act - Change to Opus
      await act(async () => {
        fireEvent.change(select, {
          target: { value: 'amazon-bedrock/anthropic.claude-opus-4-5-20251022-v1:0' },
        });
      });

      // Rerender to reflect state change
      rerender(<TestComponent />);

      // Assert - After update, the value should be Opus
      await waitFor(() => {
        const updatedSelect = screen.getByTestId('model-selector') as HTMLSelectElement;
        expect(updatedSelect.value).toBe('amazon-bedrock/anthropic.claude-opus-4-5-20251022-v1:0');
      });
    });
  });

  describe('Edge cases', () => {
    it('should handle rapid model changes', async () => {
      // Arrange
      const { result } = renderHook(() => useProviderSettings());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Act - Rapid fire model changes
      await act(async () => {
        result.current.updateModel('bedrock', 'amazon-bedrock/model-1');
        result.current.updateModel('bedrock', 'amazon-bedrock/model-2');
        result.current.updateModel('bedrock', 'amazon-bedrock/model-3');
      });

      // Assert - All calls should be made
      expect(mockUpdateProviderModel).toHaveBeenCalledTimes(3);
      expect(mockUpdateProviderModel).toHaveBeenNthCalledWith(1, 'bedrock', 'amazon-bedrock/model-1');
      expect(mockUpdateProviderModel).toHaveBeenNthCalledWith(2, 'bedrock', 'amazon-bedrock/model-2');
      expect(mockUpdateProviderModel).toHaveBeenNthCalledWith(3, 'bedrock', 'amazon-bedrock/model-3');
    });

    it('should handle provider not found gracefully', async () => {
      // Arrange
      const { result } = renderHook(() => useProviderSettings());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Act - Try to update a non-existent provider
      await act(async () => {
        await result.current.updateModel('nonexistent' as any, 'some-model');
      });

      // Assert - Should still call IPC (let backend handle validation)
      expect(mockUpdateProviderModel).toHaveBeenCalledWith('nonexistent', 'some-model');

      // Local state should not crash (provider doesn't exist, so no update to state)
      expect(result.current.settings?.connectedProviders['nonexistent' as keyof typeof result.current.settings.connectedProviders]).toBeUndefined();
    });

    it('should handle IPC error gracefully', async () => {
      // Arrange
      mockUpdateProviderModel.mockRejectedValueOnce(new Error('IPC Error'));
      const { result } = renderHook(() => useProviderSettings());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Act & Assert - Should not throw
      await expect(
        act(async () => {
          await result.current.updateModel('bedrock', 'amazon-bedrock/some-model');
        })
      ).rejects.toThrow('IPC Error');

      // IPC was called
      expect(mockUpdateProviderModel).toHaveBeenCalled();
    });
  });
});
