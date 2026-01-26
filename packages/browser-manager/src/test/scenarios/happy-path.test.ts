// packages/browser-manager/src/test/scenarios/happy-path.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { BrowserManager } from '../../manager.js';
import type { BrowserState } from '../../types.js';

// High ports unlikely to conflict with system services
const TEST_PORT_RANGE = { start: 59900, end: 59910 };

describe('Happy Path Integration', () => {
  let manager: BrowserManager | null = null;
  let states: BrowserState[] = [];

  afterEach(async () => {
    if (manager) {
      try {
        await manager.stop();
      } catch (err) {
        // Don't throw during cleanup - let test complete
        console.error('Cleanup error:', err);
      }
      manager = null;
    }
    states = [];
  });

  it.skipIf(!!process.env.CI)(
    'transitions through expected states on acquire',
    async () => {
      manager = new BrowserManager({
        portRangeStart: TEST_PORT_RANGE.start,
        portRangeEnd: TEST_PORT_RANGE.end,
      });

      manager.subscribe((state) => {
        states.push(state);
      });

      const browser = await manager.acquire({ headless: true });
      expect(browser).toBeDefined();

      const finalState = manager.getState();
      expect(finalState.status).toBe('healthy');

      // Verify state transitions occurred in correct order
      const statuses = states.map((s) => s.status);
      const launchIdx = statuses.indexOf('launching');
      const connectIdx = statuses.indexOf('connecting');
      const healthyIdx = statuses.indexOf('healthy');

      expect(launchIdx).toBeGreaterThanOrEqual(0);
      expect(connectIdx).toBeGreaterThan(launchIdx);
      expect(healthyIdx).toBeGreaterThan(connectIdx);
    },
    60000
  ); // Long timeout for browser launch
});
