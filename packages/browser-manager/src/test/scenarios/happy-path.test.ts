// packages/browser-manager/src/test/scenarios/happy-path.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { existsSync } from 'fs';
import { BrowserManager } from '../../manager.js';
import type { BrowserState } from '../../types.js';

// High ports unlikely to conflict with system services
const TEST_PORT_RANGE = { start: 59900, end: 59910 };

// Check if Chrome is installed
function isChromeInstalled(): boolean {
  const platform = process.platform;
  const paths =
    platform === 'darwin'
      ? [
          '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
          '/Applications/Chromium.app/Contents/MacOS/Chromium',
        ]
      : platform === 'win32'
        ? [
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
          ]
        : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];

  return paths.some((path) => existsSync(path));
}

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

  const testFn = !!process.env.CI || !isChromeInstalled() ? it.skip : it;

  testFn(
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
