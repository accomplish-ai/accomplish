/**
 * Integration tests for appSettings store
 * Tests the appSettings API with mocked SQLite backend
 * @module __tests__/integration/main/appSettings.integration.test
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock data storage for tests
let mockAppSettingsData = {
  debug_mode: 0,
  onboarding_complete: 0,
  selected_model: null as string | null,
  ollama_config: null as string | null,
  litellm_config: null as string | null,
  azure_foundry_config: null as string | null,
};

// Reset mock data
function resetMockData() {
  mockAppSettingsData = {
    debug_mode: 0,
    onboarding_complete: 0,
    selected_model: null,
    ollama_config: null,
    litellm_config: null,
    azure_foundry_config: null,
  };
}

// Mock the database module with in-memory storage
vi.mock('@main/store/db', () => ({
  getDatabase: vi.fn(() => ({
    pragma: vi.fn(),
    prepare: vi.fn((sql: string) => {
      // Handle SELECT queries
      if (sql.includes('SELECT')) {
        return {
          get: vi.fn(() => ({
            id: 1,
            ...mockAppSettingsData,
          })),
          all: vi.fn(() => []),
        };
      }
      // Handle UPDATE queries
      if (sql.includes('UPDATE')) {
        return {
          run: vi.fn((...args: unknown[]) => {
            // Parse which field is being updated based on the SQL
            if (sql.includes('debug_mode = ?')) {
              mockAppSettingsData.debug_mode = args[0] as number;
            }
            if (sql.includes('onboarding_complete = ?')) {
              mockAppSettingsData.onboarding_complete = args[0] as number;
            }
            if (sql.includes('selected_model = ?')) {
              mockAppSettingsData.selected_model = args[0] as string | null;
            }
            if (sql.includes('ollama_config = ?')) {
              mockAppSettingsData.ollama_config = args[0] as string | null;
            }
            if (sql.includes('litellm_config = ?')) {
              mockAppSettingsData.litellm_config = args[0] as string | null;
            }
            if (sql.includes('azure_foundry_config = ?')) {
              mockAppSettingsData.azure_foundry_config = args[0] as string | null;
            }
            // Handle clearAppSettings - reset all fields
            if (sql.includes('debug_mode = 0') && sql.includes('onboarding_complete = 0')) {
              resetMockData();
            }
          }),
        };
      }
      return { run: vi.fn(), get: vi.fn(), all: vi.fn() };
    }),
    exec: vi.fn(),
    transaction: vi.fn((fn: () => unknown) => fn),
    close: vi.fn(),
  })),
  closeDatabase: vi.fn(),
  resetDatabase: vi.fn(),
  getDatabasePath: vi.fn(() => '/mock/path/openwork-dev.db'),
  databaseExists: vi.fn(() => true),
  initializeDatabase: vi.fn(),
}));

describe('appSettings Integration', () => {
  beforeEach(() => {
    resetMockData();
  });

  describe('debugMode', () => {
    it('should return false as default value for debugMode', async () => {
      // Arrange
      const { getDebugMode } = await import('@main/store/appSettings');

      // Act
      const result = getDebugMode();

      // Assert
      expect(result).toBe(false);
    });

    it('should persist debugMode after setting to true', async () => {
      // Arrange
      const { getDebugMode, setDebugMode } = await import('@main/store/appSettings');

      // Act
      setDebugMode(true);
      const result = getDebugMode();

      // Assert
      expect(result).toBe(true);
    });

    it('should persist debugMode after setting to false', async () => {
      // Arrange
      const { getDebugMode, setDebugMode } = await import('@main/store/appSettings');

      // Act - set to true first, then false
      setDebugMode(true);
      setDebugMode(false);
      const result = getDebugMode();

      // Assert
      expect(result).toBe(false);
    });

    it('should round-trip debugMode value correctly', async () => {
      // Arrange
      const { getDebugMode, setDebugMode } = await import('@main/store/appSettings');

      // Act & Assert - multiple round trips
      setDebugMode(true);
      expect(getDebugMode()).toBe(true);

      setDebugMode(false);
      expect(getDebugMode()).toBe(false);

      setDebugMode(true);
      expect(getDebugMode()).toBe(true);
    });
  });

  describe('onboardingComplete', () => {
    it('should return false as default value for onboardingComplete', async () => {
      // Arrange
      const { getOnboardingComplete } = await import('@main/store/appSettings');

      // Act
      const result = getOnboardingComplete();

      // Assert
      expect(result).toBe(false);
    });

    it('should persist onboardingComplete after setting to true', async () => {
      // Arrange
      const { getOnboardingComplete, setOnboardingComplete } = await import('@main/store/appSettings');

      // Act
      setOnboardingComplete(true);
      const result = getOnboardingComplete();

      // Assert
      expect(result).toBe(true);
    });

    it('should persist onboardingComplete after setting to false', async () => {
      // Arrange
      const { getOnboardingComplete, setOnboardingComplete } = await import('@main/store/appSettings');

      // Act
      setOnboardingComplete(true);
      setOnboardingComplete(false);
      const result = getOnboardingComplete();

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('selectedModel', () => {
    it('should return null as default value for selectedModel', async () => {
      // Arrange
      const { getSelectedModel } = await import('@main/store/appSettings');

      // Act
      const result = getSelectedModel();

      // Assert
      expect(result).toBeNull();
    });

    it('should persist selectedModel after setting', async () => {
      // Arrange
      const { getSelectedModel, setSelectedModel } = await import('@main/store/appSettings');
      const model = { provider: 'anthropic' as const, model: 'claude-3-opus' };

      // Act
      setSelectedModel(model);
      const result = getSelectedModel();

      // Assert
      expect(result).toEqual(model);
    });

    it('should handle complex model objects', async () => {
      // Arrange
      const { getSelectedModel, setSelectedModel } = await import('@main/store/appSettings');
      const model = {
        provider: 'ollama' as const,
        model: 'llama2',
        baseUrl: 'http://localhost:11434',
      };

      // Act
      setSelectedModel(model);
      const result = getSelectedModel();

      // Assert
      expect(result).toEqual(model);
    });
  });

  describe('ollamaConfig', () => {
    it('should return null as default value for ollamaConfig', async () => {
      // Arrange
      const { getOllamaConfig } = await import('@main/store/appSettings');

      // Act
      const result = getOllamaConfig();

      // Assert
      expect(result).toBeNull();
    });

    it('should persist ollamaConfig after setting', async () => {
      // Arrange
      const { getOllamaConfig, setOllamaConfig } = await import('@main/store/appSettings');
      const config = { baseUrl: 'http://localhost:11434', enabled: true };

      // Act
      setOllamaConfig(config);
      const result = getOllamaConfig();

      // Assert
      expect(result).toEqual(config);
    });

    it('should allow setting ollamaConfig to null', async () => {
      // Arrange
      const { getOllamaConfig, setOllamaConfig } = await import('@main/store/appSettings');
      const config = { baseUrl: 'http://localhost:11434', enabled: true };

      // Act
      setOllamaConfig(config);
      setOllamaConfig(null);
      const result = getOllamaConfig();

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('litellmConfig', () => {
    it('should return null as default value for litellmConfig', async () => {
      // Arrange
      const { getLiteLLMConfig } = await import('@main/store/appSettings');

      // Act
      const result = getLiteLLMConfig();

      // Assert
      expect(result).toBeNull();
    });

    it('should persist litellmConfig after setting', async () => {
      // Arrange
      const { getLiteLLMConfig, setLiteLLMConfig } = await import('@main/store/appSettings');
      const config = { baseUrl: 'http://localhost:4000', enabled: true };

      // Act
      setLiteLLMConfig(config);
      const result = getLiteLLMConfig();

      // Assert
      expect(result).toEqual(config);
    });

    it('should allow setting litellmConfig to null', async () => {
      // Arrange
      const { getLiteLLMConfig, setLiteLLMConfig } = await import('@main/store/appSettings');
      const config = { baseUrl: 'http://localhost:4000', enabled: true };

      // Act
      setLiteLLMConfig(config);
      setLiteLLMConfig(null);
      const result = getLiteLLMConfig();

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('getAppSettings', () => {
    it('should return all settings with default values', async () => {
      // Arrange
      const { getAppSettings } = await import('@main/store/appSettings');

      // Act
      const result = getAppSettings();

      // Assert
      expect(result).toEqual({
        debugMode: false,
        onboardingComplete: false,
        selectedModel: null,
        ollamaConfig: null,
        litellmConfig: null,
        azureFoundryConfig: null,
      });
    });

    it('should return all settings after modifications', async () => {
      // Arrange
      const {
        getAppSettings,
        setDebugMode,
        setOnboardingComplete,
        setSelectedModel,
      } = await import('@main/store/appSettings');

      // Act
      setDebugMode(true);
      setOnboardingComplete(true);
      setSelectedModel({ provider: 'google', model: 'gemini-pro' });
      const result = getAppSettings();

      // Assert
      expect(result.debugMode).toBe(true);
      expect(result.onboardingComplete).toBe(true);
      expect(result.selectedModel).toEqual({ provider: 'google', model: 'gemini-pro' });
    });
  });

  describe('clearAppSettings', () => {
    it('should reset all settings to defaults', async () => {
      // Arrange
      const {
        getAppSettings,
        setDebugMode,
        setOnboardingComplete,
        setSelectedModel,
        clearAppSettings,
      } = await import('@main/store/appSettings');

      // Set some values first
      setDebugMode(true);
      setOnboardingComplete(true);
      setSelectedModel({ provider: 'anthropic', model: 'claude-3' });

      // Act
      clearAppSettings();
      const result = getAppSettings();

      // Assert
      expect(result).toEqual({
        debugMode: false,
        onboardingComplete: false,
        selectedModel: null,
        ollamaConfig: null,
        litellmConfig: null,
        azureFoundryConfig: null,
      });
    });
  });

  describe('azureFoundryConfig', () => {
    it('should return null when azure foundry config is not set', async () => {
      // Arrange
      const { getAzureFoundryConfig } = await import('@main/store/appSettings');

      // Act
      const result = getAzureFoundryConfig();

      // Assert
      expect(result).toBeNull();
    });

    it('should store and retrieve azure foundry config', async () => {
      // Arrange
      const { getAzureFoundryConfig, setAzureFoundryConfig } = await import('@main/store/appSettings');

      const config = {
        baseUrl: 'https://myendpoint.openai.azure.com',
        deploymentName: 'gpt-4',
        authType: 'api-key' as const,
        enabled: true,
      };

      // Act
      setAzureFoundryConfig(config);
      const result = getAzureFoundryConfig();

      // Assert
      expect(result).toEqual(config);
    });

    it('should handle entra-id auth type', async () => {
      // Arrange
      const { getAzureFoundryConfig, setAzureFoundryConfig } = await import('@main/store/appSettings');

      const config = {
        baseUrl: 'https://test.openai.azure.com',
        deploymentName: 'claude-deployment',
        authType: 'entra-id' as const,
        enabled: true,
        lastValidated: Date.now(),
      };

      // Act
      setAzureFoundryConfig(config);
      const result = getAzureFoundryConfig();

      // Assert
      expect(result).toEqual(config);
    });

    it('should allow setting azure foundry config to null', async () => {
      // Arrange
      const { getAzureFoundryConfig, setAzureFoundryConfig } = await import('@main/store/appSettings');

      const config = {
        baseUrl: 'https://test.openai.azure.com',
        deploymentName: 'test',
        authType: 'api-key' as const,
        enabled: true,
      };

      // Act
      setAzureFoundryConfig(config);
      setAzureFoundryConfig(null);
      const result = getAzureFoundryConfig();

      // Assert
      expect(result).toBeNull();
    });

    it('should handle malformed JSON gracefully', async () => {
      // Arrange
      const { getAzureFoundryConfig } = await import('@main/store/appSettings');

      // Set invalid JSON directly in mock
      mockAppSettingsData.azure_foundry_config = 'invalid-json';

      // Act
      const result = getAzureFoundryConfig();

      // Assert
      expect(result).toBeNull();
    });

    it('should clear azure foundry config with clearAppSettings', async () => {
      // Arrange
      const { setAzureFoundryConfig, clearAppSettings, getAzureFoundryConfig } = await import('@main/store/appSettings');

      setAzureFoundryConfig({
        baseUrl: 'https://test.openai.azure.com',
        deploymentName: 'test',
        authType: 'api-key' as const,
        enabled: true,
      });

      // Act
      clearAppSettings();
      const result = getAzureFoundryConfig();

      // Assert
      expect(result).toBeNull();
    });
  });
});
