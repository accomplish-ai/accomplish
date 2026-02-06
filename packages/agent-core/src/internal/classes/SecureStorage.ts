import * as crypto from 'crypto';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import type { ApiKeyProvider } from '../../common/types/provider.js';

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
  private storagePath: string;
  private appId: string;
  private filePath: string;
  private derivedKey: Buffer | null = null;
  private data: SecureStorageSchema | null = null;

  constructor(options: SecureStorageOptions) {
    this.storagePath = options.storagePath;
    this.appId = options.appId;
    this.filePath = path.join(
      this.storagePath,
      options.fileName || 'secure-storage.json'
    );
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

    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Atomic write: write to temp file, then rename
    // This prevents data loss if the process crashes mid-write
    const tempPath = `${this.filePath}.${process.pid}.tmp`;
    const content = JSON.stringify(this.data, null, 2);

    try {
      fs.writeFileSync(tempPath, content, { mode: 0o600 });
      fs.renameSync(tempPath, this.filePath);
    } catch (error) {
      // Clean up temp file if rename fails
      try {
        fs.unlinkSync(tempPath);
      } catch {
        // Ignore cleanup errors
      }
      throw error;
    }
  }

  private getSalt(): Buffer {
    const data = this.loadData();

    if (!data.salt) {
      const salt = crypto.randomBytes(32);
      data.salt = salt.toString('base64');
      this.saveData();
    }

    return Buffer.from(data.salt, 'base64');
  }

  private getDerivedKey(): Buffer {
    if (this.derivedKey) {
      return this.derivedKey;
    }

    const machineData = [
      os.platform(),
      os.homedir(),
      os.userInfo().username,
      this.appId,
    ].join(':');

    const salt = this.getSalt();

    this.derivedKey = crypto.pbkdf2Sync(
      machineData,
      salt,
      100000,
      32,
      'sha256'
    );

    return this.derivedKey;
  }

  private encryptValue(value: string): string {
    const key = this.getDerivedKey();
    const iv = crypto.randomBytes(12);

    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

    let encrypted = cipher.update(value, 'utf8', 'base64');
    encrypted += cipher.final('base64');

    const authTag = cipher.getAuthTag();

    return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`;
  }

  private decryptValue(encryptedData: string): string | null {
    try {
      const parts = encryptedData.split(':');
      if (parts.length !== 3) {
        return null;
      }

      const [ivBase64, authTagBase64, ciphertext] = parts;
      const key = this.getDerivedKey();
      const iv = Buffer.from(ivBase64, 'base64');
      const authTag = Buffer.from(authTagBase64, 'base64');

      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(ciphertext, 'base64', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch {
      return null;
    }
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
    const providers: ApiKeyProvider[] = [
      'anthropic',
      'openai',
      'openrouter',
      'google',
      'xai',
      'deepseek',
      'moonshot',
      'zai',
      'custom',
      'bedrock',
      'litellm',
      'minimax',
    ];

    const result: Record<string, string | null> = {};
    for (const provider of providers) {
      result[provider] = this.getApiKey(provider);
    }

    return result as Record<ApiKeyProvider, string | null>;
  }

  storeBedrockCredentials(credentials: string): void {
    this.storeApiKey('bedrock', credentials);
  }

  getBedrockCredentials(): Record<string, string> | null {
    const stored = this.getApiKey('bedrock');
    if (!stored) return null;
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
        credentials.push({
          account: key,
          password: decrypted,
        });
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
