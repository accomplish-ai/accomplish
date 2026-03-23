import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { createStorage, type StorageAPI } from '@accomplish_ai/agent-core';

const DEFAULT_DATA_DIR = join(homedir(), '.accomplish');

export class StorageService {
  private storage: StorageAPI | null = null;

  initialize(dataDir?: string): StorageAPI {
    const dir = dataDir || DEFAULT_DATA_DIR;
    mkdirSync(dir, { recursive: true, mode: 0o700 });

    // Use the same database name as the desktop app.
    // When --data-dir points to Electron's userData, this shares the same DB.
    // In standalone mode (no --data-dir), uses accomplish-dev.db in ~/.accomplish.
    const dbName = dataDir ? 'accomplish.db' : 'accomplish-dev.db';
    const databasePath = join(dir, dbName);

    this.storage = createStorage({
      databasePath,
      runMigrations: true,
      userDataPath: dir,
      secureStorageFileName: dataDir ? 'secure-storage.json' : 'secure-storage-dev.json',
    });

    this.storage.initialize();
    console.log(`[StorageService] Database initialized at ${databasePath}`);
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
      console.log('[StorageService] Database closed');
    }
  }
}
