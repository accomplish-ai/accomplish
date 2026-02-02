// apps/desktop/src/main/store/legacyMigration.ts

import { app } from 'electron';
import path from 'path';
import fs from 'fs';

/**
 * Legacy userData paths that may contain data from previous app versions.
 * Each entry includes the path and optional database name override for that path.
 * Ordered from most recent to oldest.
 */
interface LegacyPath {
  path: string;
  /** Database name used in this legacy path (defaults to current name if not specified) */
  dbName?: string;
}

function getLegacyPaths(): LegacyPath[] {
  const appDataPath = app.getPath('appData');
  const isPackaged = app.isPackaged;

  return [
    // Previous Accomplish paths (same db name)
    { path: path.join(appDataPath, 'Accomplish') },
    { path: path.join(appDataPath, 'accomplish') },
    // Openwork paths (before rebrand - different db name)
    {
      path: path.join(appDataPath, 'Openwork'),
      dbName: isPackaged ? 'openwork.db' : 'openwork-dev.db'
    },
    {
      path: path.join(appDataPath, 'openwork'),
      dbName: isPackaged ? 'openwork.db' : 'openwork-dev.db'
    },
    // Legacy @accomplish paths (used openwork.db naming)
    {
      path: path.join(appDataPath, '@accomplish', 'desktop-v2'),
      dbName: isPackaged ? 'openwork.db' : 'openwork-dev.db'
    },
  ];
}

const NEW_DB_NAME = app.isPackaged ? 'accomplish.db' : 'accomplish-dev.db';
const SECURE_STORAGE_NAME = app.isPackaged ? 'secure-storage.json' : 'secure-storage-dev.json';

/**
 * Get files to migrate for a given legacy path.
 * Handles different database names for different legacy paths.
 */
function getFilesToMigrate(legacyDbName?: string): Array<{ src: string; dest: string }> {
  const srcDbName = legacyDbName || NEW_DB_NAME;
  return [
    { src: srcDbName, dest: NEW_DB_NAME },
    { src: `${srcDbName}-wal`, dest: `${NEW_DB_NAME}-wal` },
    { src: `${srcDbName}-shm`, dest: `${NEW_DB_NAME}-shm` },
    { src: SECURE_STORAGE_NAME, dest: SECURE_STORAGE_NAME },
  ];
}

/**
 * Check for and migrate data from legacy userData paths.
 * Called once at startup before database initialization.
 *
 * Migration strategy:
 * - If new userData already has a database, skip migration (user already migrated)
 * - Otherwise, look for legacy paths and copy data if found
 * - We COPY (not move) to preserve original as a backup
 *
 * @returns true if migration was performed, false otherwise
 */
export function migrateLegacyData(): boolean {
  try {
    const currentPath = app.getPath('userData');

    // If current path already has a database, skip migration
    const currentDb = path.join(currentPath, NEW_DB_NAME);
    if (fs.existsSync(currentDb)) {
      console.log('[Migration] Current userData already has data, skipping migration');
      return false;
    }

    // Check if current path has legacy database names that need renaming
    const legacyDbNames = ['openwork.db', 'openwork-dev.db'];
    for (const legacyDbName of legacyDbNames) {
      const currentLegacyDb = path.join(currentPath, legacyDbName);
      if (fs.existsSync(currentLegacyDb)) {
        console.log(`[Migration] Found legacy database name in current userData path: ${legacyDbName}`);
        const filesToMigrate = getFilesToMigrate(legacyDbName);
        let migratedCount = 0;
        for (const file of filesToMigrate) {
          const src = path.join(currentPath, file.src);
          const dest = path.join(currentPath, file.dest);
          // Skip if src and dest are the same
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

    // Look for legacy data in known paths
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

        // Determine which database name to look for in this legacy path
        const srcDbName = legacyPath.dbName || NEW_DB_NAME;
        const legacyDb = path.join(legacyPath.path, srcDbName);
        if (!fs.existsSync(legacyDb)) {
          continue;
        }

        console.log(`[Migration] Found legacy data at: ${legacyPath.path}`);

        // Ensure current userData directory exists
        try {
          if (!fs.existsSync(currentPath)) {
            fs.mkdirSync(currentPath, { recursive: true });
            console.log(`[Migration] Created userData directory: ${currentPath}`);
          }
        } catch (err) {
          console.error('[Migration] Failed to create userData directory:', err);
          return false;
        }

        // Copy files from legacy path to new path
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
            // Continue with other files even if one fails
          }
        }

        console.log(`[Migration] Migration complete. Copied ${migratedCount} files.`);
        console.log(`[Migration] Original data preserved at: ${legacyPath.path}`);
        return migratedCount > 0;
      } catch (err) {
        console.error(`[Migration] Error processing legacy path ${legacyPath.path}:`, err);
        // Continue with next legacy path
      }
    }

    console.log('[Migration] No legacy data found to migrate');
    return false;
  } catch (err) {
    console.error('[Migration] Unexpected error during migration:', err);
    return false;
  }
}
