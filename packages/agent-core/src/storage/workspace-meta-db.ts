import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { createConsoleLogger } from '../utils/logging.js';

const log = createConsoleLogger({ prefix: 'MetaDB' });

let _metaDb: Database.Database | null = null;
let _metaDbPath: string | null = null;

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  color TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workspace_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS knowledge_notes (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'context',
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);
`;

export function initializeMetaDatabase(dbPath: string): Database.Database {
  if (_metaDb && _metaDbPath === dbPath) {
    return _metaDb;
  }

  if (_metaDb) {
    closeMetaDatabase();
  }

  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  log.info(`[MetaDB] Opening workspace meta database at: ${dbPath}`);

  const db = new Database(dbPath);
  try {
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.exec(SCHEMA_SQL);
  } catch (err) {
    db.close();
    throw err;
  }

  _metaDb = db;
  _metaDbPath = dbPath;

  log.info('[MetaDB] Workspace meta database initialized');

  return _metaDb;
}

export function getMetaDatabase(): Database.Database {
  if (!_metaDb) {
    throw new Error(
      'Workspace meta database not initialized. Call initializeMetaDatabase() first.',
    );
  }
  return _metaDb;
}

export function closeMetaDatabase(): void {
  if (_metaDb) {
    log.info('[MetaDB] Closing workspace meta database');
    _metaDb.close();
    _metaDb = null;
    _metaDbPath = null;
  }
}

export function isMetaDatabaseInitialized(): boolean {
  return _metaDb !== null;
}
