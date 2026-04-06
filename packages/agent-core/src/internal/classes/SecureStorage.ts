import * as fs from 'fs';
import * as path from 'path';
import type { ApiKeyProvider } from '../../common/types/provider.js';
import {
  deriveMachineKey,
  generateSalt,
  encryptValue,
  decryptValue,
  ALL_API_KEY_PROVIDERS,
  atomicWriteFile,
} from './secure-storage-crypto.js';

/**
 * AES-256-GCM encryption using machine-derived keys. Less secure than OS Keychain
 * (key derivation is reversible) but avoids permission prompts on macOS.
 * Suitable for API keys that can be rotated if compromised.
 */
export interface SecureStorageOptions {
  storagePath: string;
  appId: string;
  fileName?: string;
}

interface SecureStorageSchema {
  values: Record<string, string>;
  salt?: string;
}

export type { ApiKeyProvider };

export class SecureStorage {
  private appId: string;
  private filePath: string;
  private derivedKey: Buffer | null = null;
  private data: SecureStorageSchema | null = null;

  constructor(options: SecureStorageOptions) {
    this.appId = options.appId;
    this.filePath = path.join(options.storagePath, options.fileName || 'secure-storage.json');
  }

  private loadData(): SecureStorageSchema {
    if (this.data) {
      return this.data;
    }

    try {
      if (fs.existsSync(this.filePath)) {
        const content = fs.readFileSync(this.filePath, 'utf-8');
        this.data = JSON.parse(content) as SecureStorageSchema;
      } else {
        this.data = { values: {} };
      }
    } catch {
      this.data = { values: {} };
    }

    return this.data;
  }

  private saveData(): void {
    if (!this.data) return;
    atomicWriteFile(this.filePath, JSON.stringify(this.data, null, 2));
  }

  private getSalt(): Buffer {
    const data = this.loadData();

    if (!data.salt) {
      const salt = generateSalt();
      data.salt = salt.toString('base64');
      this.saveData();
    }

    return Buffer.from(data.salt, 'base64');
  }

  private getDerivedKey(): Buffer {
    if (this.derivedKey) {
      return this.derivedKey;
    }

    const salt = this.getSalt();
    this.derivedKey = deriveMachineKey(this.appId, salt);
    return this.derivedKey;
  }

  private encryptValue(value: string): string {
    return encryptValue(value, this.getDerivedKey());
  }

  private decryptValue(encryptedData: string): string | null {
    return decryptValue(encryptedData, this.getDerivedKey());
  }

  storeApiKey(provider: string, apiKey: string): void {
    const data = this.loadData();
    const encrypted = this.encryptValue(apiKey);
    data.values[`apiKey:${provider}`] = encrypted;
    this.saveData();
  }

  getApiKey(provider: string): string | null {
    const data = this.loadData();
    const encrypted = data.values[`apiKey:${provider}`];
    if (!encrypted) {
      return null;
    }
    return this.decryptValue(encrypted);
  }

  deleteApiKey(provider: string): boolean {
    const data = this.loadData();
    const key = `apiKey:${provider}`;
    if (!(key in data.values)) {
      return false;
    }
    delete data.values[key];
    this.saveData();
    return true;
  }

  async getAllApiKeys(): Promise<Record<ApiKeyProvider, string | null>> {
    const result: Record<string, string | null> = {};
    for (const provider of ALL_API_KEY_PROVIDERS) {
      result[provider] = this.getApiKey(provider);
    }
    return result as Record<ApiKeyProvider, string | null>;
  }

  storeBedrockCredentials(credentials: string): void {
    this.storeApiKey('bedrock', credentials);
  }

  getBedrockCredentials(): Record<string, string> | null {
    const stored = this.getApiKey('bedrock');
    if (!stored) {
      return null;
    }
    try {
      return JSON.parse(stored);
    } catch {
      return null;
    }
  }

  async hasAnyApiKey(): Promise<boolean> {
    const keys = await this.getAllApiKeys();
    return Object.values(keys).some((k) => k !== null);
  }

  listStoredCredentials(): Array<{ account: string; password: string }> {
    const data = this.loadData();
    const credentials: Array<{ account: string; password: string }> = [];
    for (const key of Object.keys(data.values)) {
      const decrypted = this.decryptValue(data.values[key]);
      if (decrypted) {
        credentials.push({ account: key, password: decrypted });
      }
    }
    return credentials;
  }

  clearSecureStorage(): void {
    this.data = { values: {} };
    this.derivedKey = null;
    this.saveData();
  }

  set(key: string, value: string): void {
    const data = this.loadData();
    data.values[key] = this.encryptValue(value);
    this.saveData();
  }

  get(key: string): string | null {
    const data = this.loadData();
    const encrypted = data.values[key];
    if (!encrypted) {
      return null;
    }
    return this.decryptValue(encrypted);
  }

  delete(key: string): boolean {
    const data = this.loadData();
    if (!(key in data.values)) {
      return false;
    }
    delete data.values[key];
    this.saveData();
    return true;
  }

  has(key: string): boolean {
    const data = this.loadData();
    return key in data.values;
  }
}

export function createSecureStorage(options: SecureStorageOptions): SecureStorage {
  return new SecureStorage(options);
}
