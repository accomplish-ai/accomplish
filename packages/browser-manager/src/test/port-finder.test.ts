import { describe, it, expect, vi, beforeEach } from 'vitest';
import { findAvailablePorts, checkPortStatus } from '../port-finder.js';
import type { HealthResult } from '../types.js';

describe('port-finder', () => {
  describe('checkPortStatus', () => {
    it('returns free when fetch fails (port not in use)', async () => {
      // Port 59999 should not be in use
      const result = await checkPortStatus(59999, 59998);
      expect(result).toBe('free');
    });
  });

  describe('findAvailablePorts', () => {
    it('returns first free port pair', async () => {
      const result = await findAvailablePorts({
        portRangeStart: 59990,
        portRangeEnd: 59998,
      });
      expect(result).toEqual({ http: 59990, cdp: 59991 });
    });
  });
});
