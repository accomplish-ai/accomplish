import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { Database } from 'better-sqlite3';
import { LegacyImportService } from '../../src/legacy-import-service.js';

/**
 * Milestone 2 — LegacyImportService reads electron-store JSON files DIRECTLY
 * (no `electron-store` dep) and applies the same SQL the desktop helper used.
 *
 * We stub `better-sqlite3`'s Database surface at the prepared-statement
 * level: each `db.prepare(sql)` returns a canned statement object whose
 * `.get()` / `.run()` / `.all()` we can assert against. Real SQL is covered
 * by agent-core integration tests — here we only care about:
 *
 *   1. Flag-based idempotency (already-imported, existing-data).
 *   2. Correct JSON parsing from the provided paths (missing file = empty).
 *   3. Each import stage fires the right prepared statement with the right
 *      row arguments.
 *   4. `schema_meta` completion flag is set on every happy-path return.
 */
type RunResult = { changes: number };

function makeStmt(opts?: { get?: unknown; run?: RunResult; all?: unknown[] }) {
  return {
    get: vi.fn(() => opts?.get),
    run: vi.fn(() => opts?.run ?? { changes: 0 }),
    all: vi.fn(() => opts?.all ?? []),
  };
}

type StmtMock = ReturnType<typeof makeStmt>;

function makeDbStub(sqlToStmt: Map<string, StmtMock>): Database {
  return {
    prepare: vi.fn((sql: string) => {
      const key = sql.trim().replace(/\s+/g, ' ');
      const stmt = sqlToStmt.get(key);
      if (stmt) {
        return stmt;
      }
      // Unknown SQL — return a stub that records the SQL text for debugging
      const fallback = makeStmt();
      sqlToStmt.set(key, fallback);
      return fallback;
    }),
  } as unknown as Database;
}

// SQL text keys (trimmed + single-spaced) used by the service. Keeping these
// as constants makes it easy to spot when the service's SQL drifts from
// what the test expects.
const SCHEMA_META_SELECT = 'SELECT value FROM schema_meta WHERE key = ?';
const APP_SETTINGS_SELECT = 'SELECT onboarding_complete FROM app_settings WHERE id = 1';
const PROVIDER_COUNT_SELECT = 'SELECT COUNT(*) as count FROM providers';
const TASK_COUNT_SELECT = 'SELECT COUNT(*) as count FROM tasks';
const SCHEMA_META_UPSERT = 'INSERT OR REPLACE INTO schema_meta (key, value) VALUES (?, ?)';
const APP_SETTINGS_UPDATE =
  'UPDATE app_settings SET debug_mode = ?, onboarding_complete = ?, selected_model = ?, ollama_config = ?, litellm_config = ? WHERE id = 1';
const PROVIDER_META_UPDATE =
  'UPDATE provider_meta SET active_provider_id = ?, debug_mode = ? WHERE id = 1';

