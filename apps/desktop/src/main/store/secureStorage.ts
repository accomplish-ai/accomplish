import { app } from 'electron';
import { SecureStorage, createSecureStorage } from '@accomplish/agent-core';
import type { ApiKeyProvider } from '@accomplish/agent-core';

export type { ApiKeyProvider };

const getFileName = () => (app.isPackaged ? 'secure-storage.json' : 'secure-storage-dev.json');

let _storage: SecureStorage | null = null;

function getStorage(): SecureStorage {
  if (!_storage) {
    _storage = createSecureStorage({
      storagePath: app.getPath('userData'),
      appId: 'ai.accomplish.desktop',
      fileName: getFileName(),
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

export function listStoredCredentials(): Array<{ account: string; password: string }> {
  return getStorage().listStoredCredentials();
}

export function clearSecureStorage(): void {
  getStorage().clearSecureStorage();
  _storage = null;
}
