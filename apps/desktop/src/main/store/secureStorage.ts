import { app } from 'electron';
import { createStorage, type StorageAPI } from '@accomplish/agent-core';
import type { ApiKeyProvider } from '@accomplish/agent-core';

export type { ApiKeyProvider };

let _storage: StorageAPI | null = null;

function getStorage(): StorageAPI {
  if (!_storage) {
    _storage = createStorage({
      userDataPath: app.getPath('userData'),
      secureStorageFileName: app.isPackaged ? 'secure-storage.json' : 'secure-storage-dev.json',
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

export async function getAllApiKeys(): Promise<Record<ApiKeyProvider, string | null>> {
  return getStorage().getAllApiKeys();
}

export function storeBedrockCredentials(credentials: string): void {
  getStorage().storeBedrockCredentials(credentials);
}

export function getBedrockCredentials(): Record<string, string> | null {
  return getStorage().getBedrockCredentials();
}

export async function hasAnyApiKey(): Promise<boolean> {
  return getStorage().hasAnyApiKey();
}

export function clearSecureStorage(): void {
  getStorage().clearSecureStorage();
  _storage = null;
}
