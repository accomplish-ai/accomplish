import { app } from 'electron';
import path from 'path';
import {
  createStorage,
  deleteLegacyWorkspaceMetaFiles,
  type StorageAPI,
} from '@accomplish_ai/agent-core';

let _storage: StorageAPI | null = null;

export function getDatabasePath(): string {
  const dbName = app.isPackaged ? 'accomplish.db' : 'accomplish-dev.db';
  return path.join(app.getPath('userData'), dbName);
}

/**
 * Pure helper — reads stable inputs (`app.isPackaged`, `app.getPath('userData')`)
 * and returns byte-identical strings on every invocation. Called by both
 * `getStorage()` (passes into `createStorage`) and `initializeStorage()` (passes
 * into `deleteLegacyWorkspaceMetaFiles`). This is the single source of truth for
 * the legacy path so import and delete can't disagree on what to touch.
 */
export function getLegacyMetaDbPath(): string {
  const fileName = app.isPackaged ? 'workspace-meta.db' : 'workspace-meta-dev.db';
  return path.join(app.getPath('userData'), fileName);
}

/**
 * Paths to the legacy `electron-store` JSON files (app-settings,
 * provider-settings, task-history). Milestone 3 sub-chunk 3b removed the
 * desktop-side importer; `app-startup.ts` now hands these paths to the
 * daemon's `legacy.importElectronStoreIfNeeded` RPC post-bootstrap and the
 * daemon reads + imports them directly (guarded by a `schema_meta` flag,
 * idempotent across boots).
 *
 * The filename + path derivation here has to match what `electron-store`
 * chose historically: `<storeName>.json` in `app.getPath('userData')`,
 * where `storeName` gets a `-dev` suffix in non-packaged builds.
 */
export function getLegacyElectronStorePaths(): {
  appSettingsPath: string;
  providerSettingsPath: string;
  taskHistoryPath: string;
} {
  const userData = app.getPath('userData');
  const suffix = app.isPackaged ? '' : '-dev';
  return {
    appSettingsPath: path.join(userData, `app-settings${suffix}.json`),
    providerSettingsPath: path.join(userData, `provider-settings${suffix}.json`),
    taskHistoryPath: path.join(userData, `task-history${suffix}.json`),
  };
}

export function getStorage(): StorageAPI {
  if (!_storage) {
    _storage = createStorage({
      databasePath: getDatabasePath(),
      runMigrations: true,
      userDataPath: app.getPath('userData'),
      secureStorageFileName: app.isPackaged ? 'secure-storage.json' : 'secure-storage-dev.json',
      legacyMetaDbPath: getLegacyMetaDbPath(),
    });
  }
  return _storage;
}

/**
 * Initialize the local DB singleton. Still required in M3 because Google
 * accounts and skills (both slated for M4) hold a handle to it via
 * `getStorage()` + `coreGetDatabase()`. The legacy electron-store import
 * that used to run here was removed in sub-chunk 3b: the daemon owns that
 * import now, triggered from `app-startup.ts` via
 * `legacy.importElectronStoreIfNeeded` RPC after `bootstrapDaemon()`. We
 * still call `deleteLegacyWorkspaceMetaFiles` locally because M3 has both
 * main and daemon opening the same DB; the helper is idempotent and only
 * fires when `schema_meta.legacy_meta_import_status='copied'`.
 */
export function initializeStorage(): void {
  const storage = getStorage();
  if (!storage.isDatabaseInitialized()) {
    storage.initialize();
    deleteLegacyWorkspaceMetaFiles(getLegacyMetaDbPath());
  }
}

export function closeStorage(): void {
  if (_storage) {
    _storage.close();
    _storage = null;
  }
}

/**
 * Reset the storage singleton after CLEAN_START deletes the userData directory.
 * Closes the open database handle before nulling the reference.
 */
export function resetStorageSingleton(): void {
  if (_storage) {
    _storage.close();
    _storage = null;
  }
}
