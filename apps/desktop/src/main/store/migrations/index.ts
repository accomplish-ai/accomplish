// apps/desktop/src/main/store/migrations/index.ts

import type { Database } from 'better-sqlite3';
import { FutureSchemaError, MigrationError, MissingDownMigrationError } from './errors';

export interface Migration {
  version: number;
  up: (db: Database) => void;
  down?: (db: Database) => void;
}

// Import migrations
import { migration as v001 } from './v001-initial';
import { migration as v002 } from './v002-azure-foundry';

// Migrations array
const migrations: Migration[] = [
  v001,
  v002,
];

/**
 * Register a migration. Called by migration files.
 * For future use if needed.
 */
export function registerMigration(migration: Migration): void {
  migrations.push(migration);
  migrations.sort((a, b) => a.version - b.version);
}

/**
 * Current schema version supported by this app.
 * Increment this when adding new migrations.
 */
export const CURRENT_VERSION = 2;

/**
 * Get the stored schema version from the database.
 * Returns 0 if no version is set (fresh database).
 */
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

/**
 * Set the schema version in the database.
 */
export function setStoredVersion(db: Database, version: number): void {
  db.prepare(
    "INSERT OR REPLACE INTO schema_meta (key, value) VALUES ('version', ?)"
  ).run(String(version));
}

/**
 * Run all pending migrations.
 * Throws FutureSchemaError if the database is from a newer app version.
 */
export function runMigrations(db: Database, targetVersion: number = CURRENT_VERSION): void {
  const storedVersion = getStoredVersion(db);
  const sortedMigrations = [...migrations].sort((a, b) => a.version - b.version);

  console.log(
    `[Migrations] Stored version: ${storedVersion}, App version: ${targetVersion}`
  );

  // No migrations to run
  if (storedVersion === targetVersion) {
    console.log('[Migrations] Database is up to date');
    return;
  }

  if (storedVersion > targetVersion) {
    const reversedMigrations = [...sortedMigrations].sort((a, b) => b.version - a.version);
    const migrationVersions = sortedMigrations.map((migration) => migration.version);
    const maxKnownVersion = migrationVersions[migrationVersions.length - 1] ?? 0;

    if (storedVersion > maxKnownVersion) {
      throw new FutureSchemaError(storedVersion, targetVersion);
    }

    for (const migration of reversedMigrations) {
      if (migration.version <= targetVersion || migration.version > storedVersion) {
        continue;
      }

      if (!migration.down) {
        throw new MissingDownMigrationError(
          migration.version,
          storedVersion,
          targetVersion
        );
      }

      const previousVersion =
        migrationVersions
          .slice()
          .reverse()
          .find((version) => version < migration.version) ?? 0;

      console.log(`[Migrations] Rolling back migration v${migration.version}`);

      try {
        db.transaction(() => {
          migration.down?.(db);
          setStoredVersion(db, previousVersion);
        })();
        console.log(`[Migrations] Rollback of v${migration.version} complete`);
      } catch (err) {
        throw new MigrationError(
          previousVersion,
          err instanceof Error ? err : new Error(String(err))
        );
      }
    }

    console.log('[Migrations] Database downgraded to app version');
    return;
  }

  // Run pending migrations
  for (const migration of sortedMigrations) {
    if (migration.version > storedVersion && migration.version <= targetVersion) {
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

// Re-export errors for convenience
export {
  FutureSchemaError,
  MigrationError,
  CorruptDatabaseError,
  MissingDownMigrationError,
} from './errors';
