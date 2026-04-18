/**
 * LegacyImportService — ports the old desktop-side electron-store JSON
 * importer to the daemon, WITHOUT taking a runtime dep on `electron-store`.
 *
 * Milestone 2 of the daemon-only-SQLite migration
 * (plan: /Users/yanai/.claude/plans/squishy-exploring-hamster.md).
 *
 * Why not just `new Store({ name })` like the desktop helper?
 * - `electron-store` pulls Electron-adjacent deps (`conf`, `env-paths`,
 *   `atomically`) into the daemon bundle needlessly. Those aren't a
 *   correctness issue but they're noise.
 * - The daemon receives explicit `.json` paths from its caller (main, via
 *   RPC params or CLI args). We don't need the library's path resolution.
 * - Parsing the JSON file directly keeps the daemon free of any
 *   `electron-store` upgrade surface.
 *
 * On-disk format (per electron-store):
 *   - File at `<userData>/<storeName>.json` containing a plain JSON object.
 *   - Missing file means empty store — NOT an error.
 *   - Malformed JSON is a soft-failure: log and skip the category, don't
 *     abort the whole import.
 *
 * Guarded by `schema_meta.legacy_electron_store_import_complete`. Idempotent:
 * a second call is a no-op once the flag is set.
 */
import * as fs from 'node:fs';
import type { Database } from 'better-sqlite3';
import { log } from './logger.js';

const LEGACY_IMPORT_KEY = 'legacy_electron_store_import_complete';

export type LegacyImportPaths = {
  /** Full path to the legacy `app-settings{,-dev}.json` file. */
  appSettingsPath: string;
  /** Full path to the legacy `provider-settings{,-dev}.json` file. */
  providerSettingsPath: string;
  /** Full path to the legacy `task-history{,-dev}.json` file. */
  taskHistoryPath: string;
};

export type LegacyImportResult =
  | { imported: true; reason: 'completed' }
  | { imported: false; reason: 'already-imported' }
  | { imported: false; reason: 'existing-data' };

function readJsonOrEmpty(path: string): Record<string, unknown> {
  try {
    if (!fs.existsSync(path)) {
      return {};
    }
    const raw = fs.readFileSync(path, 'utf-8');
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      log.warn(`[LegacyImport] ${path}: top-level is not a JSON object, skipping`);
      return {};
    }
    return parsed as Record<string, unknown>;
  } catch (err) {
    log.warn(`[LegacyImport] Failed to read/parse ${path}: ${String(err)}`);
    return {};
  }
}

function wasAttempted(db: Database): boolean {
  try {
    const row = db.prepare('SELECT value FROM schema_meta WHERE key = ?').get(LEGACY_IMPORT_KEY) as
      | { value: string }
      | undefined;
    return row?.value === 'true';
  } catch {
    return false;
  }
}

