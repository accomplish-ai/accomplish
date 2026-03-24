import { app } from 'electron';
import path from 'path';
import fs from 'fs';

interface LegacyPath {
  path: string;
  dbName?: string;
}

function getLegacyPaths(): LegacyPath[] {
  const appDataPath = app.getPath('appData');
  const isPackaged = app.isPackaged;

  return [
    { path: path.join(appDataPath, 'Accomplish') },
    { path: path.join(appDataPath, 'accomplish') },
    {
      path: path.join(appDataPath, 'Openwork'),
      dbName: isPackaged ? 'openwork.db' : 'openwork-dev.db',
    },
    {
      path: path.join(appDataPath, 'openwork'),
      dbName: isPackaged ? 'openwork.db' : 'openwork-dev.db',
    },
    {
      path: path.join(appDataPath, '@accomplish', 'desktop-v2'),
      dbName: isPackaged ? 'openwork.db' : 'openwork-dev.db',
    },
  ];
}

const NEW_DB_NAME = app.isPackaged ? 'accomplish.db' : 'accomplish-dev.db';
const SECURE_STORAGE_NAME = app.isPackaged ? 'secure-storage.json' : 'secure-storage-dev.json';

function getFilesToMigrate(legacyDbName?: string): Array<{ src: string; dest: string }> {
  const srcDbName = legacyDbName || NEW_DB_NAME;
  return [
    { src: srcDbName, dest: NEW_DB_NAME },
    { src: `${srcDbName}-wal`, dest: `${NEW_DB_NAME}-wal` },
    { src: `${srcDbName}-shm`, dest: `${NEW_DB_NAME}-shm` },
    { src: SECURE_STORAGE_NAME, dest: SECURE_STORAGE_NAME },
  ];
}

export function migrateLegacyData(): boolean {
  try {
    const currentPath = app.getPath('userData');

    const currentDb = path.join(currentPath, NEW_DB_NAME);
    if (fs.existsSync(currentDb)) {
      console.log('[Migration] Current userData already has data, skipping migration');
      return false;
    }

    const legacyDbNames = ['openwork.db', 'openwork-dev.db'];
    for (const legacyDbName of legacyDbNames) {
      const currentLegacyDb = path.join(currentPath, legacyDbName);
      if (fs.existsSync(currentLegacyDb)) {
        console.log(
          `[Migration] Found legacy database name in current userData path: ${legacyDbName}`,
        );
        const filesToMigrate = getFilesToMigrate(legacyDbName);
        let migratedCount = 0;
        for (const file of filesToMigrate) {
          const src = path.join(currentPath, file.src);
          const dest = path.join(currentPath, file.dest);
          if (file.src === file.dest) continue;
          try {
            if (fs.existsSync(src)) {
              fs.copyFileSync(src, dest);
              console.log(`[Migration] Copied: ${file.src} -> ${file.dest}`);
              migratedCount++;
            }
          } catch (err) {
            console.error(`[Migration] Failed to copy ${file.src}:`, err);
          }
        }
        if (migratedCount > 0) {
          console.log(`[Migration] In-place migration complete. Copied ${migratedCount} files.`);
          return true;
        }
      }
    }

    let legacyPaths: LegacyPath[];
    try {
      legacyPaths = getLegacyPaths();
    } catch (err) {
      console.error('[Migration] Failed to get legacy paths:', err);
      return false;
    }

    for (const legacyPath of legacyPaths) {
      try {
        if (!fs.existsSync(legacyPath.path)) {
          continue;
        }

        const srcDbName = legacyPath.dbName || NEW_DB_NAME;
        const legacyDb = path.join(legacyPath.path, srcDbName);
        if (!fs.existsSync(legacyDb)) {
          continue;
        }

        console.log(`[Migration] Found legacy data at: ${legacyPath.path}`);

        try {
          if (!fs.existsSync(currentPath)) {
            fs.mkdirSync(currentPath, { recursive: true });
            console.log(`[Migration] Created userData directory: ${currentPath}`);
          }
        } catch (err) {
          console.error('[Migration] Failed to create userData directory:', err);
          return false;
        }

        const filesToMigrate = getFilesToMigrate(legacyPath.dbName);
        let migratedCount = 0;
        for (const file of filesToMigrate) {
          const src = path.join(legacyPath.path, file.src);
          const dest = path.join(currentPath, file.dest);

          try {
            if (fs.existsSync(src)) {
              fs.copyFileSync(src, dest);
              console.log(`[Migration] Copied: ${file.src} -> ${file.dest}`);
              migratedCount++;
            }
          } catch (err) {
            console.error(`[Migration] Failed to copy ${file.src}:`, err);
          }
        }

        console.log(`[Migration] Migration complete. Copied ${migratedCount} files.`);
        console.log(`[Migration] Original data preserved at: ${legacyPath.path}`);
        return migratedCount > 0;
      } catch (err) {
        console.error(`[Migration] Error processing legacy path ${legacyPath.path}:`, err);
      }
    }

    console.log('[Migration] No legacy data found to migrate');
    return false;
  } catch (err) {
    console.error('[Migration] Unexpected error during migration:', err);
    return false;
  }
}
