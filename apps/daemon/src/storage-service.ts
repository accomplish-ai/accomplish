import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import {
  createStorage,
  deleteLegacyWorkspaceMetaFiles,
  type StorageAPI,
} from '@accomplish_ai/agent-core';
// Deep import so the daemon's raw-SQL helpers (legacy electron-store import,
// etc.) can reach the underlying `better-sqlite3` handle without widening
// the `StorageAPI` interface — agent-core keeps its public surface free of
// the native Database type. Daemon is the sole DB owner post-migration, so
// this coupling is intentional and scoped.
import { getDatabase } from '@accomplish_ai/agent-core/storage/database';
import type { Database } from 'better-sqlite3';
import { log } from './logger.js';

const DEV_DEFAULT_DATA_DIR = join(homedir(), '.accomplish');

export class StorageService {
  private storage: StorageAPI | null = null;

  /**
   * Initialize storage.
   *
   * @param dataDir — Data directory. Required in production (passed via --data-dir).
   *                   In dev mode (no --data-dir), falls back to `~/.accomplish`.
   */
  initialize(dataDir?: string): StorageAPI {
    const dir = dataDir || DEV_DEFAULT_DATA_DIR;
    mkdirSync(dir, { recursive: true, mode: 0o700 });

    // Match the desktop app's database naming:
    // - Packaged (ACCOMPLISH_IS_PACKAGED=1): accomplish.db + secure-storage.json
    // - Dev mode: accomplish-dev.db + secure-storage-dev.json
    // This ensures both the daemon and Electron read/write the same database.
    const isPackaged = process.env.ACCOMPLISH_IS_PACKAGED === '1';
    const dbName = isPackaged ? 'accomplish.db' : 'accomplish-dev.db';
    const secureFileName = isPackaged ? 'secure-storage.json' : 'secure-storage-dev.json';
    const databasePath = join(dir, dbName);

    // Compute the legacy `workspace-meta{.db,-dev.db}` path once as a
    // function-scoped local. The SAME string is passed both to
    // `createStorage` (so the in-DB import helper reads from it) and to
    // `deleteLegacyWorkspaceMetaFiles` below (so the deletion helper's
    // path-bound safety check matches). One variable, two references — no
    // byte-drift possible between import and delete.
    const metaDbName = isPackaged ? 'workspace-meta.db' : 'workspace-meta-dev.db';
    const legacyMetaDbPath = join(dir, metaDbName);

    this.storage = createStorage({
      databasePath,
      runMigrations: true,
      userDataPath: dir,
      secureStorageFileName: secureFileName,
      legacyMetaDbPath,
    });

    this.storage.initialize();
    log.info(`[StorageService] Database initialized at ${databasePath}`);

    // After `storage.initialize()` has run v030 and the in-DB import helper,
    // delete the retired legacy triplet. No-op unless the helper wrote
    // `legacy_meta_import_status='copied'` AND the stored path byte-matches
    // this local. Safe to run on every boot.
    deleteLegacyWorkspaceMetaFiles(legacyMetaDbPath);

    return this.storage;
  }

  getStorage(): StorageAPI {
    if (!this.storage) {
      throw new Error('Storage not initialized. Call initialize() first.');
    }
    return this.storage;
  }

  /**
   * Raw `better-sqlite3` handle for one-shot helpers that need direct SQL
   * access (legacy electron-store import, ad-hoc schema-meta reads/writes).
   * Use `getStorage()` for everything that has a typed `StorageAPI` method —
   * this escape hatch exists specifically because `StorageAPI` intentionally
   * omits raw-DB access from its public surface.
   */
  getRawDatabase(): Database {
    if (!this.storage) {
      throw new Error('Storage not initialized. Call initialize() first.');
    }
    return getDatabase();
  }

  close(): void {
    if (this.storage) {
      this.storage.close();
      this.storage = null;
      log.info('[StorageService] Database closed');
    }
  }
}
