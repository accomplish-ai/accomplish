import { app, safeStorage } from 'electron';
import { createStorage, type StorageAPI } from '@accomplish_ai/agent-core';
import type { ApiKeyProvider } from '@accomplish_ai/agent-core';

export type { ApiKeyProvider };

let _storage: StorageAPI | null = null;

/**
 * Build an OS-keychain-backed key protector using Electron's safeStorage API.
 * Returns undefined when safeStorage is not available (e.g. missing keychain on Linux).
 */
function buildKeyProtector() {
  if (!safeStorage.isEncryptionAvailable()) {
    return undefined;
  }
  return {
    encrypt: (plaintext: string): string => safeStorage.encryptString(plaintext).toString('base64'),
    decrypt: (encrypted: string): string =>
      safeStorage.decryptString(Buffer.from(encrypted, 'base64')),
    isAvailable: (): boolean => safeStorage.isEncryptionAvailable(),
  };
}

function getStorage(): StorageAPI {
  if (!_storage) {
    _storage = createStorage({
      userDataPath: app.getPath('userData'),
      secureStorageFileName: app.isPackaged ? 'secure-storage.json' : 'secure-storage-dev.json',
      keyProtector: buildKeyProtector(),
    });
  }
  return _storage;
}

export function storeApiKey(provider: string, apiKey: string): void {
  getStorage().storeApiKey(provider, apiKey);
}

export function getApiKey(provider: string): string | null {
  return getStorage().getApiKey(provider);
}

export function deleteApiKey(provider: string): boolean {
  return getStorage().deleteApiKey(provider);
}

export async function getAllApiKeys(): Promise<Record<string, string | null>> {
  return getStorage().getAllApiKeys();
}

export function getBedrockCredentials(): Record<string, string> | null {
  return getStorage().getBedrockCredentials();
}

export async function hasAnyApiKey(): Promise<boolean> {
  return getStorage().hasAnyApiKey();
}

export function clearSecureStorage(): void {
  getStorage().clearSecureStorage();
}
