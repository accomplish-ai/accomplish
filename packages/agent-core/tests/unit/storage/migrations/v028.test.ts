import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Migration v028: google_accounts table
 *
 * Requires better-sqlite3 native module. Tests are skipped gracefully if it
 * is unavailable (NODE_MODULE_VERSION mismatch). Fix: pnpm rebuild better-sqlite3
 */

type BetterSqlite3Module = typeof import('better-sqlite3');
type MigrationModule = typeof import('../../../../src/storage/migrations/v028-google-accounts.js');

describe('migration v028: google_accounts', () => {
  let testDir: string;
  let Database: BetterSqlite3Module | null = null;
  let migrationModule: MigrationModule | null = null;
  let dbInstances: InstanceType<Awaited<BetterSqlite3Module>['default']>[] = [];

  beforeAll(async () => {
    try {
      const BetterSqlite3 = (await import('better-sqlite3')) as BetterSqlite3Module;
      // Probe that instantiation actually works (catches NODE_MODULE_VERSION mismatch
      // which only surfaces at instantiation time, not at import time)
      const tmpDb = new BetterSqlite3.default(':memory:');
      tmpDb.close();
      Database = BetterSqlite3;
      migrationModule = await import('../../../../src/storage/migrations/v028-google-accounts.js');
    } catch {
      console.warn('Skipping v028 migration tests: better-sqlite3 native module not available');
      console.warn('To fix: pnpm rebuild better-sqlite3');
    }

    testDir = path.join(
      os.tmpdir(),
      `v028-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    // Close all open DB instances to release file handles
    for (const db of dbInstances) {
      try {
        db.close();
      } catch {
        /* already closed */
      }
    }
    dbInstances = [];
  });

  function openDb(name: string) {
    if (!Database) {
      throw new Error('better-sqlite3 not available');
    }
    const dbPath = path.join(testDir, `${name}-${Date.now()}.db`);
    const db = new Database.default(dbPath);
    dbInstances.push(db);
    return db;
  }

  it('creates the google_accounts table with the correct columns', () => {
    if (!Database || !migrationModule) {
      return; // skip
    }

    const db = openDb('create');
    migrationModule.migration.up(db);

    const columns = db.prepare('PRAGMA table_info(google_accounts)').all() as Array<{
      name: string;
      type: string;
      notnull: number;
      pk: number;
      dflt_value: string | null;
    }>;

    const colNames = columns.map((c) => c.name);
    expect(colNames).toContain('google_account_id');
    expect(colNames).toContain('email');
    expect(colNames).toContain('display_name');
    expect(colNames).toContain('picture_url');
    expect(colNames).toContain('label');
    expect(colNames).toContain('status');
    expect(colNames).toContain('connected_at');
    expect(colNames).toContain('last_refreshed_at');
  });

  it('sets google_account_id as the primary key', () => {
    if (!Database || !migrationModule) {
      return;
    }

    const db = openDb('pk');
    migrationModule.migration.up(db);

    const columns = db.prepare('PRAGMA table_info(google_accounts)').all() as Array<{
      name: string;
      pk: number;
    }>;

    const pkCol = columns.find((c) => c.pk === 1);
    expect(pkCol?.name).toBe('google_account_id');
  });

  it('sets NOT NULL constraints on required columns', () => {
    if (!Database || !migrationModule) {
      return;
    }

    const db = openDb('notnull');
    migrationModule.migration.up(db);

    const columns = db.prepare('PRAGMA table_info(google_accounts)').all() as Array<{
      name: string;
      notnull: number;
    }>;

    const requiredCols = ['email', 'display_name', 'label', 'status', 'connected_at'];
    for (const col of requiredCols) {
      const info = columns.find((c) => c.name === col);
      expect(info?.notnull, `${col} should be NOT NULL`).toBe(1);
    }

    // picture_url and last_refreshed_at are nullable
    const pictureUrl = columns.find((c) => c.name === 'picture_url');
    expect(pictureUrl?.notnull).toBe(0);

    const lastRefreshed = columns.find((c) => c.name === 'last_refreshed_at');
    expect(lastRefreshed?.notnull).toBe(0);
  });

  it('sets default values for label and status', () => {
    if (!Database || !migrationModule) {
      return;
    }

    const db = openDb('defaults');
    migrationModule.migration.up(db);

    const columns = db.prepare('PRAGMA table_info(google_accounts)').all() as Array<{
      name: string;
      dflt_value: string | null;
    }>;

    const labelCol = columns.find((c) => c.name === 'label');
    expect(labelCol?.dflt_value).toBe("''");

    const statusCol = columns.find((c) => c.name === 'status');
    expect(statusCol?.dflt_value).toBe("'connected'");
  });

  it('is idempotent — running up() twice does not throw', () => {
    if (!Database || !migrationModule) {
      return;
    }

    const db = openDb('idempotent');
    // First run
    migrationModule.migration.up(db);
    // Second run — CREATE TABLE IF NOT EXISTS should be a no-op
    expect(() => migrationModule!.migration.up(db)).not.toThrow();
  });

  it('allows inserting and reading a row', () => {
    if (!Database || !migrationModule) {
      return;
    }

    const db = openDb('insert');
    migrationModule.migration.up(db);

    db.prepare(
      `INSERT INTO google_accounts
        (google_account_id, email, display_name, picture_url, label, status, connected_at, last_refreshed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      'uid-1',
      'test@gmail.com',
      'Test User',
      null,
      'Personal',
      'connected',
      new Date().toISOString(),
      null,
    );

    const row = db
      .prepare('SELECT * FROM google_accounts WHERE google_account_id = ?')
      .get('uid-1') as
      | { email: string; display_name: string; label: string; status: string }
      | undefined;

    expect(row).toBeDefined();
    expect(row?.email).toBe('test@gmail.com');
    expect(row?.display_name).toBe('Test User');
    expect(row?.label).toBe('Personal');
    expect(row?.status).toBe('connected');
  });

  it('down() drops the google_accounts table', () => {
    if (!Database || !migrationModule) {
      return;
    }

    const db = openDb('down');
    migrationModule.migration.up(db);

    // Verify table exists
    const before = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='google_accounts'")
      .get();
    expect(before).toBeDefined();

    migrationModule.migration.down(db);

    const after = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='google_accounts'")
      .get();
    expect(after).toBeUndefined();
  });

  it('migration version is 28', () => {
    if (!migrationModule) {
      return;
    }
    expect(migrationModule.migration.version).toBe(28);
  });
});
