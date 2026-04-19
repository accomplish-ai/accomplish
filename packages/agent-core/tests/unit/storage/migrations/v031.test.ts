import { describe, it, expect, beforeAll, afterEach } from 'vitest';

/**
 * Migration v031: drop app_settings.desktop_blocklist column.
 *
 * Skipped gracefully if better-sqlite3 native bindings aren't available.
 */

type BetterSqlite3Module = typeof import('better-sqlite3');
type MigrationModule =
  typeof import('../../../../src/storage/migrations/v031-drop-desktop-blocklist-column.js');

describe('migration v031: drop desktop_blocklist column', () => {
  let Database: BetterSqlite3Module | null = null;
  let migrationModule: MigrationModule | null = null;
  let dbInstances: InstanceType<Awaited<BetterSqlite3Module>['default']>[] = [];

  beforeAll(async () => {
    try {
      const BetterSqlite3 = (await import('better-sqlite3')) as BetterSqlite3Module;
      const tmpDb = new BetterSqlite3.default(':memory:');
      tmpDb.close();
      Database = BetterSqlite3;
      migrationModule =
        await import('../../../../src/storage/migrations/v031-drop-desktop-blocklist-column.js');
    } catch (err) {
      if (process.env.REQUIRE_SQLITE_TESTS) {
        throw new Error(
          `REQUIRE_SQLITE_TESTS set but better-sqlite3 failed: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
      console.warn('Skipping v031 migration tests: better-sqlite3 native module not available');
    }
  });

  afterEach(() => {
    for (const db of dbInstances) {
      try {
        db.close();
      } catch {
        /* already closed */
      }
    }
    dbInstances = [];
  });

  function openDb() {
    if (!Database) {
      throw new Error('better-sqlite3 not available');
    }
    const db = new Database.default(':memory:');
    dbInstances.push(db);
    return db;
  }

  it('declares version 31', () => {
    if (!migrationModule) return;
    expect(migrationModule.migration.version).toBe(31);
  });

  it('drops the column when present', () => {
    if (!Database || !migrationModule) return;

    const db = openDb();
    db.exec(
      'CREATE TABLE app_settings (id INTEGER PRIMARY KEY, desktop_blocklist TEXT DEFAULT NULL)',
    );
    db.prepare('INSERT INTO app_settings (id, desktop_blocklist) VALUES (1, ?)').run('[]');

    migrationModule.migration.up(db);

    const cols = db.prepare('PRAGMA table_info(app_settings)').all() as Array<{ name: string }>;
    expect(cols.some((c) => c.name === 'desktop_blocklist')).toBe(false);
  });

  it('is a no-op when the column is absent', () => {
    if (!Database || !migrationModule) return;

    const db = openDb();
    db.exec('CREATE TABLE app_settings (id INTEGER PRIMARY KEY)');

    expect(() => migrationModule!.migration.up(db)).not.toThrow();

    const cols = db.prepare('PRAGMA table_info(app_settings)').all() as Array<{ name: string }>;
    expect(cols.some((c) => c.name === 'desktop_blocklist')).toBe(false);
  });
});
