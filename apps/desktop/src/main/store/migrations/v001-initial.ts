// apps/desktop/src/main/store/migrations/v001-initial.ts

import type { Database } from 'better-sqlite3';
import Store from 'electron-store';
import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import type { Migration } from './index';

/**
 * Get store name based on environment (dev vs packaged).
 */
function getStoreName(baseName: string): string {
  return app.isPackaged ? baseName : `${baseName}-dev`;
}

/**
 * Import app settings from legacy electron-store.
 */
function importAppSettings(db: Database): void {
  try {
    const legacy = new Store<Record<string, unknown>>({
      name: getStoreName('app-settings'),
    });

    if (legacy.size === 0) {
      console.log('[v001] No legacy app-settings to import');
      return;
    }

    console.log('[v001] Importing app-settings...');

    db.prepare(
      `UPDATE app_settings SET
        debug_mode = ?,
        onboarding_complete = ?,
        selected_model = ?,
        ollama_config = ?,
        litellm_config = ?
      WHERE id = 1`
    ).run(
      legacy.get('debugMode') ? 1 : 0,
      legacy.get('onboardingComplete') ? 1 : 0,
      JSON.stringify(legacy.get('selectedModel') ?? null),
      JSON.stringify(legacy.get('ollamaConfig') ?? null),
      JSON.stringify(legacy.get('litellmConfig') ?? null)
    );

    console.log('[v001] App settings imported');
  } catch (err) {
    console.error('[v001] Failed to import app-settings:', err);
  }
}

/**
 * Import provider settings from legacy electron-store.
 */
function importProviderSettings(db: Database): void {
  try {
    const legacy = new Store<Record<string, unknown>>({
      name: getStoreName('provider-settings'),
    });

    if (legacy.size === 0) {
      console.log('[v001] No legacy provider-settings to import');
      return;
    }

    console.log('[v001] Importing provider-settings...');

    // Import provider_meta
    db.prepare(
      `UPDATE provider_meta SET
        active_provider_id = ?,
        debug_mode = ?
      WHERE id = 1`
    ).run(
      legacy.get('activeProviderId') as string | null,
      legacy.get('debugMode') ? 1 : 0
    );

    // Import connected providers
    const connectedProviders = legacy.get('connectedProviders') as Record<
      string,
      Record<string, unknown>
    > | null;

    if (connectedProviders) {
      const insertProvider = db.prepare(
        `INSERT OR REPLACE INTO providers
          (provider_id, connection_status, selected_model_id, credentials_type, credentials_data, last_connected_at, available_models)
        VALUES (?, ?, ?, ?, ?, ?, ?)`
      );

      for (const [providerId, provider] of Object.entries(connectedProviders)) {
        if (!provider) continue;

        const credentials = provider.credentials as Record<string, unknown> | undefined;
        insertProvider.run(
          providerId,
          provider.connectionStatus as string || 'disconnected',
          provider.selectedModelId as string | null,
          credentials?.type as string || 'api_key',
          JSON.stringify(credentials ?? {}),
          provider.lastConnectedAt as string | null,
          JSON.stringify(provider.availableModels ?? null)
        );
      }
    }

    console.log('[v001] Provider settings imported');
  } catch (err) {
    console.error('[v001] Failed to import provider-settings:', err);
  }
}

/**
 * Import task history from legacy electron-store.
 */
