// apps/desktop/skills/dev-browser-mcp/src/snapshot/manager.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import { SnapshotManager } from './manager.js';

describe('SnapshotManager', () => {
  let manager: SnapshotManager;

  beforeEach(() => {
    manager = new SnapshotManager();
  });

  const simpleSnapshot = `- button "Submit" [ref=e1]`;

  it('returns full snapshot on first call', () => {
    const result = manager.processSnapshot(
      simpleSnapshot,
      'https://example.com',
      'Test Page'
    );

    expect(result.type).toBe('full');
    expect(result.content).toBe(simpleSnapshot);
  });

  it('returns diff on second call with same page', () => {
    // First call
    manager.processSnapshot(simpleSnapshot, 'https://example.com', 'Test');

    // Second call - same URL
    const result = manager.processSnapshot(
      simpleSnapshot,
      'https://example.com',
      'Test'
    );

    expect(result.type).toBe('diff');
  });

  it('returns full snapshot when URL changes', () => {
    // First call
    manager.processSnapshot(simpleSnapshot, 'https://example.com/page1', 'Page 1');

    // Second call - different URL
    const result = manager.processSnapshot(
      simpleSnapshot,
      'https://example.com/page2',
      'Page 2'
    );

    expect(result.type).toBe('full');
  });

  it('returns full snapshot when full_snapshot option is true', () => {
    // First call
    manager.processSnapshot(simpleSnapshot, 'https://example.com', 'Test');

    // Second call with full_snapshot: true
    const result = manager.processSnapshot(
      simpleSnapshot,
      'https://example.com',
      'Test',
      { fullSnapshot: true }
    );

    expect(result.type).toBe('full');
  });

  it('normalizes URLs for same-page detection', () => {
    // First call
    manager.processSnapshot(simpleSnapshot, 'https://example.com/page#section1', 'Test');

    // Second call - same URL, different hash
    const result = manager.processSnapshot(
      simpleSnapshot,
      'https://example.com/page#section2',
      'Test'
    );

    expect(result.type).toBe('diff');
  });

  it('resets state correctly', () => {
    // First call
    manager.processSnapshot(simpleSnapshot, 'https://example.com', 'Test');

    // Reset
    manager.reset();

    // Should act like first call again
    const result = manager.processSnapshot(
      simpleSnapshot,
      'https://example.com',
      'Test'
    );

    expect(result.type).toBe('full');
  });
});
