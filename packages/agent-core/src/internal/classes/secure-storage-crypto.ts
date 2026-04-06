/**
 * SecureStorage crypto helpers
 *
 * AES-256-GCM encryption/decryption, PBKDF2 key derivation utilities,
 * and the canonical API key provider list for SecureStorage.
 * Extracted to keep the main class file under 200 lines.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { ApiKeyProvider } from '../../common/types/provider.js';

/**
 * Perform an atomic write: write to a temp file, then rename.
 * Prevents data loss if the process crashes mid-write.
 */
export function atomicWriteFile(filePath: string, content: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tempPath = `${filePath}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(tempPath, content, { mode: 0o600 });
    fs.renameSync(tempPath, filePath);
  } catch (error) {
    try {
      fs.unlinkSync(tempPath);
    } catch {
      // Ignore cleanup errors
    }
    throw error;
  }
}

/** The complete list of supported API key providers stored in SecureStorage. */
export const ALL_API_KEY_PROVIDERS: ApiKeyProvider[] = [
  'anthropic',
  'openai',
  'openrouter',
  'google',
  'xai',
  'deepseek',
  'moonshot',
  'zai',
  'azure-foundry',
  'custom',
  'bedrock',
  'litellm',
  'minimax',
  'lmstudio',
  'elevenlabs',
];

import * as crypto from 'crypto';
import * as os from 'os';

/**
 * Derive a 32-byte encryption key from machine identity + salt using PBKDF2.
 */
export function deriveMachineKey(appId: string, salt: Buffer): Buffer {
  const machineData = [os.platform(), os.homedir(), os.userInfo().username, appId].join(':');
  return crypto.pbkdf2Sync(machineData, salt, 100000, 32, 'sha256');
}

/**
 * Generate a random 32-byte salt for key derivation.
 */
export function generateSalt(): Buffer {
  return crypto.randomBytes(32);
}

/**
 * Encrypt a UTF-8 string value using AES-256-GCM.
 * Returns a colon-delimited string: base64(iv):base64(authTag):base64(ciphertext)
 */
export function encryptValue(value: string, key: Buffer): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  let encrypted = cipher.update(value, 'utf8', 'base64');
  encrypted += cipher.final('base64');

  const authTag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`;
}

/**
 * Decrypt a value previously encrypted by encryptValue.
 * Returns null if decryption fails (bad key, corrupt data, etc.).
 */
export function decryptValue(encryptedData: string, key: Buffer): string | null {
  try {
    const parts = encryptedData.split(':');
    if (parts.length !== 3) {
      return null;
    }

    const [ivBase64, authTagBase64, ciphertext] = parts;
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
