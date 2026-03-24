import type { Database } from 'better-sqlite3';
import Store from 'electron-store';
import { app } from 'electron';

const LEGACY_IMPORT_KEY = 'legacy_electron_store_import_complete';

function getStoreName(baseName: string): string {
  return app.isPackaged ? baseName : `${baseName}-dev`;
}

function wasLegacyImportAttempted(db: Database): boolean {
  try {
    const result = db
      .prepare('SELECT value FROM schema_meta WHERE key = ?')
      .get(LEGACY_IMPORT_KEY) as { value: string } | undefined;
    return result?.value === 'true';
  } catch {
    return false;
  }
}

function hasExistingUserData(db: Database): boolean {
  try {
    const appSettings = db
      .prepare('SELECT onboarding_complete FROM app_settings WHERE id = 1')
      .get() as { onboarding_complete: number } | undefined;
    if (appSettings?.onboarding_complete === 1) {
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

function markLegacyImportComplete(db: Database): void {
  try {
    db.prepare('INSERT OR REPLACE INTO schema_meta (key, value) VALUES (?, ?)').run(
      LEGACY_IMPORT_KEY,
      'true',
    );
  } catch (err) {
    console.error('[LegacyImport] Failed to mark import complete:', err);
  }
}

function importAppSettings(db: Database): void {
  try {
    const legacy = new Store<Record<string, unknown>>({
      name: getStoreName('app-settings'),
    });

    if (legacy.size === 0) {
      console.log('[LegacyImport] No legacy app-settings to import');
      return;
    }

    console.log('[LegacyImport] Importing app-settings...');

    db.prepare(
      `UPDATE app_settings SET
        debug_mode = ?,
        onboarding_complete = ?,
        selected_model = ?,
        ollama_config = ?,
        litellm_config = ?
      WHERE id = 1`,
    ).run(
      legacy.get('debugMode') ? 1 : 0,
      legacy.get('onboardingComplete') ? 1 : 0,
      JSON.stringify(legacy.get('selectedModel') ?? null),
      JSON.stringify(legacy.get('ollamaConfig') ?? null),
      JSON.stringify(legacy.get('litellmConfig') ?? null),
    );

    console.log('[LegacyImport] App settings imported');
  } catch (err) {
    console.error('[LegacyImport] Failed to import app-settings:', err);
  }
}

function importProviderSettings(db: Database): void {
  try {
    const legacy = new Store<Record<string, unknown>>({
      name: getStoreName('provider-settings'),
    });

    if (legacy.size === 0) {
      console.log('[LegacyImport] No legacy provider-settings to import');
      return;
    }

    console.log('[LegacyImport] Importing provider-settings...');

    db.prepare(
      `UPDATE provider_meta SET
        active_provider_id = ?,
        debug_mode = ?
      WHERE id = 1`,
    ).run(legacy.get('activeProviderId') as string | null, legacy.get('debugMode') ? 1 : 0);

    const connectedProviders = legacy.get('connectedProviders') as Record<
      string,
      Record<string, unknown>
    > | null;

    if (connectedProviders) {
      const insertProvider = db.prepare(
        `INSERT OR IGNORE INTO providers
          (provider_id, connection_status, selected_model_id, credentials_type, credentials_data, last_connected_at, available_models)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
      );

      for (const [providerId, provider] of Object.entries(connectedProviders)) {
        if (!provider) continue;

        const credentials = provider.credentials as Record<string, unknown> | undefined;
        insertProvider.run(
          providerId,
          (provider.connectionStatus as string) || 'disconnected',
          provider.selectedModelId as string | null,
          (credentials?.type as string) || 'api_key',
          JSON.stringify(credentials ?? {}),
          provider.lastConnectedAt as string | null,
          JSON.stringify(provider.availableModels ?? null),
        );
      }
    }

    console.log('[LegacyImport] Provider settings imported');
  } catch (err) {
    console.error('[LegacyImport] Failed to import provider-settings:', err);
  }
}

function importTaskHistory(db: Database): void {
  try {
    const legacy = new Store<Record<string, unknown>>({
      name: getStoreName('task-history'),
    });

    if (legacy.size === 0) {
      console.log('[LegacyImport] No legacy task-history to import');
      return;
    }

    console.log('[LegacyImport] Importing task-history...');

    const tasks = legacy.get('tasks') as Array<Record<string, unknown>> | null;
    if (!tasks || tasks.length === 0) {
      console.log('[LegacyImport] No tasks to import');
      return;
    }

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

    let importedCount = 0;
    for (const task of tasks) {
      const result = insertTask.run(
        task.id as string,
        task.prompt as string,
        task.summary as string | null,
        task.status as string,
        task.sessionId as string | null,
        task.createdAt as string,
        task.startedAt as string | null,
        task.completedAt as string | null,
      );

      if (result.changes > 0) {
        importedCount++;
        const messages = task.messages as Array<Record<string, unknown>> | null;
        if (messages) {
          let sortOrder = 0;
          for (const msg of messages) {
            insertMessage.run(
              msg.id as string,
              task.id as string,
              msg.type as string,
              msg.content as string,
              msg.toolName as string | null,
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
                  att.label as string | null,
                );
              }
            }
          }
        }
      }
    }

    console.log(
      `[LegacyImport] Imported ${importedCount} new tasks (${tasks.length - importedCount} already existed)`,
    );
  } catch (err) {
    console.error('[LegacyImport] Failed to import task-history:', err);
  }
}

export function importLegacyElectronStoreData(db: Database): void {
  if (wasLegacyImportAttempted(db)) {
    console.log('[LegacyImport] Legacy import already completed, skipping');
    return;
  }

  if (hasExistingUserData(db)) {
    console.log(
      '[LegacyImport] Database has existing user data - marking import complete without running',
    );
    markLegacyImportComplete(db);
    return;
  }

  console.log('[LegacyImport] Checking for legacy electron-store data...');

  importAppSettings(db);
  importProviderSettings(db);
  importTaskHistory(db);

  markLegacyImportComplete(db);

  console.log('[LegacyImport] Legacy import complete');
}
