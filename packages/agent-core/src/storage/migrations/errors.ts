export class FutureSchemaError extends Error {
  name = 'FutureSchemaError' as const;

  constructor(
    public readonly storedVersion: number,
    public readonly appVersion: number
  ) {
    super(
      `Database schema v${storedVersion} is newer than app supports (v${appVersion}). Please update Accomplish.`
    );
  }
}

export class MigrationError extends Error {
  name = 'MigrationError' as const;

  constructor(
    public readonly version: number,
    public readonly cause: Error
  ) {
    super(`Migration to v${version} failed: ${cause.message}`);
  }
}

export class CorruptDatabaseError extends Error {
  name = 'CorruptDatabaseError' as const;

  constructor(message: string) {
    super(`Database corrupted: ${message}`);
  }
}
