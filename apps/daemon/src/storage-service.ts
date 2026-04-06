import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { createStorage, type StorageAPI } from '@accomplish_ai/agent-core';
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
  }
}
