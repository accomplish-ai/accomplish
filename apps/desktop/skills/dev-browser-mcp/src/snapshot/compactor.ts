/**
 * Context compaction utilities for snapshot optimization.
 */

import { createHash } from 'crypto';
import type { SnapshotElement, SessionHistoryEntry } from './types';

/**
 * Hash navigation pattern elements for deduplication.
 * If nav/footer is identical to previous page, can be skipped.
 */
export function hashNavigationPattern(elements: SnapshotElement[]): string {
  const navElements = elements.filter(e =>
    e.role === 'navigation' ||
    e.role === 'banner' ||
    e.role === 'contentinfo'
  );

  if (navElements.length === 0) return '';

  const signature = navElements
    .map(e => `${e.role}:${e.name ?? ''}`)
    .sort()
    .join('|');

  return createHash('md5').update(signature).digest('hex').slice(0, 8);
}

/**
 * Generate compact session history for context.
 */
export function summarizeSession(history: SessionHistoryEntry[]): string {
  if (history.length === 0) return '';
  if (history.length === 1) return `Currently on: ${history[0].title || 'Page'}`;

  const recent = history.slice(-5);
  return `Navigation: ${recent.map(h => h.title || 'Page').join(' → ')}`;
}

/**
 * Check if two navigation patterns are identical.
 */
export function isSameNavigation(hash1: string, hash2: string): boolean {
  return hash1 !== '' && hash1 === hash2;
}
