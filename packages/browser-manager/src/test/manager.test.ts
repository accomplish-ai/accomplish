import { describe, it, expect, beforeEach } from 'vitest';
import { BrowserManager } from '../manager.js';
import type { BrowserState } from '../types.js';

describe('BrowserManager', () => {
  let manager: BrowserManager;

  beforeEach(() => {
    manager = new BrowserManager();
  });

  it('starts in idle state', () => {
    expect(manager.getState().status).toBe('idle');
  });

  it('allows subscription', () => {
    const states: string[] = [];
    const unsubscribe = manager.subscribe((state) => {
      states.push(state.status);
    });
    expect(typeof unsubscribe).toBe('function');
    unsubscribe();
  });

  it('notifies subscribers on state change', () => {
    const states: string[] = [];
    manager.subscribe((state) => {
      states.push(state.status);
    });

    // Internal method to test state changes
    const newState: BrowserState = { status: 'launching', port: 9224 };
    (manager as unknown as { setState: (s: BrowserState) => void }).setState(newState);

    expect(states).toContain('launching');
  });

  it('unsubscribe removes subscriber', () => {
    const states: string[] = [];
    const unsubscribe = manager.subscribe(() => states.push('called'));

    unsubscribe();
    const newState: BrowserState = { status: 'launching', port: 9224 };
    (manager as unknown as { setState: (s: BrowserState) => void }).setState(newState);

    expect(states).toHaveLength(0);
  });

  it('handles multiple subscribers', () => {
    const states1: string[] = [];
    const states2: string[] = [];

    manager.subscribe((s) => states1.push(s.status));
    manager.subscribe((s) => states2.push(s.status));

    const newState: BrowserState = { status: 'launching', port: 9224 };
    (manager as unknown as { setState: (s: BrowserState) => void }).setState(newState);

    expect(states1).toContain('launching');
    expect(states2).toContain('launching');
  });

  it('isolates subscriber errors', () => {
    const states: string[] = [];

    // Bad subscriber that throws
    manager.subscribe(() => {
      throw new Error('bad subscriber');
    });

    // Good subscriber
    manager.subscribe((s) => states.push(s.status));

    const newState: BrowserState = { status: 'launching', port: 9224 };
    (manager as unknown as { setState: (s: BrowserState) => void }).setState(newState);

    // Good subscriber should still work
    expect(states).toContain('launching');
  });
});
