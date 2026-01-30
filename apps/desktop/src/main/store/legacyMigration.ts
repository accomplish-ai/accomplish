// apps/desktop/src/main/store/legacyMigration.ts

import { app } from 'electron';
import path from 'path';
import fs from 'fs';

/**
 * Legacy userData paths that may contain data from previous app versions.
 * Ordered from most recent to oldest.
 */
function getLegacyPaths(): string[] {
  const appDataPath = app.getPath('appData');
  return [
    // Only migrate from DATA_SCHEMA_VERSION=2 path
    path.join(appDataPath, '@accomplish', 'desktop-v2'),
  ];
}

/**
 * Files to migrate from legacy path to new path.
 * Includes database files and secure storage.
 */
const FILES_TO_MIGRATE = [
  'openwork.db',
  'openwork.db-wal',
  'openwork.db-shm',
  'secure-storage.json',
];

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
    const currentDb = path.join(currentPath, 'openwork.db');
    if (fs.existsSync(currentDb)) {
      console.log('[Migration] Current userData already has data, skipping migration');
      return false;
    }

    // Look for legacy data in known paths
    let legacyPaths: string[];
    try {
      legacyPaths = getLegacyPaths();
    } catch (err) {
      console.error('[Migration] Failed to get legacy paths:', err);
      return false;
    }

    for (const legacyPath of legacyPaths) {
      try {
        if (!fs.existsSync(legacyPath)) {
          continue;
        }

        const legacyDb = path.join(legacyPath, 'openwork.db');
        if (!fs.existsSync(legacyDb)) {
          continue;
        }

        console.log(`[Migration] Found legacy data at: ${legacyPath}`);

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
        let migratedCount = 0;
        for (const file of FILES_TO_MIGRATE) {
          const src = path.join(legacyPath, file);
          const dest = path.join(currentPath, file);

          try {
            if (fs.existsSync(src)) {
              fs.copyFileSync(src, dest);
              console.log(`[Migration] Copied: ${file}`);
              migratedCount++;
            }
          } catch (err) {
            console.error(`[Migration] Failed to copy ${file}:`, err);
            // Continue with other files even if one fails
          }
        }

        console.log(`[Migration] Migration complete. Copied ${migratedCount} files.`);
        console.log(`[Migration] Original data preserved at: ${legacyPath}`);
        return migratedCount > 0;
      } catch (err) {
        console.error(`[Migration] Error processing legacy path ${legacyPath}:`, err);
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