function hasExistingUserData(db: Database): boolean {
  try {
    const settings = db
      .prepare('SELECT onboarding_complete FROM app_settings WHERE id = 1')
      .get() as { onboarding_complete: number } | undefined;
    if (settings?.onboarding_complete === 1) {
      return true;
    }
    const providerCount = db.prepare('SELECT COUNT(*) as count FROM providers').get() as
      | { count: number }
      | undefined;
    if (providerCount && providerCount.count > 0) {
      return true;
    }
    const taskCount = db.prepare('SELECT COUNT(*) as count FROM tasks').get() as
      | { count: number }
      | undefined;
    if (taskCount && taskCount.count > 0) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

function markComplete(db: Database): void {
  try {
    db.prepare('INSERT OR REPLACE INTO schema_meta (key, value) VALUES (?, ?)').run(
      LEGACY_IMPORT_KEY,
      'true',
    );
  } catch (err) {
    log.error(`[LegacyImport] Failed to mark import complete: ${String(err)}`);
  }
}

function importAppSettings(db: Database, appSettingsPath: string): void {
  const legacy = readJsonOrEmpty(appSettingsPath);
  if (Object.keys(legacy).length === 0) {
    log.info(`[LegacyImport] No app-settings to import (${appSettingsPath})`);
    return;
  }
  try {
    db.prepare(
      `UPDATE app_settings SET
        debug_mode = ?,
        onboarding_complete = ?,
        selected_model = ?,
        ollama_config = ?,
        litellm_config = ?
      WHERE id = 1`,
    ).run(
      legacy.debugMode ? 1 : 0,
      legacy.onboardingComplete ? 1 : 0,
      JSON.stringify(legacy.selectedModel ?? null),
      JSON.stringify(legacy.ollamaConfig ?? null),
      JSON.stringify(legacy.litellmConfig ?? null),
    );
    log.info('[LegacyImport] App settings imported');
  } catch (err) {
    log.error(`[LegacyImport] Failed to import app-settings: ${String(err)}`);
  }
}

function importProviderSettings(db: Database, providerSettingsPath: string): void {
  const legacy = readJsonOrEmpty(providerSettingsPath);
  if (Object.keys(legacy).length === 0) {
    log.info(`[LegacyImport] No provider-settings to import (${providerSettingsPath})`);
    return;
  }
  try {
    db.prepare(
      `UPDATE provider_meta SET
        active_provider_id = ?,
        debug_mode = ?
      WHERE id = 1`,
    ).run((legacy.activeProviderId as string | null) ?? null, legacy.debugMode ? 1 : 0);

    const connectedProviders = legacy.connectedProviders as
      | Record<string, Record<string, unknown>>
      | null
      | undefined;

    if (connectedProviders) {
      const insertProvider = db.prepare(
        `INSERT OR IGNORE INTO providers
          (provider_id, connection_status, selected_model_id, credentials_type, credentials_data, last_connected_at, available_models)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const [providerId, provider] of Object.entries(connectedProviders)) {
        if (!provider) {
          continue;
        }
        const credentials = provider.credentials as Record<string, unknown> | undefined;
        insertProvider.run(
          providerId,
          (provider.connectionStatus as string) || 'disconnected',
          (provider.selectedModelId as string) ?? null,
          (credentials?.type as string) || 'api_key',
          JSON.stringify(credentials ?? {}),
          (provider.lastConnectedAt as string) ?? null,
          JSON.stringify(provider.availableModels ?? null),
        );
      }
    }
    log.info('[LegacyImport] Provider settings imported');
  } catch (err) {
    log.error(`[LegacyImport] Failed to import provider-settings: ${String(err)}`);
  }
}

function importTaskHistory(db: Database, taskHistoryPath: string): void {
  const legacy = readJsonOrEmpty(taskHistoryPath);
  if (Object.keys(legacy).length === 0) {
    log.info(`[LegacyImport] No task-history to import (${taskHistoryPath})`);
    return;
  }
  const tasks = legacy.tasks as Array<Record<string, unknown>> | null | undefined;
  if (!tasks || tasks.length === 0) {
    log.info('[LegacyImport] No tasks to import');
    return;
  }
  try {
    const insertTask = db.prepare(
      `INSERT OR IGNORE INTO tasks
        (id, prompt, summary, status, session_id, created_at, started_at, completed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertMessage = db.prepare(
      `INSERT OR IGNORE INTO task_messages
        (id, task_id, type, content, tool_name, tool_input, timestamp, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertAttachment = db.prepare(
      `INSERT OR IGNORE INTO task_attachments
        (message_id, type, data, label)
      VALUES (?, ?, ?, ?)`,
    );

    let imported = 0;
    for (const task of tasks) {
      const result = insertTask.run(
        task.id as string,
        task.prompt as string,
        (task.summary as string) ?? null,
        task.status as string,
        (task.sessionId as string) ?? null,
        task.createdAt as string,
        (task.startedAt as string) ?? null,
        (task.completedAt as string) ?? null,
      );
      if (result.changes > 0) {
        imported++;
        const messages = task.messages as Array<Record<string, unknown>> | null | undefined;
        if (messages) {
          let sortOrder = 0;
          for (const msg of messages) {
            insertMessage.run(
              msg.id as string,
              task.id as string,
              msg.type as string,
              msg.content as string,
              (msg.toolName as string) ?? null,
              msg.toolInput ? JSON.stringify(msg.toolInput) : null,
              msg.timestamp as string,
              sortOrder++,
            );
            const attachments = msg.attachments as Array<Record<string, unknown>> | null;
            if (attachments) {
              for (const att of attachments) {
                insertAttachment.run(
                  msg.id as string,
                  att.type as string,
                  att.data as string,
                  (att.label as string) ?? null,
                );
              }
            }
          }
        }
      }
    }
    log.info(
      `[LegacyImport] Imported ${imported} new tasks (${tasks.length - imported} already existed)`,
    );
  } catch (err) {
    log.error(`[LegacyImport] Failed to import task-history: ${String(err)}`);
  }
}

export class LegacyImportService {
  constructor(private readonly db: Database) {}

  /**
   * Run the legacy electron-store import against the paths provided. Safe to
   * call repeatedly — subsequent calls are no-ops once `schema_meta` records
   * the completion flag, or when the main DB already has user data.
   */
  importElectronStoreIfNeeded(paths: LegacyImportPaths): LegacyImportResult {
    if (wasAttempted(this.db)) {
      log.info('[LegacyImport] Already completed; skipping');
      return { imported: false, reason: 'already-imported' };
    }
    if (hasExistingUserData(this.db)) {
      log.info('[LegacyImport] Main DB already has user data; marking complete without running');
      markComplete(this.db);
      return { imported: false, reason: 'existing-data' };
    }

    log.info('[LegacyImport] Starting legacy electron-store import');
    importAppSettings(this.db, paths.appSettingsPath);
    importProviderSettings(this.db, paths.providerSettingsPath);
    importTaskHistory(this.db, paths.taskHistoryPath);
    markComplete(this.db);
    log.info('[LegacyImport] Legacy import complete');

    return { imported: true, reason: 'completed' };
  }
}
