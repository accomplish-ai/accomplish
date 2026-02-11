import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('App Settings Repository', () => {
  let testDir: string;
  let dbPath: string;
  let storageModule: typeof import('../../../src/storage/index.js') | null = null;
  let canRunDatabaseTests = false;

  beforeAll(async () => {
    try {
      storageModule = await import('../../../src/storage/index.js');
      const probeDir = path.join(
        os.tmpdir(),
        `app-settings-probe-${Date.now()}-${Math.random().toString(36).slice(2)}`
      );
      const probeDbPath = path.join(probeDir, 'probe.db');
      fs.mkdirSync(probeDir, { recursive: true });

      try {
        storageModule.initializeDatabase({
          databasePath: probeDbPath,
          runMigrations: false,
        });
        storageModule.closeDatabase();
        canRunDatabaseTests = true;
      } finally {
        if (fs.existsSync(probeDir)) {
          fs.rmSync(probeDir, { recursive: true, force: true });
        }
      }
    } catch {
      console.warn('Skipping app settings repository tests: better-sqlite3 native module not available');
      canRunDatabaseTests = false;
    }
  });

  beforeEach(() => {
    testDir = path.join(
      os.tmpdir(),
      `app-settings-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    fs.mkdirSync(testDir, { recursive: true });
    dbPath = path.join(testDir, 'test.db');

    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    if (storageModule) {
      storageModule.resetDatabaseInstance();
    }

    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  function seedLegacySchemaWithoutSandboxColumn(): void {
    if (!storageModule || !canRunDatabaseTests) return;

    const db = storageModule.initializeDatabase({
      databasePath: dbPath,
      runMigrations: false,
    });

    db.exec(`
      CREATE TABLE schema_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
    db.exec(`INSERT INTO schema_meta (key, value) VALUES ('version', '7');`);

    db.exec(`
      CREATE TABLE app_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        debug_mode INTEGER NOT NULL DEFAULT 0,
        onboarding_complete INTEGER NOT NULL DEFAULT 0,
        selected_model TEXT,
        ollama_config TEXT,
        litellm_config TEXT,
        azure_foundry_config TEXT,
        lmstudio_config TEXT,
        openai_base_url TEXT DEFAULT ''
      );
    `);
    db.exec(`INSERT INTO app_settings (id) VALUES (1);`);

    storageModule.closeDatabase();
  }

  it('auto-repairs missing sandbox_config column on getSandboxConfig', () => {
    if (!storageModule || !canRunDatabaseTests) return;

    seedLegacySchemaWithoutSandboxColumn();
    storageModule.initializeDatabase({ databasePath: dbPath, runMigrations: true });

    expect(storageModule.getSandboxConfig()).toBeNull();

    const db = storageModule.getDatabase();
    const columns = db
      .prepare('PRAGMA table_info(app_settings)')
      .all() as Array<{ name: string }>;

    expect(columns.some((column) => column.name === 'sandbox_config')).toBe(true);
  });

  it('auto-repairs missing sandbox_config column on setSandboxConfig', () => {
    if (!storageModule || !canRunDatabaseTests) return;

    seedLegacySchemaWithoutSandboxColumn();
    storageModule.initializeDatabase({ databasePath: dbPath, runMigrations: true });

    storageModule.setSandboxConfig({
      enabled: true,
      allowedDomains: ['news.ycombinator.com'],
      additionalWritePaths: [],
      denyReadPaths: [],
      allowPty: true,
      allowLocalBinding: true,
      allowAllUnixSockets: true,
      enableWeakerNestedSandbox: false,
    });

    const db = storageModule.getDatabase();
    const row = db
      .prepare('SELECT sandbox_config FROM app_settings WHERE id = 1')
      .get() as { sandbox_config: string | null };

    expect(row.sandbox_config).toBeTruthy();
    expect(JSON.parse(row.sandbox_config as string)).toMatchObject({
      allowedDomains: ['news.ycombinator.com'],
    });
  });
});
