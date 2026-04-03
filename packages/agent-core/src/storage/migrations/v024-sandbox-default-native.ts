import type { Database } from 'better-sqlite3';
import type { Migration } from './index.js';

export const migration: Migration = {
  version: 24,
  up: (db: Database) => {
    // WHY: Enable OS-level sandboxing by default for new and existing installations
    // to prevent unrestricted filesystem/network access by the AI agent. Existing
    // users who never explicitly chose a sandbox mode are upgraded from 'disabled'
    // (the old default) to 'native'.
    const row = db.prepare('SELECT sandbox_config FROM app_settings WHERE id = 1').get() as
      | { sandbox_config: string }
      | undefined;

    if (!row?.sandbox_config) {
      return;
    }

    try {
      const config = JSON.parse(row.sandbox_config);
      if (config.mode === 'disabled') {
        config.mode = 'native';
        db.prepare('UPDATE app_settings SET sandbox_config = ? WHERE id = 1').run(
          JSON.stringify(config),
        );
      }
    } catch {
      // If config is corrupt, leave it as-is; the app will apply defaults.
    }
  },
};
