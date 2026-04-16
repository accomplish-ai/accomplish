/**
 * Low-level SecureStorage helpers for connector OAuth entries.
 * Extracted from ConnectorAuthStore to keep the class file under 200 lines.
 */

import type { ConnectorAuthStoreConfig } from '@accomplish_ai/agent-core/common';
import { getStorage } from '../store/storage';
import type { StoredAuthEntry } from './connector-auth-types';

const STORE_KEY_PREFIX = 'connector-auth:';

export function readEntry(config: ConnectorAuthStoreConfig): StoredAuthEntry | undefined {
  const storage = getStorage();
  const raw = storage.get(`${STORE_KEY_PREFIX}${config.key}`);
  if (!raw) {
    return undefined;
  }
  try {
    return JSON.parse(raw) as StoredAuthEntry;
  } catch {
    return undefined;
  }
}

export function writeEntry(config: ConnectorAuthStoreConfig, entry: StoredAuthEntry): void {
  const storage = getStorage();
  storage.set(`${STORE_KEY_PREFIX}${config.key}`, JSON.stringify(entry));
}

export function deleteEntry(config: ConnectorAuthStoreConfig): void {
  const storage = getStorage();
  storage.set(`${STORE_KEY_PREFIX}${config.key}`, '');
}

export function resolveServerUrl(
  config: ConnectorAuthStoreConfig,
  existing: StoredAuthEntry,
): string | undefined {
  if (config.serverUrl) {
    return config.serverUrl;
  }
  if (config.storesServerUrl && existing.serverUrl) {
    return existing.serverUrl;
  }
  return undefined;
}
