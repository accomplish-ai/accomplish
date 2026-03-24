import { describe, it, expect } from 'vitest';
import { hashNavigationPattern, summarizeSession, isSameNavigation } from './compactor';
import type { SnapshotElement, SessionHistoryEntry } from './types';

describe('compactor', () => {
  describe('hashNavigationPattern', () => {
    it('should hash navigation elements', () => {
      const elements: SnapshotElement[] = [
        { ref: 'e1', role: 'navigation', name: 'Main Nav' },
        { ref: 'e2', role: 'button', name: 'Click Me' },
        { ref: 'e3', role: 'banner', name: 'Header' },
      ];

      const hash = hashNavigationPattern(elements);
      expect(hash).toHaveLength(8);
    });

    it('should return empty string for no nav elements', () => {
      const elements: SnapshotElement[] = [{ ref: 'e1', role: 'button', name: 'Click Me' }];

      const hash = hashNavigationPattern(elements);
      expect(hash).toBe('');
    });

    it('should produce same hash for same nav pattern', () => {
      const elements1: SnapshotElement[] = [{ ref: 'e1', role: 'navigation', name: 'Main Nav' }];
      const elements2: SnapshotElement[] = [{ ref: 'e99', role: 'navigation', name: 'Main Nav' }];

      expect(hashNavigationPattern(elements1)).toBe(hashNavigationPattern(elements2));
    });
  });

  describe('summarizeSession', () => {
    it('should return empty for no history', () => {
      expect(summarizeSession([])).toBe('');
    });

    it('should format single page', () => {
      const history: SessionHistoryEntry[] = [
        { url: 'https://example.com', title: 'Home', timestamp: Date.now(), actionsTaken: [] },
      ];
      expect(summarizeSession(history)).toBe('Currently on: Home');
    });

    it('should format multiple pages with arrows', () => {
      const history: SessionHistoryEntry[] = [
        { url: 'https://example.com', title: 'Home', timestamp: Date.now(), actionsTaken: [] },
        {
          url: 'https://example.com/about',
          title: 'About',
          timestamp: Date.now(),
          actionsTaken: [],
        },
      ];
      expect(summarizeSession(history)).toBe('Navigation: Home → About');
    });

    it('should limit to 5 most recent', () => {
      const history: SessionHistoryEntry[] = Array.from({ length: 10 }, (_, i) => ({
        url: `https://example.com/page${i}`,
        title: `Page ${i}`,
        timestamp: Date.now(),
        actionsTaken: [],
      }));

      const summary = summarizeSession(history);
      expect(summary).not.toContain('Page 0');
      expect(summary).toContain('Page 9');
    });
  });

  describe('isSameNavigation', () => {
    it('should return true for matching hashes', () => {
      expect(isSameNavigation('abc12345', 'abc12345')).toBe(true);
    });

    it('should return false for empty hashes', () => {
      expect(isSameNavigation('', '')).toBe(false);
    });

    it('should return false for different hashes', () => {
      expect(isSameNavigation('abc12345', 'xyz67890')).toBe(false);
    });
  });
});
