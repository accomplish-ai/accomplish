export {
  SecureStorage,
  createSecureStorage,
  type SecureStorageOptions,
  type ApiKeyProvider,
} from './secure-storage.js';

export {
  getDatabase,
  initializeDatabase,
  closeDatabase,
  resetDatabaseInstance,
  resetDatabase,
  databaseExists,
  isDatabaseInitialized,
  getDatabasePath,
  type DatabaseOptions,
} from './database.js';

export {
  runMigrations,
  CURRENT_VERSION,
  getStoredVersion,
  setStoredVersion,
  registerMigration,
  type Migration,
} from './migrations/index.js';

export {
  FutureSchemaError,
  MigrationError,
  CorruptDatabaseError,
} from './migrations/errors.js';

export * from './repositories/index.js';
