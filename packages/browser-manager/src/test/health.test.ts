import { describe, it, expect } from 'vitest';
import { evaluateHealth } from '../health.js';
import type { HealthCheck } from '../types.js';

describe('health', () => {
  describe('evaluateHealth', () => {
    it('returns healthy when all checks pass with low latency', () => {
      const check: HealthCheck = {
        httpAlive: true,
        cdpAlive: true,
        browserAlive: true,
        latencyMs: 100,
      };
      expect(evaluateHealth(check, 500)).toEqual({ status: 'healthy', latency: 100 });
    });

    it('returns degraded when latency exceeds threshold', () => {
      const check: HealthCheck = {
        httpAlive: true,
        cdpAlive: true,
        browserAlive: true,
        latencyMs: 600,
      };
      expect(evaluateHealth(check, 500)).toEqual({ status: 'degraded', latency: 600 });
    });

    it('returns stale when http alive but browser not', () => {
      const check: HealthCheck = {
        httpAlive: true,
        cdpAlive: true,
        browserAlive: false,
        latencyMs: 0,
      };
      expect(evaluateHealth(check, 500)).toEqual({ status: 'stale' });
    });

    it('returns stale when http alive but cdp not', () => {
      const check: HealthCheck = {
        httpAlive: true,
        cdpAlive: false,
        browserAlive: false,
        latencyMs: 0,
      };
      expect(evaluateHealth(check, 500)).toEqual({ status: 'stale' });
    });

    it('returns free when http not alive', () => {
      const check: HealthCheck = {
        httpAlive: false,
        cdpAlive: false,
        browserAlive: false,
        latencyMs: 0,
      };
      expect(evaluateHealth(check, 500)).toEqual({ status: 'free' });
    });
  });
});
