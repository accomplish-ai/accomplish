import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import {
  createStorage,
  initializeMetaDatabase,
  closeMetaDatabase,
  isMetaDatabaseInitialized,
  type StorageAPI,
} from '@accomplish_ai/agent-core';
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

    this.storage = createStorage({
      databasePath,
      runMigrations: true,
      userDataPath: dir,
      secureStorageFileName: secureFileName,
    });

    this.storage.initialize();
    log.info(`[StorageService] Database initialized at ${databasePath}`);

    // The workspace-meta database holds workspace metadata + knowledge-notes
    // rows. It is a SIBLING SQLite file, not part of `accomplish.db`. Before
    // PR #946 only the desktop main process called `initializeMetaDatabase`;
    // the daemon never touched the module. PR #946 routes daemon task-config
    // through `resolveTaskConfig`, which calls `getKnowledgeNotesForPrompt`
    // on every task — and that throws "Workspace meta database not
    // initialized" unless the meta DB handle is open. The try/catch inside
    // `resolveTaskConfig` swallows it into a log warning, so daemon tasks
    // silently drop workspace knowledge notes.
    //
    // Initialise it here alongside the main DB so both processes share the
    // same on-disk file. We do NOT create a default workspace here — that
    // stays a desktop-only concern (daemon-only runs against an empty meta
    // DB just return empty knowledge notes, which is fine).
    const metaDbName = isPackaged ? 'workspace-meta.db' : 'workspace-meta-dev.db';
    const metaDbPath = join(dir, metaDbName);
    initializeMetaDatabase(metaDbPath);
    log.info(`[StorageService] Workspace meta database initialized at ${metaDbPath}`);

    return this.storage;
  }

  getStorage(): StorageAPI {
    if (!this.storage) {
      throw new Error('Storage not initialized. Call initialize() first.');
    }
    return this.storage;
  }

  close(): void {
    if (this.storage) {
      this.storage.close();
      this.storage = null;
      log.info('[StorageService] Database closed');
    }
    // Mirror the main-DB teardown for the workspace-meta handle. Calling
    // `closeMetaDatabase` when no handle is open is a no-op in agent-core
    // but guarding explicitly documents intent and avoids a superfluous
    // import-for-side-effect.
    if (isMetaDatabaseInitialized()) {
      closeMetaDatabase();
      log.info('[StorageService] Workspace meta database closed');
    }
  }
}
