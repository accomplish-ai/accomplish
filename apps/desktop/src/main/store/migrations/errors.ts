// apps/desktop/src/main/store/migrations/errors.ts

/**
 * Thrown when the database schema version is newer than the app supports.
 * User must update the app to continue.
 */
export class FutureSchemaError extends Error {
  name = 'FutureSchemaError' as const;

  constructor(
    public readonly storedVersion: number,
    public readonly appVersion: number
  ) {
    super(
      `Database schema v${storedVersion} is newer than app supports (v${appVersion}). Please update Openwork.`
    );
  }
}

/**
 * Thrown when a migration fails to apply.
 */
export class MigrationError extends Error {
  name = 'MigrationError' as const;

  constructor(
    public readonly version: number,
    public readonly cause: Error
  ) {
    super(`Migration to v${version} failed: ${cause.message}`);
  }
}

/**
 * Thrown when the database file is corrupted or unreadable.
 */
export class CorruptDatabaseError extends Error {
  name = 'CorruptDatabaseError' as const;

  constructor(message: string) {
    super(`Database corrupted: ${message}`);
  }
}
