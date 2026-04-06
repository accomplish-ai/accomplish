import type { Database } from 'better-sqlite3';
import { app } from 'electron';
import {
  importAppSettings,
  importProviderSettings,
  importTaskHistory,
} from './store-import-helpers';

const LEGACY_IMPORT_KEY = 'legacy_electron_store_import_complete';

function wasLegacyImportAttempted(db: Database): boolean {
  try {
    const result = db
      .prepare('SELECT value FROM schema_meta WHERE key = ?')
      .get(LEGACY_IMPORT_KEY) as { value: string } | undefined;
    return result?.value === 'true';
  } catch {
    return false;
  }
}

function hasExistingUserData(db: Database): boolean {
  try {
    const appSettings = db
      .prepare('SELECT onboarding_complete FROM app_settings WHERE id = 1')
      .get() as { onboarding_complete: number } | undefined;
    if (appSettings?.onboarding_complete === 1) {
      return true;
    }

    const providerCount = db.prepare('SELECT COUNT(*) as count FROM providers').get() as
      | { count: number }
      | undefined;
    if (providerCount && providerCount.count > 0) {
      return true;
    }

    const taskCount = db.prepare('SELECT COUNT(*) as count FROM tasks').get() as
      | { count: number }
      | undefined;
    if (taskCount && taskCount.count > 0) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

function markLegacyImportComplete(db: Database): void {
  try {
    db.prepare('INSERT OR REPLACE INTO schema_meta (key, value) VALUES (?, ?)').run(
      LEGACY_IMPORT_KEY,
      'true',
    );
  } catch (err) {
    console.error('[LegacyImport] Failed to mark import complete:', err);
  }
}

export function importLegacyElectronStoreData(db: Database): void {
  if (wasLegacyImportAttempted(db)) {
    console.log('[LegacyImport] Legacy import already completed, skipping');
    return;
  }

  if (hasExistingUserData(db)) {
    console.log(
      '[LegacyImport] Database has existing user data - marking import complete without running',
    );
    markLegacyImportComplete(db);
    return;
  }

  console.log('[LegacyImport] Checking for legacy electron-store data...');

  const isPackaged = app.isPackaged;
  importAppSettings(db, isPackaged);
  importProviderSettings(db, isPackaged);
  importTaskHistory(db, isPackaged);

  markLegacyImportComplete(db);

  console.log('[LegacyImport] Legacy import complete');
}
