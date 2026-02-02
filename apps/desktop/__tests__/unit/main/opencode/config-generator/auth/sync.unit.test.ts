/**
 * Unit tests for Auth Sync Module
 *
 * Tests the auth/sync module which synchronizes API keys from Openwork's
 * secure storage to OpenCode CLI's auth.json file. This enables OpenCode
 * to recognize DeepSeek, Z.AI, and MiniMax providers.
 *
 * NOTE: This is a UNIT test, not an integration test.
 * All external dependencies (fs, electron, secureStorage) are mocked to test
 * sync logic in isolation.
 *
 * Mocked external services:
 * - fs: Filesystem operations (read/write auth.json)
 * - electron: app.getPath for home directory
 * - secureStorage: API key retrieval
 *
 * @module __tests__/unit/main/opencode/config-generator/auth/sync.unit.test
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import path from 'path';

// Track written content for assertions
let writtenContent: string | null = null;
let writtenPath: string | null = null;
let createdDirs: string[] = [];

// Mock fs module
const mockFs = {
  existsSync: vi.fn(() => false),
  readFileSync: vi.fn(() => '{}'),
  writeFileSync: vi.fn((filePath: string, content: string) => {
    writtenPath = filePath;
    writtenContent = content;
  }),
  mkdirSync: vi.fn((dir: string) => {
    createdDirs.push(dir);
  }),
};

vi.mock('fs', () => ({
  default: mockFs,
  existsSync: mockFs.existsSync,
  readFileSync: mockFs.readFileSync,
  writeFileSync: mockFs.writeFileSync,
  mkdirSync: mockFs.mkdirSync,
}));

// Mock electron module
const mockApp = {
  getPath: vi.fn((name: string) => {
    if (name === 'home') return '/mock/home';
    return `/mock/path/${name}`;
  }),
};

vi.mock('electron', () => ({
  app: mockApp,
}));

// Mock secure storage
const mockGetAllApiKeys = vi.fn(() =>
  Promise.resolve({
    anthropic: null,
    openai: null,
    google: null,
    xai: null,
    deepseek: null,
    zai: null,
    minimax: null,
  })
);

vi.mock('@main/store/secureStorage', () => ({
  getAllApiKeys: mockGetAllApiKeys,
}));

// Expected API key mappings (source key -> auth.json key)
const API_KEY_MAPPINGS = {
  deepseek: 'deepseek',
  zai: 'zai-coding-plan',
  minimax: 'minimax',
} as const;

// Auth entry structure in auth.json
interface AuthEntry {
  type: string;
  key: string;
}

type AuthJson = Record<string, AuthEntry>;

describe('Auth Sync Module', () => {
  let syncApiKeysToOpenCodeAuth: () => Promise<void>;
  let getOpenCodeAuthPath: () => string;

  // Store original platform for restoration
  const originalPlatform = process.platform;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Reset tracking variables
    writtenContent = null;
    writtenPath = null;
    createdDirs = [];

    // Reset mocks to default state
    mockFs.existsSync.mockReturnValue(false);
    mockFs.readFileSync.mockReturnValue('{}');
    mockGetAllApiKeys.mockResolvedValue({
      anthropic: null,
      openai: null,
      google: null,
      xai: null,
      deepseek: null,
      zai: null,
      minimax: null,
    });

    // Import module
    const module = await import('@main/opencode/config-generator/auth/sync');
    syncApiKeysToOpenCodeAuth = module.syncApiKeysToOpenCodeAuth;
    getOpenCodeAuthPath = module.getOpenCodeAuthPath;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();

    // Restore platform if it was modified
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
    });
  });

  describe('syncApiKeysToOpenCodeAuth()', () => {
    describe('Empty API Keys', () => {
      it('should do nothing if no API keys are provided', async () => {
        // Arrange - all keys are null (default mock state)

        // Act
        await syncApiKeysToOpenCodeAuth();

        // Assert
        expect(mockFs.writeFileSync).not.toHaveBeenCalled();
      });

      it('should do nothing if API keys object is empty', async () => {
        // Arrange
        mockGetAllApiKeys.mockResolvedValue({
          anthropic: null,
          openai: null,
          google: null,
          xai: null,
          deepseek: null,
          zai: null,
          minimax: null,
        });

        // Act
        await syncApiKeysToOpenCodeAuth();

        // Assert
        expect(mockFs.writeFileSync).not.toHaveBeenCalled();
      });
    });

    describe('Directory Creation', () => {
      it('should create auth directory if it does not exist', async () => {
        // Arrange
        mockFs.existsSync.mockImplementation((p: string) => {
          // Directory doesn't exist, but we have a key to sync
          return false;
        });
        mockGetAllApiKeys.mockResolvedValue({
          anthropic: null,
          openai: null,
          google: null,
          xai: null,
          deepseek: 'test-deepseek-key',
          zai: null,
          minimax: null,
        });

        // Act
        await syncApiKeysToOpenCodeAuth();

        // Assert
        expect(mockFs.mkdirSync).toHaveBeenCalledWith(
          expect.stringContaining('opencode'),
          { recursive: true }
        );
      });

      it('should not create directory if it already exists', async () => {
        // Arrange
        mockFs.existsSync.mockImplementation((p: string) => {
          // Both directory and file exist
          return true;
        });
        mockFs.readFileSync.mockReturnValue('{}');
        mockGetAllApiKeys.mockResolvedValue({
          anthropic: null,
          openai: null,
          google: null,
          xai: null,
          deepseek: 'test-deepseek-key',
          zai: null,
          minimax: null,
        });

        // Act
        await syncApiKeysToOpenCodeAuth();

        // Assert
        expect(mockFs.mkdirSync).not.toHaveBeenCalled();
      });
    });

    describe('Auth File Creation', () => {
      it('should create new auth.json if file does not exist', async () => {
        // Arrange
        let fileCheckCount = 0;
        mockFs.existsSync.mockImplementation((p: string) => {
          fileCheckCount++;
          // First call: directory check (false, needs creation)
          // Second call: file check (false, needs creation)
          if (p.includes('auth.json')) return false;
          return fileCheckCount > 1; // Dir exists after first check
        });
        mockGetAllApiKeys.mockResolvedValue({
          anthropic: null,
          openai: null,
          google: null,
          xai: null,
          deepseek: 'test-deepseek-key',
          zai: null,
          minimax: null,
        });

        // Act
        await syncApiKeysToOpenCodeAuth();

        // Assert
        expect(mockFs.writeFileSync).toHaveBeenCalled();
        expect(writtenPath).toContain('auth.json');
        const writtenAuth = JSON.parse(writtenContent!) as AuthJson;
        expect(writtenAuth.deepseek).toEqual({
          type: 'api',
          key: 'test-deepseek-key',
        });
      });

      it('should handle malformed existing auth.json gracefully', async () => {
        // Arrange
        mockFs.existsSync.mockReturnValue(true);
        mockFs.readFileSync.mockReturnValue('not valid json {{{');
        mockGetAllApiKeys.mockResolvedValue({
          anthropic: null,
          openai: null,
          google: null,
          xai: null,
          deepseek: 'test-deepseek-key',
          zai: null,
          minimax: null,
        });

        // Act
        await syncApiKeysToOpenCodeAuth();

        // Assert - should create fresh auth object
        expect(mockFs.writeFileSync).toHaveBeenCalled();
        const writtenAuth = JSON.parse(writtenContent!) as AuthJson;
        expect(writtenAuth.deepseek).toBeDefined();
      });
    });

    describe('Individual Key Syncing', () => {
      it('should sync deepseek key when present', async () => {
        // Arrange
        mockFs.existsSync.mockReturnValue(true);
        mockFs.readFileSync.mockReturnValue('{}');
        mockGetAllApiKeys.mockResolvedValue({
          anthropic: null,
          openai: null,
          google: null,
          xai: null,
          deepseek: 'sk-deepseek-12345',
          zai: null,
          minimax: null,
        });

        // Act
        await syncApiKeysToOpenCodeAuth();

        // Assert
        const writtenAuth = JSON.parse(writtenContent!) as AuthJson;
        expect(writtenAuth.deepseek).toEqual({
          type: 'api',
          key: 'sk-deepseek-12345',
        });
      });

      it('should sync zai key as "zai-coding-plan" in auth.json', async () => {
        // Arrange
        mockFs.existsSync.mockReturnValue(true);
        mockFs.readFileSync.mockReturnValue('{}');
        mockGetAllApiKeys.mockResolvedValue({
          anthropic: null,
          openai: null,
          google: null,
          xai: null,
          deepseek: null,
          zai: 'zai-api-key-67890',
          minimax: null,
        });

        // Act
        await syncApiKeysToOpenCodeAuth();

        // Assert - key should be stored under 'zai-coding-plan', not 'zai'
        const writtenAuth = JSON.parse(writtenContent!) as AuthJson;
        expect(writtenAuth['zai-coding-plan']).toEqual({
          type: 'api',
          key: 'zai-api-key-67890',
        });
        expect(writtenAuth.zai).toBeUndefined();
      });

      it('should sync minimax key when present', async () => {
        // Arrange
        mockFs.existsSync.mockReturnValue(true);
        mockFs.readFileSync.mockReturnValue('{}');
        mockGetAllApiKeys.mockResolvedValue({
          anthropic: null,
          openai: null,
          google: null,
          xai: null,
          deepseek: null,
          zai: null,
          minimax: 'minimax-secret-key',
        });

        // Act
        await syncApiKeysToOpenCodeAuth();

        // Assert
        const writtenAuth = JSON.parse(writtenContent!) as AuthJson;
        expect(writtenAuth.minimax).toEqual({
          type: 'api',
          key: 'minimax-secret-key',
        });
      });

      it('should sync all three keys together when all present', async () => {
        // Arrange
        mockFs.existsSync.mockReturnValue(true);
        mockFs.readFileSync.mockReturnValue('{}');
        mockGetAllApiKeys.mockResolvedValue({
          anthropic: null,
          openai: null,
          google: null,
          xai: null,
          deepseek: 'deepseek-key',
          zai: 'zai-key',
          minimax: 'minimax-key',
        });

        // Act
        await syncApiKeysToOpenCodeAuth();

        // Assert
        const writtenAuth = JSON.parse(writtenContent!) as AuthJson;
        expect(writtenAuth.deepseek).toEqual({ type: 'api', key: 'deepseek-key' });
        expect(writtenAuth['zai-coding-plan']).toEqual({ type: 'api', key: 'zai-key' });
        expect(writtenAuth.minimax).toEqual({ type: 'api', key: 'minimax-key' });
      });
    });

    describe('Change Detection', () => {
      it('should only write if changes are detected', async () => {
        // Arrange - existing auth already has the same key
        mockFs.existsSync.mockReturnValue(true);
        mockFs.readFileSync.mockReturnValue(
          JSON.stringify({
            deepseek: { type: 'api', key: 'same-key' },
          })
        );
        mockGetAllApiKeys.mockResolvedValue({
          anthropic: null,
          openai: null,
          google: null,
          xai: null,
          deepseek: 'same-key',
          zai: null,
          minimax: null,
        });

        // Act
        await syncApiKeysToOpenCodeAuth();

        // Assert - no write because nothing changed
        expect(mockFs.writeFileSync).not.toHaveBeenCalled();
      });

      it('should update existing key if value changed', async () => {
        // Arrange - existing auth has old key value
        mockFs.existsSync.mockReturnValue(true);
        mockFs.readFileSync.mockReturnValue(
          JSON.stringify({
            deepseek: { type: 'api', key: 'old-key' },
          })
        );
        mockGetAllApiKeys.mockResolvedValue({
          anthropic: null,
          openai: null,
          google: null,
          xai: null,
          deepseek: 'new-key',
          zai: null,
          minimax: null,
        });

        // Act
        await syncApiKeysToOpenCodeAuth();

        // Assert - should write because key changed
        expect(mockFs.writeFileSync).toHaveBeenCalled();
        const writtenAuth = JSON.parse(writtenContent!) as AuthJson;
        expect(writtenAuth.deepseek.key).toBe('new-key');
      });

      it('should not update if key is unchanged', async () => {
        // Arrange
        const existingAuth = {
          deepseek: { type: 'api', key: 'unchanged-key' },
          'zai-coding-plan': { type: 'api', key: 'unchanged-zai' },
        };
        mockFs.existsSync.mockReturnValue(true);
        mockFs.readFileSync.mockReturnValue(JSON.stringify(existingAuth));
        mockGetAllApiKeys.mockResolvedValue({
          anthropic: null,
          openai: null,
          google: null,
          xai: null,
          deepseek: 'unchanged-key',
          zai: 'unchanged-zai',
          minimax: null,
        });

        // Act
        await syncApiKeysToOpenCodeAuth();

        // Assert - no write needed
        expect(mockFs.writeFileSync).not.toHaveBeenCalled();
      });
    });

    describe('Preserving Existing Auth Entries', () => {
      it('should preserve existing auth entries for other providers', async () => {
        // Arrange - existing auth has anthropic and openai keys
        const existingAuth = {
          anthropic: { type: 'api', key: 'anthropic-key' },
          openai: { type: 'api', key: 'openai-key' },
          'custom-provider': { type: 'api', key: 'custom-key' },
        };
        mockFs.existsSync.mockReturnValue(true);
        mockFs.readFileSync.mockReturnValue(JSON.stringify(existingAuth));
        mockGetAllApiKeys.mockResolvedValue({
          anthropic: null,
          openai: null,
          google: null,
          xai: null,
          deepseek: 'new-deepseek-key',
          zai: null,
          minimax: null,
        });

        // Act
        await syncApiKeysToOpenCodeAuth();

        // Assert - all existing keys should be preserved
        const writtenAuth = JSON.parse(writtenContent!) as AuthJson;
        expect(writtenAuth.anthropic).toEqual({
          type: 'api',
          key: 'anthropic-key',
        });
        expect(writtenAuth.openai).toEqual({ type: 'api', key: 'openai-key' });
        expect(writtenAuth['custom-provider']).toEqual({
          type: 'api',
          key: 'custom-key',
        });
        expect(writtenAuth.deepseek).toEqual({
          type: 'api',
          key: 'new-deepseek-key',
        });
      });

      it('should not remove keys that are not being synced', async () => {
        // Arrange
        const existingAuth = {
          anthropic: { type: 'api', key: 'keep-this' },
          deepseek: { type: 'api', key: 'old-deepseek' },
        };
        mockFs.existsSync.mockReturnValue(true);
        mockFs.readFileSync.mockReturnValue(JSON.stringify(existingAuth));
        mockGetAllApiKeys.mockResolvedValue({
          anthropic: null,
          openai: null,
          google: null,
          xai: null,
          deepseek: 'updated-deepseek',
          zai: null,
          minimax: null,
        });

        // Act
        await syncApiKeysToOpenCodeAuth();

        // Assert
        const writtenAuth = JSON.parse(writtenContent!) as AuthJson;
        expect(writtenAuth.anthropic).toEqual({ type: 'api', key: 'keep-this' });
      });
    });

    describe('Auth Entry Structure', () => {
      it('should create entries with type "api" and key value', async () => {
        // Arrange
        mockFs.existsSync.mockReturnValue(true);
        mockFs.readFileSync.mockReturnValue('{}');
        mockGetAllApiKeys.mockResolvedValue({
          anthropic: null,
          openai: null,
          google: null,
          xai: null,
          deepseek: 'test-key',
          zai: null,
          minimax: null,
        });

        // Act
        await syncApiKeysToOpenCodeAuth();

        // Assert
        const writtenAuth = JSON.parse(writtenContent!) as AuthJson;
        expect(writtenAuth.deepseek).toHaveProperty('type', 'api');
        expect(writtenAuth.deepseek).toHaveProperty('key', 'test-key');
      });

      it('should write pretty-printed JSON with 2-space indentation', async () => {
        // Arrange
        mockFs.existsSync.mockReturnValue(true);
        mockFs.readFileSync.mockReturnValue('{}');
        mockGetAllApiKeys.mockResolvedValue({
          anthropic: null,
          openai: null,
          google: null,
          xai: null,
          deepseek: 'test-key',
          zai: null,
          minimax: null,
        });

        // Act
        await syncApiKeysToOpenCodeAuth();

        // Assert - content should be formatted
        expect(writtenContent).toContain('\n');
        expect(writtenContent).toContain('  '); // 2-space indentation
      });
    });
  });

  describe('getOpenCodeAuthPath()', () => {
    describe('macOS/Linux Path', () => {
      it('should return ~/.local/share/opencode/auth.json on non-Windows', async () => {
        // Arrange
        Object.defineProperty(process, 'platform', { value: 'darwin' });

        // Re-import to get fresh module with new platform
        vi.resetModules();
        const module = await import('@main/opencode/config-generator/auth/sync');

        // Act
        const authPath = module.getOpenCodeAuthPath();

        // Assert
        expect(authPath).toBe('/mock/home/.local/share/opencode/auth.json');
      });

      it('should work on Linux platform', async () => {
        // Arrange
        Object.defineProperty(process, 'platform', { value: 'linux' });

        // Re-import to get fresh module with new platform
        vi.resetModules();
        const module = await import('@main/opencode/config-generator/auth/sync');

        // Act
        const authPath = module.getOpenCodeAuthPath();

        // Assert
        expect(authPath).toBe('/mock/home/.local/share/opencode/auth.json');
      });
    });

    describe('Windows Path', () => {
      it('should return AppData/Local/opencode/auth.json on Windows', async () => {
        // Arrange
        Object.defineProperty(process, 'platform', { value: 'win32' });
        mockApp.getPath.mockImplementation((name: string) => {
          if (name === 'home') return 'C:\\Users\\TestUser';
          return `C:\\mock\\${name}`;
        });

        // Re-import to get fresh module with new platform
        vi.resetModules();
        const module = await import('@main/opencode/config-generator/auth/sync');

        // Act
        const authPath = module.getOpenCodeAuthPath();

        // Assert
        expect(authPath).toContain('AppData');
        expect(authPath).toContain('Local');
        expect(authPath).toContain('opencode');
        expect(authPath).toContain('auth.json');
      });
    });
  });

  describe('API_KEY_MAPPINGS Export', () => {
    it('should export correct mapping for deepseek', async () => {
      // Act
      const module = await import('@main/opencode/config-generator/auth/sync');

      // Assert
      expect(module.API_KEY_MAPPINGS.deepseek).toBe('deepseek');
    });

    it('should export correct mapping for zai -> zai-coding-plan', async () => {
      // Act
      const module = await import('@main/opencode/config-generator/auth/sync');

      // Assert
      expect(module.API_KEY_MAPPINGS.zai).toBe('zai-coding-plan');
    });

    it('should export correct mapping for minimax', async () => {
      // Act
      const module = await import('@main/opencode/config-generator/auth/sync');

      // Assert
      expect(module.API_KEY_MAPPINGS.minimax).toBe('minimax');
    });

    it('should have exactly 3 mappings', async () => {
      // Act
      const module = await import('@main/opencode/config-generator/auth/sync');

      // Assert
      expect(Object.keys(module.API_KEY_MAPPINGS)).toHaveLength(3);
    });
  });

  describe('Error Handling', () => {
    it('should handle fs read errors gracefully', async () => {
      // Arrange
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockImplementation(() => {
        throw new Error('EACCES: permission denied');
      });
      mockGetAllApiKeys.mockResolvedValue({
        anthropic: null,
        openai: null,
        google: null,
        xai: null,
        deepseek: 'test-key',
        zai: null,
        minimax: null,
      });

      // Act & Assert - should not throw, should create new auth
      await expect(syncApiKeysToOpenCodeAuth()).resolves.not.toThrow();
    });

    it('should handle secureStorage errors gracefully', async () => {
      // Arrange
      mockGetAllApiKeys.mockRejectedValue(new Error('Keychain access denied'));

      // Act & Assert
      await expect(syncApiKeysToOpenCodeAuth()).rejects.toThrow(
        'Keychain access denied'
      );
    });
  });

  describe('Logging', () => {
    it('should log when syncing deepseek key', async () => {
      // Arrange
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('{}');
      mockGetAllApiKeys.mockResolvedValue({
        anthropic: null,
        openai: null,
        google: null,
        xai: null,
        deepseek: 'test-key',
        zai: null,
        minimax: null,
      });

      // Act
      await syncApiKeysToOpenCodeAuth();

      // Assert
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('DeepSeek')
      );
      consoleSpy.mockRestore();
    });

    it('should log when syncing zai key', async () => {
      // Arrange
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('{}');
      mockGetAllApiKeys.mockResolvedValue({
        anthropic: null,
        openai: null,
        google: null,
        xai: null,
        deepseek: null,
        zai: 'test-zai-key',
        minimax: null,
      });

      // Act
      await syncApiKeysToOpenCodeAuth();

      // Assert
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Z.AI')
      );
      consoleSpy.mockRestore();
    });

    it('should log when syncing minimax key', async () => {
      // Arrange
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('{}');
      mockGetAllApiKeys.mockResolvedValue({
        anthropic: null,
        openai: null,
        google: null,
        xai: null,
        deepseek: null,
        zai: null,
        minimax: 'test-minimax-key',
      });

      // Act
      await syncApiKeysToOpenCodeAuth();

      // Assert
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('MiniMax')
      );
      consoleSpy.mockRestore();
    });

    it('should log auth.json path when updated', async () => {
      // Arrange
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('{}');
      mockGetAllApiKeys.mockResolvedValue({
        anthropic: null,
        openai: null,
        google: null,
        xai: null,
        deepseek: 'test-key',
        zai: null,
        minimax: null,
      });

      // Act
      await syncApiKeysToOpenCodeAuth();

      // Assert
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('auth.json')
      );
      consoleSpy.mockRestore();
    });

    it('should warn when parsing existing auth.json fails', async () => {
      // Arrange
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('invalid json');
      mockGetAllApiKeys.mockResolvedValue({
        anthropic: null,
        openai: null,
        google: null,
        xai: null,
        deepseek: 'test-key',
        zai: null,
        minimax: null,
      });

      // Act
      await syncApiKeysToOpenCodeAuth();

      // Assert
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to parse')
      );
      consoleWarnSpy.mockRestore();
    });
  });
});
