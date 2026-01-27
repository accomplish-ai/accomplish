/**
 * Integration tests for theme settings
 * Tests the theme API with mocked SQLite backend
 * @module __tests__/integration/main/theme.integration.test
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
  lmstudio_config: null as string | null,
  openai_base_url: '' as string | null,
  theme: 'light' as string,
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
    lmstudio_config: null,
    openai_base_url: '',
    theme: 'light',
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
            if (sql.includes('theme = ?')) {
              mockAppSettingsData.theme = args[0] as string;
            }
            if (sql.includes('debug_mode = ?')) {
              mockAppSettingsData.debug_mode = args[0] as number;
            }
            if (sql.includes('onboarding_complete = ?')) {
              mockAppSettingsData.onboarding_complete = args[0] as number;
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

describe('Theme Integration', () => {
  beforeEach(() => {
    resetMockData();
  });

  describe('getTheme', () => {
    it('should return "light" as default value for theme', async () => {
      // Arrange
      const { getTheme } = await import('@main/store/appSettings');

      // Act
      const result = getTheme();

      // Assert
      expect(result).toBe('light');
    });
  });

  describe('setTheme', () => {
    it('should persist theme after setting to "dark"', async () => {
      // Arrange
      const { getTheme, setTheme } = await import('@main/store/appSettings');

      // Act
      setTheme('dark');
      const result = getTheme();

      // Assert
      expect(result).toBe('dark');
    });

    it('should persist theme after setting to "light"', async () => {
      // Arrange
      const { getTheme, setTheme } = await import('@main/store/appSettings');

      // Act - set to dark first, then light
      setTheme('dark');
      setTheme('light');
      const result = getTheme();

      // Assert
      expect(result).toBe('light');
    });

    it('should round-trip theme value correctly', async () => {
      // Arrange
      const { getTheme, setTheme } = await import('@main/store/appSettings');

      // Act & Assert - multiple round trips
      setTheme('dark');
      expect(getTheme()).toBe('dark');

      setTheme('light');
      expect(getTheme()).toBe('light');

      setTheme('dark');
      expect(getTheme()).toBe('dark');
    });
  });

  describe('getAppSettings', () => {
    it('should include theme in settings with default value', async () => {
      // Arrange
      const { getAppSettings } = await import('@main/store/appSettings');

      // Act
      const result = getAppSettings();

      // Assert
      expect(result.theme).toBe('light');
    });

    it('should include theme in settings after modification', async () => {
      // Arrange
      const { getAppSettings, setTheme } = await import('@main/store/appSettings');

      // Act
      setTheme('dark');
      const result = getAppSettings();

      // Assert
      expect(result.theme).toBe('dark');
    });
  });

  describe('clearAppSettings', () => {
    it('should reset theme to "light" on clear', async () => {
      // Arrange
      const { getTheme, setTheme, clearAppSettings } = await import('@main/store/appSettings');

      // Set theme to dark first
      setTheme('dark');

      // Act
      clearAppSettings();
      const result = getTheme();

      // Assert
      expect(result).toBe('light');
    });
  });
});
