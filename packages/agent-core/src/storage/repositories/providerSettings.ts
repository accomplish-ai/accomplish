import type {
  ProviderSettings,
  ProviderId,
  ConnectedProvider,
  ProviderCredentials,
} from '../../common/types/providerSettings.js';
import { getDatabase } from '../database.js';
import { safeParseJsonWithFallback } from '../../utils/json.js';
import { encryptValue, decryptValue } from '../../internal/classes/secure-storage-crypto.js';

/**
 * Lazy getter for the credential encryption key. Defers PBKDF2 derivation
 * (100k iterations) until the first provider read/write, avoiding startup cost
 * when no provider operations are performed.
 */
let _credentialKeyGetter: (() => Buffer) | null = null;
let _credentialKey: Buffer | null = null;

/**
 * Register a lazy key supplier for credential encryption in SQLite.
 * The supplier is invoked once on first use; the result is cached.
 */
export function setCredentialEncryptionKey(keyGetter: () => Buffer): void {
  _credentialKeyGetter = keyGetter;
  _credentialKey = null; // reset cache so next access uses the new getter
}

/** Clear the cached credential encryption key (zeroes the buffer). */
export function clearCredentialEncryptionKey(): void {
  if (_credentialKey) {
    _credentialKey.fill(0);
    _credentialKey = null;
  }
  _credentialKeyGetter = null;
}

function getCredentialKey(): Buffer | null {
  if (_credentialKey) {
    return _credentialKey;
  }
  if (_credentialKeyGetter) {
    _credentialKey = _credentialKeyGetter();
  }
  return _credentialKey;
}

/** Encrypt a JSON string for storage. Falls back to plaintext if no key is available. */
function encryptCredentials(json: string): string {
  const key = getCredentialKey();
  if (!key) {
    return json;
  }
  return encryptValue(json, key);
}

/** Decrypt a stored credentials value. Handles both encrypted and legacy plaintext. */
function decryptCredentials(stored: string): string {
  const key = getCredentialKey();
  if (!key) {
    return stored;
  }
  const decrypted = decryptValue(stored, key);
  if (decrypted !== null) {
    return decrypted;
  }
  // Fall back to plaintext for pre-migration data
  return stored;
}

interface ProviderMetaRow {
  id: number;
  active_provider_id: string | null;
  debug_mode: number;
}

interface ProviderRow {
  provider_id: string;
  connection_status: string;
  selected_model_id: string | null;
  credentials_type: string;
  credentials_data: string | null;
  last_connected_at: string | null;
  available_models: string | null;
  custom_base_url?: string;
}

function getMetaRow(): ProviderMetaRow {
  const db = getDatabase();
  return db.prepare('SELECT * FROM provider_meta WHERE id = 1').get() as ProviderMetaRow;
}

function rowToProvider(row: ProviderRow): ConnectedProvider {
  const rawData = row.credentials_data ? decryptCredentials(row.credentials_data) : null;
  const credentials = safeParseJsonWithFallback<ProviderCredentials>(rawData, {
    type: 'api_key',
    keyPrefix: '',
  })!;

  return {
    providerId: row.provider_id as ProviderId,
    connectionStatus: row.connection_status as ConnectedProvider['connectionStatus'],
    selectedModelId: row.selected_model_id,
    credentials,
    lastConnectedAt: row.last_connected_at || new Date().toISOString(),
    availableModels:
      safeParseJsonWithFallback<Array<{ id: string; name: string }>>(row.available_models) ??
      undefined,
    customBaseUrl: row.custom_base_url || undefined,
  };
}

export function getProviderSettings(): ProviderSettings {
  const db = getDatabase();
  const meta = getMetaRow();

  const rows = db.prepare('SELECT * FROM providers').all() as ProviderRow[];
  const connectedProviders: Partial<Record<ProviderId, ConnectedProvider>> = {};

  for (const row of rows) {
    connectedProviders[row.provider_id as ProviderId] = rowToProvider(row);
  }

  return {
    activeProviderId: meta.active_provider_id as ProviderId | null,
    connectedProviders,
    debugMode: meta.debug_mode === 1,
  };
}

