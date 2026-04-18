/**
 * Init-contract assertions for the desktop storage bootstrap.
 *
 * The v030 consolidation requires two things the real agent-core helpers
 * would normally enforce:
 *
 *   1. `getStorage()` MUST pass `legacyMetaDbPath` into `createStorage` so
 *      the in-DB import helper has a path to read from.
 *   2. `initializeStorage()` MUST call `deleteLegacyWorkspaceMetaFiles`
 *      AFTER `storage.initialize()` — the real delete helper reads
 *      `legacy_meta_import_status` from the main DB, which only exists
 *      once init has run.
 *
 * Better-sqlite3 and the real helpers aren't usable in the desktop vitest
 * env, so we mock both `createStorage` and `deleteLegacyWorkspaceMetaFiles`
 * and assert the shape + call order.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'node:path';

// electron mock — `isPackaged` is mutable so individual tests can toggle
// between dev and packaged filenames. Read via a module-level ref so the
// mock's factory doesn't snapshot at import time.
const electronState = { isPackaged: false };
vi.mock('electron', () => ({
  app: {
    get isPackaged() {
      return electronState.isPackaged;
    },
    getPath: vi.fn((_key: string) => '/mock/userData'),
  },
}));

const createStorageSpy = vi.fn();
const storageInitializeSpy = vi.fn();
const storageCloseSpy = vi.fn();
const storageIsInitializedSpy = vi.fn(() => false);
const deleteLegacySpy = vi.fn();

// Mock the agent-core barrel — both createStorage and
// deleteLegacyWorkspaceMetaFiles come from it.
vi.mock('@accomplish_ai/agent-core', async () => {
  return {
    createStorage: vi.fn((options: Record<string, unknown>) => {
      createStorageSpy(options);
      let initialized = false;
      return {
        initialize: () => {
          storageInitializeSpy();
          initialized = true;
        },
        close: storageCloseSpy,
        isDatabaseInitialized: () => {
          storageIsInitializedSpy();
          return initialized;
        },
      };
    }),
    deleteLegacyWorkspaceMetaFiles: vi.fn((p: string) => {
      deleteLegacySpy(p);
    }),
  };
});

// Milestone 3 sub-chunk 3b: the deep-`storage/database` import and the
// `@main/store/electronStoreImport` mock are both gone. `storage.ts` no
// longer reaches for the raw `Database` handle (the legacy electron-store
// import moved to the daemon and is invoked over RPC from `app-startup.ts`
// post-bootstrap) and the importer module itself was deleted.

describe('desktop storage bootstrap — init contract', () => {
  beforeEach(() => {
    vi.resetModules();
    createStorageSpy.mockClear();
    storageInitializeSpy.mockClear();
    storageCloseSpy.mockClear();
    storageIsInitializedSpy.mockClear();
    deleteLegacySpy.mockClear();
    electronState.isPackaged = false; // default each test to dev mode
  });

  async function importFreshStorage() {
    // Reset the storage module so the internal `_storage` singleton starts
    // empty for this test.
    vi.resetModules();
    return await import('../../../../src/main/store/storage');
  }

  it('getLegacyMetaDbPath returns the dev filename when isPackaged=false', async () => {
    const storage = await importFreshStorage();
    const p = storage.getLegacyMetaDbPath();
    expect(p).toBe(path.join('/mock/userData', 'workspace-meta-dev.db'));
  });

  it('getLegacyMetaDbPath returns the packaged filename when isPackaged=true', async () => {
    electronState.isPackaged = true;
    const storage = await importFreshStorage();
    const p = storage.getLegacyMetaDbPath();
    expect(p).toBe(path.join('/mock/userData', 'workspace-meta.db'));
  });

  it('getStorage passes databasePath AND legacyMetaDbPath to createStorage (dev mode)', async () => {
    const storage = await importFreshStorage();
    storage.getStorage();

    expect(createStorageSpy).toHaveBeenCalledTimes(1);
    const opts = createStorageSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(opts.databasePath).toBe(path.join('/mock/userData', 'accomplish-dev.db'));
    expect(opts.legacyMetaDbPath).toBe(path.join('/mock/userData', 'workspace-meta-dev.db'));
  });

  it('getStorage uses the packaged filenames when isPackaged=true', async () => {
    electronState.isPackaged = true;
    const storage = await importFreshStorage();
    storage.getStorage();

    const opts = createStorageSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(opts.databasePath).toBe(path.join('/mock/userData', 'accomplish.db'));
    expect(opts.legacyMetaDbPath).toBe(path.join('/mock/userData', 'workspace-meta.db'));
  });

  it('initializeStorage calls deleteLegacyWorkspaceMetaFiles with the same legacy path', async () => {
    const storage = await importFreshStorage();
    storage.initializeStorage();

    expect(deleteLegacySpy).toHaveBeenCalledTimes(1);
    const opts = createStorageSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(deleteLegacySpy.mock.calls[0][0]).toBe(opts.legacyMetaDbPath);
  });

  it('initializeStorage in packaged mode passes the packaged path to deleteLegacyWorkspaceMetaFiles', async () => {
    electronState.isPackaged = true;
    const storage = await importFreshStorage();
    storage.initializeStorage();

    const packagedLegacy = path.join('/mock/userData', 'workspace-meta.db');
    expect(deleteLegacySpy).toHaveBeenCalledWith(packagedLegacy);
    // Same-source invariant: both createStorage and the delete call see
    // byte-identical packaged paths.
    const opts = createStorageSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(opts.legacyMetaDbPath).toBe(packagedLegacy);
  });

  it('initializeStorage invokes storage.initialize() before deleteLegacyWorkspaceMetaFiles', async () => {
    const storage = await importFreshStorage();
    storage.initializeStorage();

    const initOrder = storageInitializeSpy.mock.invocationCallOrder[0];
    const deleteOrder = deleteLegacySpy.mock.invocationCallOrder[0];
    expect(initOrder).toBeLessThan(deleteOrder);
  });

  // Milestone 3 sub-chunk 3b: the daemon owns the legacy electron-store
  // import now, but `app.getPath` is Electron-only so main has to compute
  // the JSON paths and hand them over via the
  // `legacy.importElectronStoreIfNeeded` RPC. These tests pin the filename
  // derivation so dev/packaged profiles read the right files.
  it('getLegacyElectronStorePaths returns dev-suffixed filenames when isPackaged=false', async () => {
    const storage = await importFreshStorage();
    const paths = storage.getLegacyElectronStorePaths();
    expect(paths).toEqual({
      appSettingsPath: path.join('/mock/userData', 'app-settings-dev.json'),
      providerSettingsPath: path.join('/mock/userData', 'provider-settings-dev.json'),
      taskHistoryPath: path.join('/mock/userData', 'task-history-dev.json'),
    });
  });

  it('getLegacyElectronStorePaths returns unsuffixed filenames when isPackaged=true', async () => {
    electronState.isPackaged = true;
    const storage = await importFreshStorage();
    const paths = storage.getLegacyElectronStorePaths();
    expect(paths).toEqual({
      appSettingsPath: path.join('/mock/userData', 'app-settings.json'),
      providerSettingsPath: path.join('/mock/userData', 'provider-settings.json'),
      taskHistoryPath: path.join('/mock/userData', 'task-history.json'),
    });
  });
});