function importTaskHistory(db: Database): void {
  try {
    const legacy = new Store<Record<string, unknown>>({
      name: getStoreName('task-history'),
    });

    if (legacy.size === 0) {
      console.log('[v001] No legacy task-history to import');
      return;
    }

    console.log('[v001] Importing task-history...');

    const tasks = legacy.get('tasks') as Array<Record<string, unknown>> | null;
    if (!tasks || tasks.length === 0) {
      console.log('[v001] No tasks to import');
      return;
    }

    const insertTask = db.prepare(
      `INSERT OR REPLACE INTO tasks
        (id, prompt, summary, status, session_id, created_at, started_at, completed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );

    const insertMessage = db.prepare(
      `INSERT INTO task_messages
        (id, task_id, type, content, tool_name, tool_input, timestamp, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );

    const insertAttachment = db.prepare(
      `INSERT INTO task_attachments
        (message_id, type, data, label)
      VALUES (?, ?, ?, ?)`
    );

    for (const task of tasks) {
      insertTask.run(
        task.id as string,
        task.prompt as string,
        task.summary as string | null,
        task.status as string,
        task.sessionId as string | null,
        task.createdAt as string,
        task.startedAt as string | null,
        task.completedAt as string | null
      );

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
            sortOrder++
          );

          const attachments = msg.attachments as Array<Record<string, unknown>> | null;
          if (attachments) {
            for (const att of attachments) {
              insertAttachment.run(
                msg.id as string,
                att.type as string,
                att.data as string,
                att.label as string | null
              );
            }
          }
        }
      }
    }

    console.log(`[v001] Imported ${tasks.length} tasks`);
  } catch (err) {
    console.error('[v001] Failed to import task-history:', err);
  }
}

/**
 * Rename legacy JSON store files after successful import.
 */
function cleanupLegacyStores(): void {
  const storeNames = ['app-settings', 'provider-settings', 'task-history'];
  const suffix = app.isPackaged ? '' : '-dev';
  const userDataPath = app.getPath('userData');

  for (const name of storeNames) {
    const legacyPath = path.join(userDataPath, `${name}${suffix}.json`);
    if (fs.existsSync(legacyPath)) {
      const migratedPath = `${legacyPath}.migrated`;
      try {
        fs.renameSync(legacyPath, migratedPath);
        console.log(`[v001] Renamed ${legacyPath} to ${migratedPath}`);
      } catch (err) {
        console.error(`[v001] Failed to rename ${legacyPath}:`, err);
      }
    }
  }
}

// Export the migration
export const migration: Migration = {
  version: 1,
  up: (db: Database) => {
    // Create schema_meta table
    db.exec(`
      CREATE TABLE schema_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);

    // Create app_settings table
    db.exec(`
      CREATE TABLE app_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        debug_mode INTEGER NOT NULL DEFAULT 0,
        onboarding_complete INTEGER NOT NULL DEFAULT 0,
        selected_model TEXT,
        ollama_config TEXT,
        litellm_config TEXT
      )
    `);

    // Create provider tables
    db.exec(`
      CREATE TABLE provider_meta (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        active_provider_id TEXT,
        debug_mode INTEGER NOT NULL DEFAULT 0
      )
    `);

    db.exec(`
      CREATE TABLE providers (
        provider_id TEXT PRIMARY KEY,
        connection_status TEXT NOT NULL DEFAULT 'disconnected',
        selected_model_id TEXT,
        credentials_type TEXT NOT NULL,
        credentials_data TEXT,
        last_connected_at TEXT,
        available_models TEXT
      )
    `);

    // Create task tables
    db.exec(`
      CREATE TABLE tasks (
        id TEXT PRIMARY KEY,
        prompt TEXT NOT NULL,
        summary TEXT,
        status TEXT NOT NULL,
        session_id TEXT,
        created_at TEXT NOT NULL,
        started_at TEXT,
        completed_at TEXT
      )
    `);

    db.exec(`
      CREATE TABLE task_messages (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        content TEXT NOT NULL,
        tool_name TEXT,
        tool_input TEXT,
        timestamp TEXT NOT NULL,
        sort_order INTEGER NOT NULL
      )
    `);

    db.exec(`
      CREATE TABLE task_attachments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message_id TEXT NOT NULL REFERENCES task_messages(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        data TEXT NOT NULL,
        label TEXT
      )
    `);

    // Create indexes
    db.exec(`CREATE INDEX idx_tasks_created_at ON tasks(created_at DESC)`);
    db.exec(`CREATE INDEX idx_messages_task_id ON task_messages(task_id)`);

    // Insert default rows for single-row tables
    db.exec(`INSERT INTO app_settings (id) VALUES (1)`);
    db.exec(`INSERT INTO provider_meta (id) VALUES (1)`);

    // Import legacy data
    importAppSettings(db);
    importProviderSettings(db);
    importTaskHistory(db);

    // Cleanup legacy files (outside transaction is fine)
    cleanupLegacyStores();
  },
};
