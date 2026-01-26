import { join } from 'path';
import { mkdirSync } from 'fs';

/**
 * Get platform-specific data directory for browser data
 */
export function getPlatformDataDir(): string {
  const homeDir = process.env.HOME || process.env.USERPROFILE || '';

  if (process.platform === 'darwin') {
    return join(homeDir, 'Library', 'Application Support', 'Accomplish', 'dev-browser');
  } else if (process.platform === 'win32') {
    return join(process.env.APPDATA || homeDir, 'Accomplish', 'dev-browser');
  } else {
    return join(homeDir, '.accomplish', 'dev-browser');
  }
}

/**
 * Get profile directory for specific browser type
 */
export function getProfileDir(browserType: 'chrome' | 'playwright'): string {
  const baseDir = getPlatformDataDir();
  const profileDir = join(baseDir, 'profiles', `${browserType}-profile`);
  return profileDir;
}

/**
 * Ensure profile directory exists
 */
export function ensureProfileDir(browserType: 'chrome' | 'playwright'): string {
  const dir = getProfileDir(browserType);
  mkdirSync(dir, { recursive: true });
  return dir;
}
