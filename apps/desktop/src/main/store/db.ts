// apps/desktop/src/main/store/db.ts

import Database from 'better-sqlite3';
import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import { runMigrations } from './migrations';

let _db: Database.Database | null = null;

/**
 * Get the database file path based on environment.
 */
export function getDatabasePath(): string {
  const dbName = app.isPackaged ? 'openwork.db' : 'openwork-dev.db';
  return path.join(app.getPath('userData'), dbName);
}

/**
 * Get or create the database connection.
 * Migrations are NOT run here - call runMigrations() separately after getting the database.
 */
export function getDatabase(): Database.Database {
  if (!_db) {
    const dbPath = getDatabasePath();
    console.log('[DB] Opening database at:', dbPath);

    _db = new Database(dbPath);
    _db.pragma('journal_mode = WAL');
    _db.pragma('foreign_keys = ON');
  }
  return _db;
}

/**
 * Close the database connection.
 * Call this on app shutdown.
 */
export function closeDatabase(): void {
  if (_db) {
    console.log('[DB] Closing database connection');
    _db.close();
    _db = null;
  }
}

/**
 * Reset the database by backing up and removing the current file.
 * Used for recovery from corruption.
 */
export function resetDatabase(): void {
  closeDatabase();

  const dbPath = getDatabasePath();
  if (fs.existsSync(dbPath)) {
    const backupPath = `${dbPath}.corrupt.${Date.now()}`;
    console.log('[DB] Backing up corrupt database to:', backupPath);
    fs.renameSync(dbPath, backupPath);
  }

  // Also remove WAL and SHM files if they exist
  const walPath = `${dbPath}-wal`;
  const shmPath = `${dbPath}-shm`;
  if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
  if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);
}

/**
 * Check if the database file exists.
 */
export function databaseExists(): boolean {
  return fs.existsSync(getDatabasePath());
}

/**
 * Initialize the database and run migrations.
 * Call this on app startup before any database access.
 * Throws FutureSchemaError if the database is from a newer app version.
 */
export function initializeDatabase(): void {
  const db = getDatabase();
  runMigrations(db);
  console.log('[DB] Database initialized and migrations complete');
}
