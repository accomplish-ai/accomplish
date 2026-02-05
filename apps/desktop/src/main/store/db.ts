import { app } from 'electron';
import path from 'path';
import {
  getDatabase as coreGetDatabase,
  initializeDatabase as coreInitializeDatabase,
  closeDatabase as coreCloseDatabase,
  resetDatabase as coreResetDatabase,
  databaseExists as coreDatabaseExists,
  isDatabaseInitialized,
} from '@accomplish/agent-core';
import { importLegacyElectronStoreData } from './electronStoreImport';

export function getDatabasePath(): string {
  const dbName = app.isPackaged ? 'accomplish.db' : 'accomplish-dev.db';
  return path.join(app.getPath('userData'), dbName);
}

export function getDatabase() {
  return coreGetDatabase();
}

export function closeDatabase(): void {
  coreCloseDatabase();
}

export function resetDatabase(): void {
  coreResetDatabase(getDatabasePath());
}

export function databaseExists(): boolean {
  return coreDatabaseExists(getDatabasePath());
}

export function initializeDatabase(): void {
  if (!isDatabaseInitialized()) {
    const db = coreInitializeDatabase({
      databasePath: getDatabasePath(),
      runMigrations: true,
    });

    importLegacyElectronStoreData(db);
  }
}
