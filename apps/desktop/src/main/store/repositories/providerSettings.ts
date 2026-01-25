// apps/desktop/src/main/store/repositories/providerSettings.ts

import type {
  ProviderSettings,
  ProviderId,
  ConnectedProvider,
  ProviderCredentials,
} from '@accomplish/shared';
import { getDatabase } from '../db';

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
}

function getMetaRow(): ProviderMetaRow {
  const db = getDatabase();
  return db.prepare('SELECT * FROM provider_meta WHERE id = 1').get() as ProviderMetaRow;
}

function safeParseJson<T>(json: string | null, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

function rowToProvider(row: ProviderRow): ConnectedProvider {
  const credentials = safeParseJson<ProviderCredentials>(
    row.credentials_data,
    { type: 'api_key', keyPrefix: '' }
  );

  return {
    providerId: row.provider_id as ProviderId,
    connectionStatus: row.connection_status as ConnectedProvider['connectionStatus'],
    selectedModelId: row.selected_model_id,
    credentials,
    lastConnectedAt: row.last_connected_at || new Date().toISOString(),
    availableModels: safeParseJson<Array<{ id: string; name: string }>>(
      row.available_models,
      undefined as unknown as Array<{ id: string; name: string }>
    ) || undefined,
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
  const row = db
    .prepare('SELECT * FROM providers WHERE provider_id = ?')
    .get(providerId) as ProviderRow | undefined;

  return row ? rowToProvider(row) : null;
}

export function setConnectedProvider(
  providerId: ProviderId,
  provider: ConnectedProvider
): void {
  const db = getDatabase();
  db.prepare(
    `INSERT OR REPLACE INTO providers
      (provider_id, connection_status, selected_model_id, credentials_type, credentials_data, last_connected_at, available_models)
    VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    providerId,
    provider.connectionStatus,
    provider.selectedModelId,
    provider.credentials.type,
    JSON.stringify(provider.credentials),
    provider.lastConnectedAt,
    provider.availableModels ? JSON.stringify(provider.availableModels) : null
  );
}

export function removeConnectedProvider(providerId: ProviderId): void {
  const db = getDatabase();

  db.transaction(() => {
    db.prepare('DELETE FROM providers WHERE provider_id = ?').run(providerId);

    // If this was the active provider, clear it
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
    providerId
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
      'UPDATE provider_meta SET active_provider_id = NULL, debug_mode = 0 WHERE id = 1'
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
       WHERE connection_status = 'connected' AND selected_model_id IS NOT NULL`
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
