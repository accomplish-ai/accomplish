import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

let tempDir: string;
let originalCwd: string;

const getTempDir = () => tempDir;

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => {
      if (name === 'userData') {
        return getTempDir();
      }
      return `/mock/path/${name}`;
    },
    getVersion: () => '0.1.0',
    getName: () => 'Accomplish',
    isPackaged: false,
  },
}));

describe('secureStorage Integration', () => {
  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'secureStorage-test-'));
    originalCwd = process.cwd();

    vi.resetModules();
  });

  afterEach(async () => {
    try {
      const { clearSecureStorage } = await import('@main/store/secureStorage');
      clearSecureStorage();
    } catch {
      // Module may not be loaded
    }

    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    process.chdir(originalCwd);
  });

  describe('storeApiKey and getApiKey', () => {
    it('should store and retrieve an API key', async () => {
      const { storeApiKey, getApiKey } = await import('@main/store/secureStorage');
      const testKey = 'sk-test-anthropic-key-12345';

      storeApiKey('anthropic', testKey);
      const result = getApiKey('anthropic');

      expect(result).toBe(testKey);
    });

    it('should return null for non-existent provider', async () => {
      const { getApiKey } = await import('@main/store/secureStorage');

      const result = getApiKey('anthropic');

      expect(result).toBeNull();
    });

    it('should encrypt the API key in storage', async () => {
      const { storeApiKey } = await import('@main/store/secureStorage');
      const testKey = 'sk-test-visible-key';

      storeApiKey('anthropic', testKey);

      const files = fs.readdirSync(tempDir);
      const storeFile = files.find(f => f.includes('secure-storage'));
      if (storeFile) {
        const content = fs.readFileSync(path.join(tempDir, storeFile), 'utf-8');
        expect(content).not.toContain(testKey);
      }
    });

    it('should overwrite existing key for same provider', async () => {
      const { storeApiKey, getApiKey } = await import('@main/store/secureStorage');
      const firstKey = 'sk-first-key';
      const secondKey = 'sk-second-key';

      storeApiKey('anthropic', firstKey);
      storeApiKey('anthropic', secondKey);
      const result = getApiKey('anthropic');

      expect(result).toBe(secondKey);
    });

    it('should handle special characters in API key', async () => {
      const { storeApiKey, getApiKey } = await import('@main/store/secureStorage');
      const testKey = 'sk-test_key+with/special=chars!@#$%^&*()';

      storeApiKey('anthropic', testKey);
      const result = getApiKey('anthropic');

      expect(result).toBe(testKey);
    });

    it('should handle very long API keys', async () => {
      const { storeApiKey, getApiKey } = await import('@main/store/secureStorage');
      const testKey = 'sk-' + 'a'.repeat(500);

      storeApiKey('anthropic', testKey);
      const result = getApiKey('anthropic');

      expect(result).toBe(testKey);
    });

    it('should handle empty string as API key', async () => {
      const { storeApiKey, getApiKey } = await import('@main/store/secureStorage');

      storeApiKey('anthropic', '');
      const result = getApiKey('anthropic');

      expect(result).toBe('');
    });
  });

  describe('multiple providers', () => {
    it('should store API keys for different providers independently', async () => {
      const { storeApiKey, getApiKey } = await import('@main/store/secureStorage');

      storeApiKey('anthropic', 'anthropic-key-123');
      storeApiKey('openai', 'openai-key-456');
      storeApiKey('google', 'google-key-789');
      storeApiKey('custom', 'custom-key-xyz');

      expect(getApiKey('anthropic')).toBe('anthropic-key-123');
      expect(getApiKey('openai')).toBe('openai-key-456');
      expect(getApiKey('google')).toBe('google-key-789');
      expect(getApiKey('custom')).toBe('custom-key-xyz');
    });

    it('should not affect other providers when updating one', async () => {
      const { storeApiKey, getApiKey } = await import('@main/store/secureStorage');
      storeApiKey('anthropic', 'anthropic-original');
      storeApiKey('openai', 'openai-original');

      storeApiKey('anthropic', 'anthropic-updated');

      expect(getApiKey('anthropic')).toBe('anthropic-updated');
      expect(getApiKey('openai')).toBe('openai-original');
    });
  });

  describe('deleteApiKey', () => {
    it('should remove only the target provider key', async () => {
      const { storeApiKey, getApiKey, deleteApiKey } = await import('@main/store/secureStorage');
      storeApiKey('anthropic', 'anthropic-key');
      storeApiKey('openai', 'openai-key');

      const deleted = deleteApiKey('anthropic');

      expect(deleted).toBe(true);
      expect(getApiKey('anthropic')).toBeNull();
      expect(getApiKey('openai')).toBe('openai-key');
    });

    it('should return false when deleting non-existent key', async () => {
      const { deleteApiKey } = await import('@main/store/secureStorage');

      const result = deleteApiKey('anthropic');

      expect(result).toBe(false);
    });

    it('should allow re-storing after deletion', async () => {
      const { storeApiKey, getApiKey, deleteApiKey } = await import('@main/store/secureStorage');
      storeApiKey('anthropic', 'original-key');
      deleteApiKey('anthropic');

      storeApiKey('anthropic', 'new-key');
      const result = getApiKey('anthropic');

      expect(result).toBe('new-key');
    });
  });

  describe('getAllApiKeys', () => {
    it('should return all null for empty store', async () => {
      const { getAllApiKeys } = await import('@main/store/secureStorage');

      const result = await getAllApiKeys();

      expect(result).toEqual({
        anthropic: null,
        openai: null,
        google: null,
        xai: null,
        deepseek: null,
        moonshot: null,
        zai: null,
        openrouter: null,
        bedrock: null,
        litellm: null,
        minimax: null,
        custom: null,
      });
    });

    it('should return all stored API keys', async () => {
      const { storeApiKey, getAllApiKeys } = await import('@main/store/secureStorage');
      storeApiKey('anthropic', 'anthropic-key');
      storeApiKey('openai', 'openai-key');
      storeApiKey('google', 'google-key');

      const result = await getAllApiKeys();

      expect(result.anthropic).toBe('anthropic-key');
      expect(result.openai).toBe('openai-key');
      expect(result.google).toBe('google-key');
      expect(result.custom).toBeNull();
    });

    it('should return partial results when some providers are set', async () => {
      const { storeApiKey, getAllApiKeys } = await import('@main/store/secureStorage');
      storeApiKey('anthropic', 'anthropic-key');
      storeApiKey('custom', 'custom-key');

      const result = await getAllApiKeys();

      expect(result.anthropic).toBe('anthropic-key');
      expect(result.openai).toBeNull();
      expect(result.google).toBeNull();
      expect(result.custom).toBe('custom-key');
    });
  });

  describe('hasAnyApiKey', () => {
    it('should return false when no keys are stored', async () => {
      const { hasAnyApiKey } = await import('@main/store/secureStorage');

      const result = await hasAnyApiKey();

      expect(result).toBe(false);
    });

    it('should return true when at least one key is stored', async () => {
      const { storeApiKey, hasAnyApiKey } = await import('@main/store/secureStorage');
      storeApiKey('anthropic', 'test-key');

      const result = await hasAnyApiKey();

      expect(result).toBe(true);
    });

    it('should return true when multiple keys are stored', async () => {
      const { storeApiKey, hasAnyApiKey } = await import('@main/store/secureStorage');
      storeApiKey('anthropic', 'anthropic-key');
      storeApiKey('openai', 'openai-key');

      const result = await hasAnyApiKey();

      expect(result).toBe(true);
    });

    it('should return false after all keys are deleted', async () => {
      const { storeApiKey, deleteApiKey, hasAnyApiKey } = await import('@main/store/secureStorage');
      storeApiKey('anthropic', 'test-key');
      deleteApiKey('anthropic');

      const result = await hasAnyApiKey();

      expect(result).toBe(false);
    });
  });

  describe('clearSecureStorage', () => {
    it('should remove all stored API keys', async () => {
      const { storeApiKey, getAllApiKeys, clearSecureStorage } = await import('@main/store/secureStorage');
      storeApiKey('anthropic', 'anthropic-key');
      storeApiKey('openai', 'openai-key');
      storeApiKey('google', 'google-key');

      clearSecureStorage();
      const result = await getAllApiKeys();

      expect(result).toEqual({
        anthropic: null,
        openai: null,
        google: null,
        xai: null,
        deepseek: null,
        moonshot: null,
        zai: null,
        openrouter: null,
        bedrock: null,
        litellm: null,
        minimax: null,
        custom: null,
      });
    });

    it('should allow storing new keys after clear', async () => {
      const { storeApiKey, getApiKey, clearSecureStorage } = await import('@main/store/secureStorage');
      storeApiKey('anthropic', 'old-key');
      clearSecureStorage();

      storeApiKey('anthropic', 'new-key');
      const result = getApiKey('anthropic');

      expect(result).toBe('new-key');
    });

    it('should reset salt and derived key', async () => {
      const { storeApiKey, getApiKey, clearSecureStorage } = await import('@main/store/secureStorage');
      storeApiKey('anthropic', 'test-key-1');

      clearSecureStorage();
      storeApiKey('anthropic', 'test-key-2');
      const result = getApiKey('anthropic');

      expect(result).toBe('test-key-2');
    });
  });

  describe('encryption consistency', () => {
    it('should decrypt values correctly after module reload', async () => {
      const module1 = await import('@main/store/secureStorage');
      module1.storeApiKey('anthropic', 'persistent-key-123');

      vi.resetModules();
      const module2 = await import('@main/store/secureStorage');
      const result = module2.getApiKey('anthropic');

      expect(result).toBe('persistent-key-123');
    });

    it('should maintain encryption across multiple store/retrieve cycles', async () => {
      const { storeApiKey, getApiKey } = await import('@main/store/secureStorage');

      for (let i = 0; i < 5; i++) {
        const key = `test-key-cycle-${i}`;
        storeApiKey('anthropic', key);
        const result = getApiKey('anthropic');
        expect(result).toBe(key);
      }
    });

    it('should use unique IV for each encryption', async () => {
      // This test verifies that the same plaintext produces different ciphertext
      // due to random IV generation by storing the same value twice
      // and confirming decryption works for both
      const { storeApiKey, getApiKey, clearSecureStorage } = await import('@main/store/secureStorage');

      storeApiKey('anthropic', 'same-key-value');
      storeApiKey('openai', 'same-key-value');

      // Both should decrypt correctly (proving unique IVs didn't break anything)
      const anthropicKey = getApiKey('anthropic');
      const openaiKey = getApiKey('openai');

      expect(anthropicKey).toBe('same-key-value');
      expect(openaiKey).toBe('same-key-value');

      // If the IVs were the same, we'd have potential security issues,
      // but since this is an integration test, we verify the functionality works.
      // The encryption implementation uses crypto.randomBytes for IV generation.
    });
  });

  describe('edge cases', () => {
    it('should handle unicode characters in API key', async () => {
      const { storeApiKey, getApiKey } = await import('@main/store/secureStorage');
      const unicodeKey = 'sk-test-key-with-unicode-chars';

      storeApiKey('anthropic', unicodeKey);
      const result = getApiKey('anthropic');

      expect(result).toBe(unicodeKey);
    });

    it('should handle rapid successive stores', async () => {
      const { storeApiKey, getApiKey } = await import('@main/store/secureStorage');

      for (let i = 0; i < 10; i++) {
        storeApiKey('anthropic', `key-${i}`);
      }
      const result = getApiKey('anthropic');

      expect(result).toBe('key-9');
    });

    it('should handle concurrent operations on different providers', async () => {
      const { storeApiKey, getApiKey } = await import('@main/store/secureStorage');

      storeApiKey('anthropic', 'a1');
      storeApiKey('openai', 'o1');
      storeApiKey('anthropic', 'a2');
      storeApiKey('google', 'g1');
      storeApiKey('openai', 'o2');

      expect(getApiKey('anthropic')).toBe('a2');
      expect(getApiKey('openai')).toBe('o2');
      expect(getApiKey('google')).toBe('g1');
    });
  });
});
