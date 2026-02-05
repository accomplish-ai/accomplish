import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { SecureStorage, createSecureStorage } from '../../../src/storage/secure-storage.js';

describe('SecureStorage', () => {
  let storage: SecureStorage;
  let testDir: string;

  beforeEach(() => {
    // Create a unique temporary directory for each test
    testDir = path.join(os.tmpdir(), `secure-storage-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    fs.mkdirSync(testDir, { recursive: true });

    storage = createSecureStorage({
      storagePath: testDir,
      appId: 'test.app.id',
    });
  });

  afterEach(() => {
    // Clean up test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('set and get', () => {
    it('should store and retrieve values', () => {
      storage.set('testKey', 'testValue');
      const retrieved = storage.get('testKey');
      expect(retrieved).toBe('testValue');
    });

    it('should return null for non-existent keys', () => {
      const result = storage.get('nonExistentKey');
      expect(result).toBeNull();
    });

    it('should handle special characters in values', () => {
      const specialValue = 'test!@#$%^&*()_+-=[]{}|;:,.<>?/~`value';
      storage.set('specialKey', specialValue);
      expect(storage.get('specialKey')).toBe(specialValue);
    });

    it('should handle unicode values', () => {
      const unicodeValue = 'Test value with unicode: \u4e2d\u6587, \ud83c\udf89, \u00e9\u00e8\u00ea';
      storage.set('unicodeKey', unicodeValue);
      expect(storage.get('unicodeKey')).toBe(unicodeValue);
    });
  });

  describe('delete', () => {
    it('should delete values', () => {
      storage.set('deleteMe', 'value');
      expect(storage.get('deleteMe')).toBe('value');

      const deleted = storage.delete('deleteMe');
      expect(deleted).toBe(true);
      expect(storage.get('deleteMe')).toBeNull();
    });

    it('should return false when deleting non-existent key', () => {
      const deleted = storage.delete('nonExistent');
      expect(deleted).toBe(false);
    });
  });

  describe('has', () => {
    it('should return true for existing keys', () => {
      storage.set('existsKey', 'value');
      expect(storage.has('existsKey')).toBe(true);
    });

    it('should return false for non-existent keys', () => {
      expect(storage.has('missingKey')).toBe(false);
    });
  });

  describe('persistence', () => {
    it('should persist data to file', () => {
      storage.set('persistKey', 'persistValue');

      // Create a new storage instance pointing to the same directory
      const newStorage = createSecureStorage({
        storagePath: testDir,
        appId: 'test.app.id',
      });

      expect(newStorage.get('persistKey')).toBe('persistValue');
    });

    it('should create storage file in the correct location', () => {
      storage.set('fileTest', 'value');
      const expectedPath = path.join(testDir, 'secure-storage.json');
      expect(fs.existsSync(expectedPath)).toBe(true);
    });
  });

  describe('encryption', () => {
    it('should encrypt data in file (not plain text)', () => {
      const sensitiveValue = 'my-secret-api-key-12345';
      storage.set('apiKey', sensitiveValue);

      // Read the raw file contents
      const filePath = path.join(testDir, 'secure-storage.json');
      const fileContents = fs.readFileSync(filePath, 'utf-8');

      // The plain text value should NOT appear in the file
      expect(fileContents).not.toContain(sensitiveValue);

      // The encrypted value should be stored in the values object
      const parsed = JSON.parse(fileContents);
      expect(parsed.values).toBeDefined();
      expect(parsed.values['apiKey']).toBeDefined();

      // Encrypted format should be: iv:authTag:ciphertext (base64)
      const encryptedValue = parsed.values['apiKey'];
      const parts = encryptedValue.split(':');
      expect(parts.length).toBe(3);
    });
  });

  describe('clearSecureStorage', () => {
    it('should clear all data', () => {
      storage.set('key1', 'value1');
      storage.set('key2', 'value2');
      storage.set('key3', 'value3');

      storage.clearSecureStorage();

      expect(storage.get('key1')).toBeNull();
      expect(storage.get('key2')).toBeNull();
      expect(storage.get('key3')).toBeNull();
    });
  });

  describe('API key methods', () => {
    it('should store and retrieve API keys', () => {
      const apiKey = 'sk-test-api-key-12345';
      storage.storeApiKey('anthropic', apiKey);
      expect(storage.getApiKey('anthropic')).toBe(apiKey);
    });

    it('should delete API keys', () => {
      storage.storeApiKey('openai', 'sk-openai-key');
      expect(storage.getApiKey('openai')).toBe('sk-openai-key');

      const deleted = storage.deleteApiKey('openai');
      expect(deleted).toBe(true);
      expect(storage.getApiKey('openai')).toBeNull();
    });

    it('should return null for non-existent provider', () => {
      expect(storage.getApiKey('nonexistent')).toBeNull();
    });

    it('should get all API keys', async () => {
      storage.storeApiKey('anthropic', 'key1');
      storage.storeApiKey('openai', 'key2');

      const allKeys = await storage.getAllApiKeys();
      expect(allKeys.anthropic).toBe('key1');
      expect(allKeys.openai).toBe('key2');
      expect(allKeys.google).toBeNull();
    });

    it('should check if any API key exists', async () => {
      expect(await storage.hasAnyApiKey()).toBe(false);

      storage.storeApiKey('xai', 'key');
      expect(await storage.hasAnyApiKey()).toBe(true);
    });
  });

  describe('Bedrock credentials', () => {
    it('should store and retrieve Bedrock credentials', () => {
      const credentials = JSON.stringify({
        accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
        secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
        region: 'us-east-1',
      });

      storage.storeBedrockCredentials(credentials);

      const retrieved = storage.getBedrockCredentials();
      expect(retrieved).not.toBeNull();
      expect(retrieved?.accessKeyId).toBe('AKIAIOSFODNN7EXAMPLE');
      expect(retrieved?.region).toBe('us-east-1');
    });

    it('should return null for invalid Bedrock credentials', () => {
      // Store invalid JSON
      storage.storeApiKey('bedrock', 'not-valid-json');
      expect(storage.getBedrockCredentials()).toBeNull();
    });
  });

  describe('listStoredCredentials', () => {
    it('should list all stored credentials', () => {
      storage.set('key1', 'value1');
      storage.set('key2', 'value2');

      const credentials = storage.listStoredCredentials();
      expect(credentials.length).toBe(2);
      expect(credentials.some((c) => c.account === 'key1' && c.password === 'value1')).toBe(true);
      expect(credentials.some((c) => c.account === 'key2' && c.password === 'value2')).toBe(true);
    });
  });

  describe('custom file name', () => {
    it('should use custom file name when provided', () => {
      const customStorage = createSecureStorage({
        storagePath: testDir,
        appId: 'test.app.id',
        fileName: 'custom-storage.json',
      });

      customStorage.set('customKey', 'customValue');

      const customPath = path.join(testDir, 'custom-storage.json');
      expect(fs.existsSync(customPath)).toBe(true);
    });
  });
});
