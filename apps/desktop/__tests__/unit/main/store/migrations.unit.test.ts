import { afterEach, describe, expect, it, vi } from 'vitest';
import { runMigrations, getStoredVersion } from '@main/store/migrations';
import { FutureSchemaError } from '@main/store/migrations/errors';

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getPath: vi.fn(() => '/tmp/openwork-test'),
  },
}));

vi.mock('electron-store', () => ({
  default: class MockStore {
    size = 0;
    get() {
      return undefined;
    }
  },
}));

class FakeDatabase {
  private tables = new Map<string, Set<string>>();
  private schemaVersion: string | null = null;

  pragma = vi.fn();

  exec(sql: string) {
    const statements = sql
      .split(';')
      .map((statement) => statement.trim())
      .filter(Boolean);

    for (const statement of statements) {
      const createMatch = statement.match(/CREATE TABLE\s+(\w+)\s*\(([\s\S]+)\)/i);
      if (createMatch) {
        const [, tableName, columnsBlock] = createMatch;
        const columns = columnsBlock
          .split(',')
          .map((column) => column.trim())
          .filter(Boolean)
          .map((column) => column.split(/\s+/)[0])
          .filter(Boolean);
        this.tables.set(tableName, new Set(columns));
        continue;
      }

      const dropMatch = statement.match(/DROP TABLE IF EXISTS\s+(\w+)/i);
      if (dropMatch) {
        this.tables.delete(dropMatch[1]);
        if (dropMatch[1] === 'schema_meta') {
          this.schemaVersion = null;
        }
        continue;
      }

      const addColumnMatch = statement.match(
        /ALTER TABLE\s+(\w+)\s+ADD COLUMN\s+(\w+)/i
      );
      if (addColumnMatch) {
        const [, tableName, columnName] = addColumnMatch;
        const table = this.tables.get(tableName);
        if (table) {
          table.add(columnName);
        }
        continue;
      }

      const dropColumnMatch = statement.match(
        /ALTER TABLE\s+(\w+)\s+DROP COLUMN\s+(\w+)/i
      );
      if (dropColumnMatch) {
        const [, tableName, columnName] = dropColumnMatch;
        const table = this.tables.get(tableName);
        if (table) {
          table.delete(columnName);
        }
        continue;
      }
    }
  }

  prepare(sql: string) {
    if (sql.includes('sqlite_master') && sql.includes('schema_meta')) {
      return {
        get: () => (this.tables.has('schema_meta') ? { name: 'schema_meta' } : undefined),
      };
    }

    if (sql.includes('schema_meta') && sql.includes("WHERE key = 'version'")) {
      return {
        get: () => (this.schemaVersion ? { value: this.schemaVersion } : undefined),
      };
    }

    if (sql.includes('schema_meta') && sql.includes('INSERT')) {
      return {
        run: (value?: string) => {
          if (value) {
            this.schemaVersion = value;
            return;
          }
          const match = sql.match(/VALUES\s*\(\s*'version'\s*,\s*'?(\d+)'?\s*\)/i);
          if (match) {
            this.schemaVersion = match[1];
          }
        },
      };
    }

    if (sql.startsWith('PRAGMA table_info')) {
      const tableNameMatch = sql.match(/PRAGMA table_info\((\w+)\)/i);
      const tableName = tableNameMatch?.[1];
      return {
        all: () =>
          Array.from(this.tables.get(tableName ?? '') ?? []).map((name) => ({ name })),
      };
    }

    return {
      run: () => {},
      get: () => undefined,
      all: () => [],
    };
  }

  transaction(fn: () => void) {
    return () => fn();
  }

  close() {}
}

describe('runMigrations', () => {
  let db: FakeDatabase;

  afterEach(() => {
    db?.close();
  });

  it('rolls forward, downgrades, and re-upgrades the schema', () => {
    db = new FakeDatabase();

    runMigrations(db, 2);
    expect(getStoredVersion(db)).toBe(2);

    const columnsAfterUpgrade = db
      .prepare('PRAGMA table_info(app_settings)')
      .all() as Array<{ name: string }>;
    expect(columnsAfterUpgrade.map((column) => column.name)).toContain('azure_foundry_config');

    runMigrations(db, 1);
    expect(getStoredVersion(db)).toBe(1);

    const columnsAfterDowngrade = db
      .prepare('PRAGMA table_info(app_settings)')
      .all() as Array<{ name: string }>;
    expect(columnsAfterDowngrade.map((column) => column.name)).not.toContain(
      'azure_foundry_config'
    );

    runMigrations(db, 2);
    expect(getStoredVersion(db)).toBe(2);

    const columnsAfterReupgrade = db
      .prepare('PRAGMA table_info(app_settings)')
      .all() as Array<{ name: string }>;
    expect(columnsAfterReupgrade.map((column) => column.name)).toContain(
      'azure_foundry_config'
    );
  });

  it('throws when the stored schema is newer than known migrations', () => {
    db = new FakeDatabase();

    db.exec(`
      CREATE TABLE schema_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);
    db.prepare("INSERT INTO schema_meta (key, value) VALUES ('version', '99')").run();

    expect(() => runMigrations(db, 2)).toThrow(FutureSchemaError);
  });
});
