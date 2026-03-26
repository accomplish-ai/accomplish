import type { Database } from 'better-sqlite3';
import { FutureSchemaError, MigrationError } from './errors.js';

export interface Migration {
  version: number;
  up: (db: Database) => void;
  down?: (db: Database) => void;
}

import { migration as v001 } from './v001-initial.js';
import { migration as v002 } from './v002-azure-foundry.js';
import { migration as v003 } from './v003-lmstudio.js';
import { migration as v004 } from './v004-openai-base-url.js';
import { migration as v005 } from './v005-task-todos.js';
import { migration as v006 } from './v006-skills.js';
import { migration as v007 } from './v007-connectors.js';
import { migration as v008 } from './v008-theme.js';
import { migration as v009 } from './v009-favorites.js';
import { migration as v010 } from './v010-sandbox.js';
import { migration as v011 } from './v011-workspace-tasks.js';
import { migration as v012 } from './v012-cloud-browsers.js';
import { migration as v013 } from './v013-daemon.js';
import { migration as v014 } from './v014-desktop-blocklist.js';
import { migration as v015 } from './v015-provider-base-url.js';
import { migration as v016 } from './v016-notifications.js';
import { migration as v017 } from './v017-nim-config.js';
import { migration as v018 } from './v018-copilot-provider.js';
import { migration as v019 } from './v019-huggingface-local.js';
import { migration as v020 } from './v020-messaging.js';

const migrations: Migration[] = [
  v001,
  v002,
  v003,
  v004,
  v005,
  v006,
  v007,
  v008,
  v009,
  v010,
  v011,
  v012,
  v013,
  v014,
  v015,
  v016,
  v017,
  v018,
  v019,
  v020,
];
export function registerMigration(migration: Migration): void {
  migrations.push(migration);
  migrations.sort((a, b) => a.version - b.version);
}

export const CURRENT_VERSION = 20;
export function getStoredVersion(db: Database): number {
  try {
    const tableExists = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_meta'")
      .get();

    if (!tableExists) {
      return 0;
    }

    const row = db.prepare("SELECT value FROM schema_meta WHERE key = 'version'").get() as
      | { value: string }
      | undefined;

    return row ? parseInt(row.value, 10) : 0;
  } catch {
    return 0;
  }
}

export function setStoredVersion(db: Database, version: number): void {
  db.prepare("INSERT OR REPLACE INTO schema_meta (key, value) VALUES ('version', ?)").run(
    String(version),
  );
}

export function runMigrations(db: Database): void {
  const storedVersion = getStoredVersion(db);

  console.log(`[Migrations] Stored version: ${storedVersion}, App version: ${CURRENT_VERSION}`);

  if (storedVersion > CURRENT_VERSION) {
    throw new FutureSchemaError(storedVersion, CURRENT_VERSION);
  }

  if (storedVersion === CURRENT_VERSION) {
    console.log('[Migrations] Database is up to date');
    return;
  }

  for (const migration of migrations) {
    if (migration.version > storedVersion) {
      console.log(`[Migrations] Running migration v${migration.version}`);

      try {
        db.transaction(() => {
          migration.up(db);
          setStoredVersion(db, migration.version);
        })();
        console.log(`[Migrations] Migration v${migration.version} complete`);
      } catch (err) {
        throw new MigrationError(
          migration.version,
          err instanceof Error ? err : new Error(String(err)),
        );
      }
    }
  }

  console.log('[Migrations] All migrations complete');
}

export { FutureSchemaError, MigrationError, CorruptDatabaseError } from './errors.js';
