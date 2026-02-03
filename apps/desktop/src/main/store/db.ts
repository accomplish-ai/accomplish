// apps/desktop/src/main/store/db.ts

/**
 * Desktop-specific database wrapper.
 *
 * This module provides Electron-specific initialization using app.getPath()
 * for determining the database location, then delegates to @accomplish/core
 * for actual database operations.
 */

import { app } from 'electron';
import path from 'path';
import {
  getDatabase as coreGetDatabase,
  initializeDatabase as coreInitializeDatabase,
  closeDatabase as coreCloseDatabase,
  resetDatabase as coreResetDatabase,
  databaseExists as coreDatabaseExists,
  isDatabaseInitialized,
} from '@accomplish/core';
import { importLegacyElectronStoreData } from './electronStoreImport';

/**
 * Get the database file path based on environment.
 */
export function getDatabasePath(): string {
  const dbName = app.isPackaged ? 'accomplish.db' : 'accomplish-dev.db';
  return path.join(app.getPath('userData'), dbName);
}

/**
 * Get the database connection.
 * The database must be initialized first via initializeDatabase().
 */
export function getDatabase() {
  return coreGetDatabase();
}

/**
 * Close the database connection.
 * Call this on app shutdown.
 */
export function closeDatabase(): void {
  coreCloseDatabase();
}

/**
 * Reset the database by backing up and removing the current file.
 * Used for recovery from corruption.
 */
export function resetDatabase(): void {
  coreResetDatabase(getDatabasePath());
}

/**
 * Check if the database file exists.
 */
export function databaseExists(): boolean {
  return coreDatabaseExists(getDatabasePath());
}

/**
 * Initialize the database and run migrations.
 * Call this on app startup before any database access.
 * Throws FutureSchemaError if the database is from a newer app version.
 */
export function initializeDatabase(): void {
  // Only initialize if not already initialized
  if (!isDatabaseInitialized()) {
    const db = coreInitializeDatabase({
      databasePath: getDatabasePath(),
      runMigrations: true,
    });

    // Import any legacy electron-store data (for users upgrading from pre-SQLite versions)
    importLegacyElectronStoreData(db);
  }
}
