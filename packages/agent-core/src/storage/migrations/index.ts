import type { Database } from 'better-sqlite3';
import { FutureSchemaError, MigrationError } from './errors.js';

export interface Migration {
  version: number;
  up: (db: Database) => void;
  down?: (db: Database) => void;
}

import { migration as v001 } from './v001-initial.js';
import { migration as v002 } from './v002-azure-foundry.js';
import { migration as v003 } from './v003-lmstudio.js';
import { migration as v004 } from './v004-openai-base-url.js';
import { migration as v005 } from './v005-task-todos.js';
import { migration as v006 } from './v006-skills.js';
import { migration as v007 } from './v007-connectors.js';

const migrations: Migration[] = [
  v001,
  v002,
  v003,
  v004,
  v005,
  v006,
  v007,
];

export function registerMigration(migration: Migration): void {
  migrations.push(migration);
  migrations.sort((a, b) => a.version - b.version);
}

export const CURRENT_VERSION = 7;

export function getStoredVersion(db: Database): number {
  try {
    const tableExists = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_meta'"
      )
      .get();

    if (!tableExists) {
      return 0;
    }

    const row = db
      .prepare("SELECT value FROM schema_meta WHERE key = 'version'")
      .get() as { value: string } | undefined;

    return row ? parseInt(row.value, 10) : 0;
  } catch {
    return 0;
  }
}

export function setStoredVersion(db: Database, version: number): void {
  db.prepare(
    "INSERT OR REPLACE INTO schema_meta (key, value) VALUES ('version', ?)"
  ).run(String(version));
}

export function runMigrations(db: Database): void {
  const storedVersion = getStoredVersion(db);

  console.log(
    `[Migrations] Stored version: ${storedVersion}, App version: ${CURRENT_VERSION}`
  );

  if (storedVersion > CURRENT_VERSION) {
    throw new FutureSchemaError(storedVersion, CURRENT_VERSION);
  }

  if (storedVersion === CURRENT_VERSION) {
    console.log('[Migrations] Database is up to date');
    return;
  }

  for (const migration of migrations) {
    if (migration.version > storedVersion) {
      console.log(`[Migrations] Running migration v${migration.version}`);

      try {
        db.transaction(() => {
          migration.up(db);
          setStoredVersion(db, migration.version);
        })();
        console.log(`[Migrations] Migration v${migration.version} complete`);
      } catch (err) {
        throw new MigrationError(
          migration.version,
          err instanceof Error ? err : new Error(String(err))
        );
      }
    }
  }

  console.log('[Migrations] All migrations complete');
}

export { FutureSchemaError, MigrationError, CorruptDatabaseError } from './errors.js';
