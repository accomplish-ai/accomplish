// packages/core/mcp-tools/dev-browser-mcp/src/snapshot/differ.test.ts

import { describe, it, expect } from 'vitest';
import { diffSnapshots, formatDiff, compressRefList } from './differ.js';
import type { ParsedSnapshot, SnapshotElement } from './types.js';

function createSnapshot(elements: SnapshotElement[]): ParsedSnapshot {
  const map = new Map<string, SnapshotElement>();
  for (const el of elements) {
    map.set(el.ref, el);
  }
  return {
    url: 'https://example.com',
    title: 'Test Page',
    timestamp: Date.now(),
    elements: map,
    rawYaml: '',
  };
}

describe('diffSnapshots', () => {
  it('returns empty diff for identical snapshots', () => {
    const elements: SnapshotElement[] = [
      { ref: 'e1', role: 'button', name: 'Submit' },
      { ref: 'e2', role: 'textbox', name: 'Email' },
    ];
    const snapshot1 = createSnapshot(elements);
    const snapshot2 = createSnapshot(elements);

    const diff = diffSnapshots(snapshot1, snapshot2);

    expect(diff).not.toBeNull();
    expect(diff!.unchangedRefs).toEqual(['e1', 'e2']);
    expect(diff!.changes).toHaveLength(0);
  });

  it('detects added elements', () => {
    const prev = createSnapshot([
      { ref: 'e1', role: 'button', name: 'Submit' },
    ]);
    const curr = createSnapshot([
      { ref: 'e1', role: 'button', name: 'Submit' },
      { ref: 'e2', role: 'textbox', name: 'Email' },
    ]);

    const diff = diffSnapshots(prev, curr);

    expect(diff!.addedRefs).toContain('e2');
    expect(diff!.changes.find(c => c.ref === 'e2')?.changeType).toBe('added');
  });

  it('detects removed elements', () => {
    // Need enough unchanged elements to stay below 70% change threshold
    const prev = createSnapshot([
      { ref: 'e1', role: 'button', name: 'Submit' },
      { ref: 'e2', role: 'textbox', name: 'Email' },
      { ref: 'e3', role: 'heading', name: 'Title' },
      { ref: 'e4', role: 'paragraph', name: 'Description' },
    ]);
    const curr = createSnapshot([
      { ref: 'e1', role: 'button', name: 'Submit' },
      { ref: 'e3', role: 'heading', name: 'Title' },
      { ref: 'e4', role: 'paragraph', name: 'Description' },
    ]);

    const diff = diffSnapshots(prev, curr);

    expect(diff).not.toBeNull();
    expect(diff!.removedRefs).toContain('e2');
    expect(diff!.changes.find(c => c.ref === 'e2')?.changeType).toBe('removed');
  });

  it('detects value changes', () => {
    // Need enough unchanged elements to stay below 70% change threshold
    const prev = createSnapshot([
      { ref: 'e1', role: 'textbox', name: 'Email', value: '' },
      { ref: 'e2', role: 'button', name: 'Submit' },
      { ref: 'e3', role: 'heading', name: 'Title' },
      { ref: 'e4', role: 'paragraph', name: 'Description' },
    ]);
    const curr = createSnapshot([
      { ref: 'e1', role: 'textbox', name: 'Email', value: 'user@example.com' },
      { ref: 'e2', role: 'button', name: 'Submit' },
      { ref: 'e3', role: 'heading', name: 'Title' },
      { ref: 'e4', role: 'paragraph', name: 'Description' },
    ]);

    const diff = diffSnapshots(prev, curr);

    expect(diff).not.toBeNull();
    expect(diff!.changes).toHaveLength(1);
    expect(diff!.changes[0].changeType).toBe('modified');
    expect(diff!.changes[0].previousValue).toBe('');
    expect(diff!.changes[0].element.value).toBe('user@example.com');
  });

  it('detects disabled state changes', () => {
    // Need enough unchanged elements to stay below 70% change threshold
    const prev = createSnapshot([
      { ref: 'e1', role: 'button', name: 'Submit', disabled: true },
      { ref: 'e2', role: 'textbox', name: 'Email' },
      { ref: 'e3', role: 'heading', name: 'Title' },
      { ref: 'e4', role: 'paragraph', name: 'Description' },
    ]);
    const curr = createSnapshot([
      { ref: 'e1', role: 'button', name: 'Submit', disabled: false },
      { ref: 'e2', role: 'textbox', name: 'Email' },
      { ref: 'e3', role: 'heading', name: 'Title' },
      { ref: 'e4', role: 'paragraph', name: 'Description' },
    ]);

    const diff = diffSnapshots(prev, curr);

    expect(diff).not.toBeNull();
    expect(diff!.changes).toHaveLength(1);
    expect(diff!.changes[0].previousDisabled).toBe(true);
  });

  it('returns null when >70% changed', () => {
    const prev = createSnapshot([
      { ref: 'e1', role: 'button', name: 'A' },
      { ref: 'e2', role: 'button', name: 'B' },
      { ref: 'e3', role: 'button', name: 'C' },
    ]);
    const curr = createSnapshot([
      { ref: 'e1', role: 'button', name: 'X' },
      { ref: 'e2', role: 'button', name: 'Y' },
      { ref: 'e3', role: 'button', name: 'Z' },
    ]);

    const diff = diffSnapshots(prev, curr);

    expect(diff).toBeNull();
  });
});

describe('compressRefList', () => {
  it('compresses consecutive refs into ranges', () => {
    expect(compressRefList(['e1', 'e2', 'e3', 'e5', 'e6', 'e10'])).toBe('e1-e3, e5-e6, e10');
  });

  it('handles single refs', () => {
    expect(compressRefList(['e1'])).toBe('e1');
  });

  it('handles empty array', () => {
    expect(compressRefList([])).toBe('');
  });

  it('handles non-consecutive refs', () => {
    expect(compressRefList(['e1', 'e5', 'e10'])).toBe('e1, e5, e10');
  });
});

describe('formatDiff', () => {
  it('formats diff with header and changes', () => {
    const diff = {
      unchangedRefs: ['e1', 'e2', 'e3'],
      changes: [
        {
          ref: 'e4',
          element: { ref: 'e4', role: 'textbox', name: 'Email', value: 'test@example.com' },
          previousValue: '',
          changeType: 'modified' as const,
        },
      ],
      addedRefs: [],
      removedRefs: [],
    };

    const formatted = formatDiff(diff, 'https://example.com', 'Login Page');

    expect(formatted).toContain('[Same page: Login Page]');
    expect(formatted).toContain('[URL: https://example.com]');
    expect(formatted).toContain('[Unchanged: e1-e3]');
    expect(formatted).toContain('ref: e4');
  });
});