describe('LegacyImportService', () => {
  let tmpDir: string;
  let appSettingsPath: string;
  let providerSettingsPath: string;
  let taskHistoryPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'legacy-import-'));
    appSettingsPath = path.join(tmpDir, 'app-settings.json');
    providerSettingsPath = path.join(tmpDir, 'provider-settings.json');
    taskHistoryPath = path.join(tmpDir, 'task-history.json');
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* best-effort */
    }
  });

  function pathsInput() {
    return { appSettingsPath, providerSettingsPath, taskHistoryPath };
  }

  it('returns already-imported when schema_meta flag is set, without touching JSON', () => {
    const stmts = new Map<string, StmtMock>();
    stmts.set(SCHEMA_META_SELECT, makeStmt({ get: { value: 'true' } }));

    const db = makeDbStub(stmts);
    const service = new LegacyImportService(db);

    const result = service.importElectronStoreIfNeeded(pathsInput());

    expect(result).toEqual({ imported: false, reason: 'already-imported' });
    // No update to schema_meta, no touch of app_settings SELECT
    expect(stmts.get(APP_SETTINGS_UPDATE)).toBeUndefined();
  });

  it('returns existing-data (and marks complete) when the main DB already has an onboarded user', () => {
    const stmts = new Map<string, StmtMock>();
    stmts.set(SCHEMA_META_SELECT, makeStmt({ get: undefined }));
    stmts.set(APP_SETTINGS_SELECT, makeStmt({ get: { onboarding_complete: 1 } }));
    const upsert = makeStmt();
    stmts.set(SCHEMA_META_UPSERT, upsert);

    const db = makeDbStub(stmts);
    const service = new LegacyImportService(db);

    const result = service.importElectronStoreIfNeeded(pathsInput());

    expect(result).toEqual({ imported: false, reason: 'existing-data' });
    expect(upsert.run).toHaveBeenCalledWith('legacy_electron_store_import_complete', 'true');
  });

  it('runs the three import stages when no flag is set and no existing data', () => {
    // Legacy JSON files on disk
    fs.writeFileSync(
      appSettingsPath,
      JSON.stringify({
        debugMode: true,
        onboardingComplete: true,
        selectedModel: { provider: 'anthropic', model: 'claude' },
        ollamaConfig: null,
        litellmConfig: null,
      }),
    );
    fs.writeFileSync(
      providerSettingsPath,
      JSON.stringify({
        activeProviderId: 'anthropic',
        debugMode: false,
        connectedProviders: {
          anthropic: {
            connectionStatus: 'connected',
            selectedModelId: 'claude-opus',
            credentials: { type: 'api_key' },
            lastConnectedAt: '2024-01-01T00:00:00Z',
          },
        },
      }),
    );
    fs.writeFileSync(
      taskHistoryPath,
      JSON.stringify({
        tasks: [
          {
            id: 't1',
            prompt: 'hello',
            summary: null,
            status: 'completed',
            sessionId: 's1',
            createdAt: '2024-01-01T00:00:00Z',
            startedAt: null,
            completedAt: null,
            messages: [
              {
                id: 'm1',
                type: 'user',
                content: 'hi',
                toolName: null,
                toolInput: null,
                timestamp: '2024-01-01T00:00:01Z',
                attachments: null,
              },
            ],
          },
        ],
      }),
    );

    const stmts = new Map<string, StmtMock>();
    // No-flag, no-data
    stmts.set(SCHEMA_META_SELECT, makeStmt({ get: undefined }));
    stmts.set(APP_SETTINGS_SELECT, makeStmt({ get: { onboarding_complete: 0 } }));
    stmts.set(PROVIDER_COUNT_SELECT, makeStmt({ get: { count: 0 } }));
    stmts.set(TASK_COUNT_SELECT, makeStmt({ get: { count: 0 } }));

    const appUpdate = makeStmt();
    const providerMetaUpdate = makeStmt();
    const providerInsert = makeStmt();
    const taskInsert = makeStmt({ run: { changes: 1 } });
    const messageInsert = makeStmt();
    const upsert = makeStmt();

    stmts.set(APP_SETTINGS_UPDATE, appUpdate);
    stmts.set(PROVIDER_META_UPDATE, providerMetaUpdate);
    stmts.set(
      'INSERT OR IGNORE INTO providers (provider_id, connection_status, selected_model_id, credentials_type, credentials_data, last_connected_at, available_models) VALUES (?, ?, ?, ?, ?, ?, ?)',
      providerInsert,
    );
    stmts.set(
      'INSERT OR IGNORE INTO tasks (id, prompt, summary, status, session_id, created_at, started_at, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      taskInsert,
    );
    stmts.set(
      'INSERT OR IGNORE INTO task_messages (id, task_id, type, content, tool_name, tool_input, timestamp, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      messageInsert,
    );
    stmts.set(SCHEMA_META_UPSERT, upsert);

    const db = makeDbStub(stmts);
    const service = new LegacyImportService(db);

    const result = service.importElectronStoreIfNeeded(pathsInput());

    expect(result).toEqual({ imported: true, reason: 'completed' });

    expect(appUpdate.run).toHaveBeenCalledTimes(1);
    expect(appUpdate.run).toHaveBeenCalledWith(
      1, // debugMode
      1, // onboardingComplete
      JSON.stringify({ provider: 'anthropic', model: 'claude' }),
      JSON.stringify(null),
      JSON.stringify(null),
    );

    expect(providerMetaUpdate.run).toHaveBeenCalledWith('anthropic', 0);
    expect(providerInsert.run).toHaveBeenCalledWith(
      'anthropic',
      'connected',
      'claude-opus',
      'api_key',
      JSON.stringify({ type: 'api_key' }),
      '2024-01-01T00:00:00Z',
      JSON.stringify(null),
    );

    expect(taskInsert.run).toHaveBeenCalledTimes(1);
    expect(messageInsert.run).toHaveBeenCalledTimes(1);

    // Completion flag gets written regardless of whether any specific stage
    // produced rows — the guard runs on a flag, not on row counts.
    expect(upsert.run).toHaveBeenCalledWith('legacy_electron_store_import_complete', 'true');
  });

  it('treats missing JSON files as empty (and still marks complete)', () => {
    // No files on disk this time.
    const stmts = new Map<string, StmtMock>();
    stmts.set(SCHEMA_META_SELECT, makeStmt({ get: undefined }));
    stmts.set(APP_SETTINGS_SELECT, makeStmt({ get: { onboarding_complete: 0 } }));
    stmts.set(PROVIDER_COUNT_SELECT, makeStmt({ get: { count: 0 } }));
    stmts.set(TASK_COUNT_SELECT, makeStmt({ get: { count: 0 } }));
    const upsert = makeStmt();
    stmts.set(SCHEMA_META_UPSERT, upsert);

    const db = makeDbStub(stmts);
    const service = new LegacyImportService(db);

    const result = service.importElectronStoreIfNeeded(pathsInput());

    expect(result).toEqual({ imported: true, reason: 'completed' });
    // No UPDATE/INSERT for the three import stages because each JSON was empty.
    expect(stmts.get(APP_SETTINGS_UPDATE)).toBeUndefined();
    expect(stmts.get(PROVIDER_META_UPDATE)).toBeUndefined();
    // Completion flag still set — this is the idempotency guarantee.
    expect(upsert.run).toHaveBeenCalledWith('legacy_electron_store_import_complete', 'true');
  });

  it('soft-fails on malformed JSON: logs a warning, continues the other stages, marks complete', () => {
    fs.writeFileSync(appSettingsPath, '{ this is not json');
    // provider-settings + task-history files absent

    const stmts = new Map<string, StmtMock>();
    stmts.set(SCHEMA_META_SELECT, makeStmt({ get: undefined }));
    stmts.set(APP_SETTINGS_SELECT, makeStmt({ get: { onboarding_complete: 0 } }));
    stmts.set(PROVIDER_COUNT_SELECT, makeStmt({ get: { count: 0 } }));
    stmts.set(TASK_COUNT_SELECT, makeStmt({ get: { count: 0 } }));
    const upsert = makeStmt();
    stmts.set(SCHEMA_META_UPSERT, upsert);

    const db = makeDbStub(stmts);
    const service = new LegacyImportService(db);

    const result = service.importElectronStoreIfNeeded(pathsInput());

    // Even with a corrupt JSON file we mark complete — replaying would just
    // log the same warning again on every boot.
    expect(result).toEqual({ imported: true, reason: 'completed' });
    expect(upsert.run).toHaveBeenCalledWith('legacy_electron_store_import_complete', 'true');
  });
});
