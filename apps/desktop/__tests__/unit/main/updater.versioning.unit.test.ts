/**
 * Unit tests for the pure version/manifest helpers (updater/versioning.ts).
 *
 * These are pure functions — no Electron, no network, no filesystem. Kept
 * separate from the orchestrator tests so semver edge cases don't have to
 * pay the cost of the mock setup that manual-manifest tests need.
 */

import { describe, it, expect } from 'vitest';

import { isNewer, normalizeVersion, parseManifest } from '../../../src/main/updater/versioning';

describe('versioning', () => {
  describe('normalizeVersion', () => {
    it('preserves pre-release qualifiers via valid()', () => {
      expect(normalizeVersion('1.2.3-beta.1')).toBe('1.2.3-beta.1');
      expect(normalizeVersion('1.2.4-rc.0')).toBe('1.2.4-rc.0');
    });

    it('strips build metadata (per semver spec; irrelevant for comparison)', () => {
      // semver.valid() normalizes away build metadata — which is what we want,
      // since semver treats `1.2.3+a` and `1.2.3+b` as equal precedence anyway.
      expect(normalizeVersion('1.2.3+build.5')).toBe('1.2.3');
    });

    it('coerces short/prefixed forms', () => {
      expect(normalizeVersion('1.2')).toBe('1.2.0');
      expect(normalizeVersion('v1.2.3')).toBe('1.2.3');
    });

    it('returns null for uncoerceable input', () => {
      expect(normalizeVersion('')).toBeNull();
      expect(normalizeVersion('not-a-version')).toBeNull();
      expect(normalizeVersion('garbage')).toBeNull();
    });
  });

  describe('isNewer', () => {
    it('handles release vs. pre-release ordering correctly', () => {
      expect(isNewer('1.2.3-beta.1', '1.2.3')).toBe(false);
      expect(isNewer('1.2.4-rc.0', '1.2.3')).toBe(true);
      expect(isNewer('1.2.4', '1.2.4-rc.0')).toBe(true);
    });

    it('ignores build metadata per semver spec', () => {
      expect(isNewer('1.2.3+build.5', '1.2.3')).toBe(false);
      expect(isNewer('1.2.4+build.5', '1.2.3')).toBe(true);
    });

    it('returns false (never throws) for uncoerceable input', () => {
      expect(isNewer('garbage', '1.2.3')).toBe(false);
      expect(isNewer('1.2.3', 'garbage')).toBe(false);
      expect(isNewer('', '1.2.3')).toBe(false);
    });
  });

  describe('parseManifest', () => {
    it('returns minimal {version, path} shape on valid YAML', () => {
      const yaml = `version: 1.2.3\npath: https://x.example.com/a.exe\nsha512: abc\nreleaseDate: '2026-01-01'\n`;
      expect(parseManifest(yaml)).toEqual({
        version: '1.2.3',
        path: 'https://x.example.com/a.exe',
      });
    });

    it('returns null for malformed YAML', () => {
      expect(parseManifest('\x00\xff not valid yaml\x00')).toBeNull();
    });

    it('returns null when version or path is missing', () => {
      expect(parseManifest('path: https://x.example.com/a.exe\n')).toBeNull();
      expect(parseManifest('version: 1.2.3\n')).toBeNull();
    });

    it('returns null when version or path is not a string', () => {
      expect(parseManifest('version: 123\npath: https://x.example.com/a.exe\n')).toBeNull();
      expect(parseManifest('version: "1.2.3"\npath: [https://x.example.com]\n')).toBeNull();
    });

    it('returns null for non-object root', () => {
      expect(parseManifest('just a string')).toBeNull();
      expect(parseManifest('')).toBeNull();
    });
  });
});
