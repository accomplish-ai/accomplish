import { describe, it, expect } from 'vitest';
import { MockBrowser } from './mock-browser.js';

describe('MockBrowser', () => {
  it('starts in idle state', () => {
    const mock = new MockBrowser();
    expect(mock.getState()).toBe('idle');
  });

  it('can set state directly', () => {
    const mock = new MockBrowser();
    mock.setState('healthy');
    expect(mock.getState()).toBe('healthy');
  });

  it('can simulate port occupied', () => {
    const mock = new MockBrowser();
    mock.setPortOccupied(9224, 'external');
    expect(mock.isPortOccupied(9224)).toBe(true);
    expect(mock.getPortOccupier(9224)).toBe('external');
  });

  it('can set health check response', () => {
    const mock = new MockBrowser();
    mock.setHealthCheck({
      httpAlive: true,
      cdpAlive: false,
      browserAlive: false,
      latencyMs: 0,
    });
    const check = mock.getHealthCheck();
    expect(check.cdpAlive).toBe(false);
  });

  it('can simulate crash after delay', async () => {
    const mock = new MockBrowser();
    mock.setState('healthy');
    mock.simulateCrashAfter(50);
    expect(mock.getState()).toBe('healthy');
    await new Promise(r => setTimeout(r, 100));
    expect(mock.getState()).toBe('crashed');
  });
});