export function setActiveProvider(providerId: ProviderId | null): void {
  const db = getDatabase();
  db.prepare('UPDATE provider_meta SET active_provider_id = ? WHERE id = 1').run(providerId);
}

export function getActiveProviderId(): ProviderId | null {
  return getMetaRow().active_provider_id as ProviderId | null;
}

export function getConnectedProvider(providerId: ProviderId): ConnectedProvider | null {
  const db = getDatabase();
  const row = db.prepare('SELECT * FROM providers WHERE provider_id = ?').get(providerId) as
    | ProviderRow
    | undefined;

  return row ? rowToProvider(row) : null;
}

export function setConnectedProvider(providerId: ProviderId, provider: ConnectedProvider): void {
  const db = getDatabase();
  db.prepare(
    `INSERT OR REPLACE INTO providers
      (provider_id, connection_status, selected_model_id, credentials_type, credentials_data, last_connected_at, available_models, custom_base_url)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    providerId,
    provider.connectionStatus,
    provider.selectedModelId,
    provider.credentials.type,
    encryptCredentials(JSON.stringify(provider.credentials)),
    provider.lastConnectedAt,
    provider.availableModels ? JSON.stringify(provider.availableModels) : null,
    provider.customBaseUrl ?? null,
  );
}

export function removeConnectedProvider(providerId: ProviderId): void {
  const db = getDatabase();

  db.transaction(() => {
    db.prepare('DELETE FROM providers WHERE provider_id = ?').run(providerId);

    const meta = getMetaRow();
    if (meta.active_provider_id === providerId) {
      db.prepare('UPDATE provider_meta SET active_provider_id = NULL WHERE id = 1').run();
    }
  })();
}

export function updateProviderModel(providerId: ProviderId, modelId: string | null): void {
  const db = getDatabase();
  db.prepare('UPDATE providers SET selected_model_id = ? WHERE provider_id = ?').run(
    modelId,
    providerId,
  );
}

export function setProviderDebugMode(enabled: boolean): void {
  const db = getDatabase();
  db.prepare('UPDATE provider_meta SET debug_mode = ? WHERE id = 1').run(enabled ? 1 : 0);
}

export function getProviderDebugMode(): boolean {
  return getMetaRow().debug_mode === 1;
}

export function clearProviderSettings(): void {
  const db = getDatabase();
  db.transaction(() => {
    db.prepare('DELETE FROM providers').run();
    db.prepare(
      'UPDATE provider_meta SET active_provider_id = NULL, debug_mode = 0 WHERE id = 1',
    ).run();
  })();
}

export function getActiveProviderModel(): {
  provider: ProviderId;
  model: string;
  baseUrl?: string;
} | null {
  const activeId = getActiveProviderId();
  if (!activeId) return null;

  const provider = getConnectedProvider(activeId);
  if (!provider || !provider.selectedModelId) return null;

  const result: { provider: ProviderId; model: string; baseUrl?: string } = {
    provider: activeId,
    model: provider.selectedModelId,
  };

  if (provider.credentials.type === 'ollama') {
    result.baseUrl = provider.credentials.serverUrl;
  } else if (provider.credentials.type === 'litellm') {
    result.baseUrl = provider.credentials.serverUrl;
  }

  return result;
}

export function hasReadyProvider(): boolean {
  const db = getDatabase();
  const row = db
    .prepare(
      `SELECT COUNT(*) as count FROM providers
       WHERE connection_status = 'connected' AND selected_model_id IS NOT NULL`,
    )
    .get() as { count: number };

  return row.count > 0;
}

export function getConnectedProviderIds(): ProviderId[] {
  const db = getDatabase();
  const rows = db
    .prepare("SELECT provider_id FROM providers WHERE connection_status = 'connected'")
    .all() as Array<{ provider_id: string }>;

  return rows.map((r) => r.provider_id as ProviderId);
}
