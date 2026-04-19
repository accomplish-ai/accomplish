/**
 * Persistent store for the auto-updater's daily-check throttle. Kept in its own
 * module so both the native path (updater/index.ts) and the manual path
 * (updater/manual-manifest.ts) can record a successful check without circular
 * imports, and so `autoCheckForUpdates()` throttles to once-per-day on every
 * platform — not only on macOS / AppImage.
 */

import Store from 'electron-store';

const CHECK_INTERVAL_MS = 1 * 24 * 60 * 60 * 1000;

let store: Store<{ lastUpdateCheck: number }> | null = null;

function getStore(): Store<{ lastUpdateCheck: number }> {
  if (!store) {
    store = new Store<{ lastUpdateCheck: number }>({
      name: 'updater',
      defaults: { lastUpdateCheck: 0 },
    });
  }
  return store;
}

export function shouldAutoCheck(): boolean {
  const lastCheck = getStore().get('lastUpdateCheck');
  if (!lastCheck) {
    return true;
  }
  return Date.now() - lastCheck > CHECK_INTERVAL_MS;
}

/** Call after a successful check (native OR manual) to reset the daily throttle. */
export function recordCheckedNow(): void {
  getStore().set('lastUpdateCheck', Date.now());
}
