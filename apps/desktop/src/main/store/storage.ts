/**
 * storage.ts — path-derivation helpers for Electron main.
 *
 * Milestone 5 of the daemon-only-SQLite migration
 * (plan: /Users/yanai/.claude/plans/squishy-exploring-hamster.md).
 *
 * Pre-M5 this module held the main-side `StorageAPI` singleton
 * (`createStorage` + `getDatabase`) that opened the SQLite file and
 * wrapped secure storage. Both desktop and the daemon touched the DB
 * concurrently, which was the driver of the entire migration.
 *
 * Post-M5 the daemon is the sole owner. Main no longer opens
 * `accomplish.db`, the `secure-storage.json` file, or the legacy
 * `workspace-meta.db`. The only thing left on this side is *path math*
 * so main can (a) hand the right paths to the daemon on spawn, and
 * (b) surface the legacy electron-store JSON paths the daemon imports
 * from on first boot.
 *
 * `getLegacyMetaDbPath` stays because `app.getPath('userData')` is an
 * Electron-only API — the daemon can't derive it itself, and the main
 * DB's v030 migration still needs the right file to import from +
 * delete.
 */
import { app } from 'electron';
import path from 'path';

export function getDatabasePath(): string {
  const dbName = app.isPackaged ? 'accomplish.db' : 'accomplish-dev.db';
  return path.join(app.getPath('userData'), dbName);
}

/**
 * Legacy `workspace-meta{.db,-wal,-shm}` path. The daemon imports then
 * deletes it via the v030 migration; main hands the path over via CLI
 * arg / environment but does not open it.
 */
export function getLegacyMetaDbPath(): string {
  const fileName = app.isPackaged ? 'workspace-meta.db' : 'workspace-meta-dev.db';
  return path.join(app.getPath('userData'), fileName);
}

/**
 * Paths to the legacy `electron-store` JSON files (app-settings,
 * provider-settings, task-history). Milestone 3 sub-chunk 3b moved the
 * importer into the daemon; main hands these paths to the
 * `legacy.importElectronStoreIfNeeded` RPC post-bootstrap and the
 * daemon reads + imports them directly (guarded by a `schema_meta` flag,
 * idempotent across boots).
 *
 * The filename + path derivation has to match what `electron-store`
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
