/**
 * Sensitive App Blocklist
 *
 * Default blocklist entries for apps that should never be automated.
 * Users can extend this via storage settings.
 * Patterns are matched case-insensitively against window titles.
 */

import type { BlocklistEntry } from './types.js';

export const DEFAULT_BLOCKLIST: readonly BlocklistEntry[] = [
  // Password managers
  {
    appName: '1Password',
    pattern: '1Password',
    reason: 'Password manager — contains sensitive credentials',
  },
  {
    appName: 'Bitwarden',
    pattern: 'Bitwarden',
    reason: 'Password manager — contains sensitive credentials',
  },
  {
    appName: 'LastPass',
    pattern: 'LastPass',
    reason: 'Password manager — contains sensitive credentials',
  },
  {
    appName: 'KeePass',
    pattern: 'KeePass',
    reason: 'Password manager — contains sensitive credentials',
  },
  {
    appName: 'Dashlane',
    pattern: 'Dashlane',
    reason: 'Password manager — contains sensitive credentials',
  },

  // System security
  {
    appName: 'Keychain Access',
    pattern: 'Keychain Access',
    reason: 'macOS keychain — contains sensitive system credentials',
  },
  {
    appName: 'Credential Manager',
    pattern: 'Credential Manager',
    reason: 'Windows credential store — contains sensitive system credentials',
  },
  {
    appName: 'Windows Security',
    pattern: 'Windows Security',
    reason: 'System security settings',
  },

  // Admin tools
  {
    appName: 'Registry Editor',
    pattern: 'Registry Editor',
    reason: 'System registry — modifications can damage the OS',
  },
] as const;

/**
 * Check whether a window title matches any entry in the blocklist.
 * Returns the matching entry, or undefined if no match.
 */
export function checkBlocklist(
  windowTitle: string,
  blocklist: readonly BlocklistEntry[],
): BlocklistEntry | undefined {
  for (const entry of blocklist) {
    try {
      const regex = new RegExp(entry.pattern, 'i');
      if (regex.test(windowTitle)) {
        return entry;
      }
    } catch {
      // If the pattern is invalid regex, fall back to simple includes
      if (windowTitle.toLowerCase().includes(entry.pattern.toLowerCase())) {
        return entry;
      }
    }
  }
  return undefined;
}

/**
 * Merge default blocklist with user-provided custom entries.
 * Custom entries are appended; duplicates (by appName) are deduplicated.
 */
export function mergeBlocklists(customEntries: readonly BlocklistEntry[]): BlocklistEntry[] {
  const merged = new Map<string, BlocklistEntry>();

  for (const entry of DEFAULT_BLOCKLIST) {
    merged.set(entry.appName, entry);
  }

  for (const entry of customEntries) {
    merged.set(entry.appName, entry);
  }

  return Array.from(merged.values());
}
