import Database from 'better-sqlite3';
import fs from 'fs';
import { runMigrations, getStoredVersion, CURRENT_VERSION } from './migrations/index.js';
import { FutureSchemaError } from './migrations/errors.js';
import { createConsoleLogger } from '../utils/logging.js';

const log = createConsoleLogger({ prefix: 'DB' });

export interface DatabaseOptions {
  databasePath: string;
  runMigrations?: boolean;
}

let _db: Database.Database | null = null;
let _currentPath: string | null = null;

export function getDatabase(): Database.Database {
  if (!_db) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return _db;
}

export function initializeDatabase(options: DatabaseOptions): Database.Database {
  const { databasePath, runMigrations: shouldRunMigrations = true } = options;

  if (_db && _currentPath === databasePath) {
    return _db;
  }

  if (_db) {
    closeDatabase();
  }

  log.info(`[DB] Opening database at: ${databasePath}`);

  _db = new Database(databasePath);
  _currentPath = databasePath;

  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');

  if (shouldRunMigrations) {
    const storedVersion = getStoredVersion(_db);
    if (storedVersion > CURRENT_VERSION) {
      const error = new FutureSchemaError(storedVersion, CURRENT_VERSION);
      closeDatabase();
      throw error;
    }

    runMigrations(_db);
    log.info('[DB] Database initialized and migrations complete');
  }

  return _db;
}

export function closeDatabase(): void {
  if (_db) {
    log.info('[DB] Closing database connection');
    _db.close();
    _db = null;
    _currentPath = null;
  }
}

export function resetDatabaseInstance(): void {
  closeDatabase();
}

export function isDatabaseInitialized(): boolean {
  return _db !== null;
}

export function getDatabasePath(): string | null {
  return _currentPath;
}

export function resetDatabase(databasePath: string): void {
  closeDatabase();

  if (fs.existsSync(databasePath)) {
    const backupPath = `${databasePath}.corrupt.${Date.now()}`;
    log.info(`[DB] Backing up corrupt database to: ${backupPath}`);
    fs.renameSync(databasePath, backupPath);
  }

  const walPath = `${databasePath}-wal`;
  const shmPath = `${databasePath}-shm`;
  if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
  if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);
}

export function databaseExists(databasePath: string): boolean {
  return fs.existsSync(databasePath);
}
