/**
 * Unit tests for the blocklist module.
 *
 * These tests validate:
 * - Default blocklist contains expected sensitive apps
 * - Window title matching with regex patterns
 * - Custom entries can be added/merged
 * - Blocklist deduplication by appName
 * - Case-insensitive matching
 * - Invalid regex fallback to string includes
 */

import { describe, expect, it } from 'vitest';
import { DEFAULT_BLOCKLIST, checkBlocklist, mergeBlocklists } from '../blocklist.js';
import type { BlocklistEntry } from '../types.js';

describe('DEFAULT_BLOCKLIST', () => {
  it('contains password managers', () => {
    const passwordManagers = DEFAULT_BLOCKLIST.filter((entry) =>
      entry.reason.includes('Password manager'),
    );
    expect(passwordManagers.length).toBeGreaterThanOrEqual(5);

    const names = passwordManagers.map((e) => e.appName);
    expect(names).toContain('1Password');
    expect(names).toContain('Bitwarden');
    expect(names).toContain('LastPass');
    expect(names).toContain('KeePass');
    expect(names).toContain('Dashlane');
  });

  it('contains system security tools', () => {
    const securityTools = DEFAULT_BLOCKLIST.filter(
      (entry) =>
        entry.reason.includes('keychain') ||
        entry.reason.includes('credential') ||
        entry.reason.includes('security'),
    );
    expect(securityTools.length).toBeGreaterThanOrEqual(1);
  });

  it('contains admin tools', () => {
    const adminTools = DEFAULT_BLOCKLIST.filter(
      (entry) => entry.reason.includes('registry') || entry.reason.includes('Registry'),
    );
    expect(adminTools.length).toBeGreaterThanOrEqual(1);
  });

  it('every entry has required fields', () => {
    for (const entry of DEFAULT_BLOCKLIST) {
      expect(entry.appName).toBeTruthy();
      expect(entry.pattern).toBeTruthy();
      expect(entry.reason).toBeTruthy();
    }
  });
});

describe('checkBlocklist', () => {
  const testBlocklist: BlocklistEntry[] = [
    { appName: '1Password', pattern: '1Password', reason: 'Password manager' },
    { appName: 'Chase Bank', pattern: 'Chase', reason: 'Banking app' },
    { appName: 'Test Regex', pattern: 'Bank.*Online', reason: 'Banking regex' },
  ];

  it('matches exact window titles', () => {
    const result = checkBlocklist('1Password - Vault', testBlocklist);
    expect(result).toBeDefined();
    expect(result?.appName).toBe('1Password');
  });

  it('matches case-insensitively', () => {
    const result = checkBlocklist('1password - VAULT', testBlocklist);
    expect(result).toBeDefined();
    expect(result?.appName).toBe('1Password');
  });

  it('returns undefined for non-matching titles', () => {
    const result = checkBlocklist('Notepad', testBlocklist);
    expect(result).toBeUndefined();
  });

  it('matches window titles with regex patterns', () => {
    const result = checkBlocklist('Bank of America Online', testBlocklist);
    expect(result).toBeDefined();
    expect(result?.appName).toBe('Test Regex');
  });

  it('returns the first matching entry', () => {
    const result = checkBlocklist('Chase Bank Online', testBlocklist);
    expect(result).toBeDefined();
    expect(result?.appName).toBe('Chase Bank');
  });

  it('handles empty blocklist', () => {
    const result = checkBlocklist('1Password', []);
    expect(result).toBeUndefined();
  });

  it('handles empty window title', () => {
    const result = checkBlocklist('', testBlocklist);
    expect(result).toBeUndefined();
  });

  it('falls back to string includes for invalid regex', () => {
    const invalidRegexList: BlocklistEntry[] = [
      {
        appName: 'BadRegex',
        pattern: '[invalid(regex',
        reason: 'Invalid regex pattern',
      },
    ];
    // Should not throw, should fall back to includes
    const result = checkBlocklist('Something with [invalid(regex inside', invalidRegexList);
    expect(result).toBeDefined();
    expect(result?.appName).toBe('BadRegex');
  });

  it('falls back to string includes for invalid regex — no match', () => {
    const invalidRegexList: BlocklistEntry[] = [
      {
        appName: 'BadRegex',
        pattern: '[invalid(regex',
        reason: 'Invalid regex pattern',
      },
    ];
    const result = checkBlocklist('Notepad', invalidRegexList);
    expect(result).toBeUndefined();
  });
});

describe('mergeBlocklists', () => {
  it('returns defaults when no custom entries provided', () => {
    const merged = mergeBlocklists([]);
    expect(merged.length).toBe(DEFAULT_BLOCKLIST.length);
  });

  it('adds custom entries', () => {
    const custom: BlocklistEntry[] = [
      { appName: 'My Banking App', pattern: 'MyBank', reason: 'Custom banking' },
    ];
    const merged = mergeBlocklists(custom);
    expect(merged.length).toBe(DEFAULT_BLOCKLIST.length + 1);
    expect(merged.some((e) => e.appName === 'My Banking App')).toBe(true);
  });

  it('deduplicates by appName (custom overrides default)', () => {
    const custom: BlocklistEntry[] = [
      {
        appName: '1Password',
        pattern: '1Password.*Custom',
        reason: 'Updated reason',
      },
    ];
    const merged = mergeBlocklists(custom);
    // Should not duplicate — same appName
    const passwordEntries = merged.filter((e) => e.appName === '1Password');
    expect(passwordEntries.length).toBe(1);
    // Custom should override default
    expect(passwordEntries[0]?.reason).toBe('Updated reason');
  });

  it('preserves all default entries when no conflicts', () => {
    const custom: BlocklistEntry[] = [
      { appName: 'UniqueApp', pattern: 'Unique', reason: 'Unique reason' },
    ];
    const merged = mergeBlocklists(custom);
    for (const defaultEntry of DEFAULT_BLOCKLIST) {
      expect(merged.some((e) => e.appName === defaultEntry.appName)).toBe(true);
    }
  });
});
