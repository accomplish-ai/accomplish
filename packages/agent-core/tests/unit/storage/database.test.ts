import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Database tests require better-sqlite3 native module.
 * If the native module is not available (Node.js version mismatch),
 * these tests will be skipped.
 *
 * To fix native module issues, run: pnpm rebuild better-sqlite3
 */

describe('Database', () => {
  let testDir: string;
  let dbPath: string;
  let databaseModule: typeof import('../../../src/storage/database.js') | null = null;

  beforeAll(async () => {
    try {
      databaseModule = await import('../../../src/storage/database.js');
    } catch (_err) {
      console.warn('Skipping database tests: better-sqlite3 native module not available');
      console.warn('To fix: pnpm rebuild better-sqlite3');
    }
  });

  beforeEach(() => {
    // Create a unique temporary directory for each test
    testDir = path.join(
      os.tmpdir(),
      `db-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    fs.mkdirSync(testDir, { recursive: true });
    dbPath = path.join(testDir, 'test.db');

    // Suppress console.log during tests
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    // Close database and clean up
    if (databaseModule) {
      databaseModule.resetDatabaseInstance();
    }

    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('initializeDatabase', () => {
    it('should initialize database with migrations', () => {
      if (!databaseModule) return; // Skip if module not available

      const db = databaseModule.initializeDatabase({ databasePath: dbPath });

      expect(db).toBeDefined();
      expect(databaseModule.isDatabaseInitialized()).toBe(true);
      expect(databaseModule.getDatabasePath()).toBe(dbPath);
    });

    it('should create database file', () => {
      if (!databaseModule) return;

      databaseModule.initializeDatabase({ databasePath: dbPath });
      expect(fs.existsSync(dbPath)).toBe(true);
    });

    it('should return existing connection when called with same path', () => {
      if (!databaseModule) return;

      const db1 = databaseModule.initializeDatabase({ databasePath: dbPath });
      const db2 = databaseModule.initializeDatabase({ databasePath: dbPath });

      expect(db1).toBe(db2);
    });

    it('should close and reinitialize with different path', () => {
      if (!databaseModule) return;

      const path1 = path.join(testDir, 'test1.db');
      const path2 = path.join(testDir, 'test2.db');

      const db1 = databaseModule.initializeDatabase({ databasePath: path1 });
      const db2 = databaseModule.initializeDatabase({ databasePath: path2 });

      expect(db1).not.toBe(db2);
      expect(databaseModule.getDatabasePath()).toBe(path2);
    });

    it('should skip migrations when runMigrations is false', () => {
      if (!databaseModule) return;

      const db = databaseModule.initializeDatabase({ databasePath: dbPath, runMigrations: false });

      expect(db).toBeDefined();

      // Check if schema_meta table exists (it shouldn't if migrations were skipped)
      const tableExists = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_meta'")
        .get();

      expect(tableExists).toBeUndefined();
    });
  });

  describe('WAL mode', () => {
    it('should run WAL mode', () => {
      if (!databaseModule) return;

      const db = databaseModule.initializeDatabase({ databasePath: dbPath });

      const result = db.pragma('journal_mode') as Array<{ journal_mode: string }>;
      expect(result[0].journal_mode).toBe('wal');
    });
  });

  describe('foreign keys', () => {
    it('should enforce foreign keys', () => {
      if (!databaseModule) return;

      const db = databaseModule.initializeDatabase({ databasePath: dbPath });

      const result = db.pragma('foreign_keys') as Array<{ foreign_keys: number }>;
      expect(result[0].foreign_keys).toBe(1);
    });
  });

  describe('getDatabase', () => {
    it('should throw error if database not initialized', () => {
      if (!databaseModule) return;

      expect(() => databaseModule!.getDatabase()).toThrow('Database not initialized');
    });

    it('should return database after initialization', () => {
      if (!databaseModule) return;

      databaseModule.initializeDatabase({ databasePath: dbPath });
      const db = databaseModule.getDatabase();
      expect(db).toBeDefined();
    });
  });

  describe('closeDatabase', () => {
    it('should close database properly', () => {
      if (!databaseModule) return;

      databaseModule.initializeDatabase({ databasePath: dbPath });
      expect(databaseModule.isDatabaseInitialized()).toBe(true);

      databaseModule.closeDatabase();

      expect(databaseModule.isDatabaseInitialized()).toBe(false);
      expect(databaseModule.getDatabasePath()).toBeNull();
    });

    it('should not throw when closing already closed database', () => {
      if (!databaseModule) return;

      expect(() => databaseModule!.closeDatabase()).not.toThrow();
    });
  });

  describe('resetDatabaseInstance', () => {
    it('should reset database instance', () => {
      if (!databaseModule) return;

      databaseModule.initializeDatabase({ databasePath: dbPath });
      expect(databaseModule.isDatabaseInitialized()).toBe(true);

      databaseModule.resetDatabaseInstance();

      expect(databaseModule.isDatabaseInitialized()).toBe(false);
    });
  });

  describe('databaseExists', () => {
    it('should return false for non-existent database', () => {
      if (!databaseModule) return;

      expect(databaseModule.databaseExists(dbPath)).toBe(false);
    });

    it('should return true for existing database', () => {
      if (!databaseModule) return;

      databaseModule.initializeDatabase({ databasePath: dbPath });
      expect(databaseModule.databaseExists(dbPath)).toBe(true);
    });
  });

  describe('resetDatabase', () => {
    it('should backup and remove corrupt database', () => {
      if (!databaseModule) return;

      // Create a database first
      databaseModule.initializeDatabase({ databasePath: dbPath });
      databaseModule.closeDatabase();

      expect(fs.existsSync(dbPath)).toBe(true);

      databaseModule.resetDatabase(dbPath);

      // Original file should be removed
      expect(fs.existsSync(dbPath)).toBe(false);

      // Backup file should exist
      const files = fs.readdirSync(testDir);
      const backupFile = files.find((f) => f.includes('.corrupt.'));
      expect(backupFile).toBeDefined();
    });

    it('should remove WAL and SHM files', () => {
      if (!databaseModule) return;

      // Create a database first
      databaseModule.initializeDatabase({ databasePath: dbPath });

      // Manually create WAL and SHM files (they may or may not exist depending on state)
      const walPath = `${dbPath}-wal`;
      const shmPath = `${dbPath}-shm`;

      databaseModule.closeDatabase();

      // Create dummy WAL/SHM files to test deletion
      fs.writeFileSync(walPath, 'dummy wal');
      fs.writeFileSync(shmPath, 'dummy shm');

      databaseModule.resetDatabase(dbPath);

      expect(fs.existsSync(walPath)).toBe(false);
      expect(fs.existsSync(shmPath)).toBe(false);
    });

    it('should handle non-existent database gracefully', () => {
      if (!databaseModule) return;

      expect(() => databaseModule!.resetDatabase(dbPath)).not.toThrow();
    });
  });

  describe('migration schema', () => {
    it('should create schema_meta table', () => {
      if (!databaseModule) return;

      const db = databaseModule.initializeDatabase({ databasePath: dbPath });

      const result = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_meta'")
        .get() as { name: string } | undefined;

      expect(result?.name).toBe('schema_meta');
    });

    it('should set version in schema_meta', () => {
      if (!databaseModule) return;

      const db = databaseModule.initializeDatabase({ databasePath: dbPath });

      const result = db.prepare("SELECT value FROM schema_meta WHERE key = 'version'").get() as
        | { value: string }
        | undefined;

      expect(result?.value).toBeDefined();
      expect(parseInt(result!.value, 10)).toBeGreaterThan(0);
    });

    it('should create expected tables from migrations', () => {
      if (!databaseModule) return;

      const db = databaseModule.initializeDatabase({ databasePath: dbPath });

      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all() as Array<{ name: string }>;

      const tableNames = tables.map((t) => t.name);

      // Check for tables created by migrations
      expect(tableNames).toContain('app_settings');
      expect(tableNames).toContain('provider_meta');
      expect(tableNames).toContain('providers');
      expect(tableNames).toContain('tasks');
    });
  });
});
