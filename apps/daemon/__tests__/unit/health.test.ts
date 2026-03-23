import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Mock the agent-core module for HealthCheckResult type
vi.mock('@accomplish_ai/agent-core', () => ({}));

import { HealthService } from '../../src/health.js';

describe('HealthService', () => {
  let service: HealthService;

  beforeEach(() => {
    service = new HealthService();
  });

  describe('getStatus', () => {
    it('should return correct shape with version, uptime, activeTasks, and memoryUsage', () => {
      const status = service.getStatus();

      expect(status).toHaveProperty('version');
      expect(status).toHaveProperty('uptime');
      expect(status).toHaveProperty('activeTasks');
      expect(typeof status.version).toBe('string');
      expect(typeof status.uptime).toBe('number');
      expect(typeof status.activeTasks).toBe('number');
      expect(status).toHaveProperty('memoryUsage', expect.any(Number));
    });

    it('should return version 0.1.0', () => {
      const status = service.getStatus();
      expect(status.version).toBe('0.1.0');
    });

    it('should return 0 active tasks by default', () => {
      const status = service.getStatus();
      expect(status.activeTasks).toBe(0);
    });

    it('should return uptime >= 0', () => {
      const status = service.getStatus();
      expect(status.uptime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('setActiveTaskCount', () => {
    it('should update the active task count', () => {
      service.setActiveTaskCount(5);
      const status = service.getStatus();
      expect(status.activeTasks).toBe(5);
    });

    it('should allow setting count to 0', () => {
      service.setActiveTaskCount(3);
      service.setActiveTaskCount(0);
      const status = service.getStatus();
      expect(status.activeTasks).toBe(0);
    });

    it('should reflect the latest count', () => {
      service.setActiveTaskCount(1);
      service.setActiveTaskCount(10);
      service.setActiveTaskCount(3);
      const status = service.getStatus();
      expect(status.activeTasks).toBe(3);
    });
  });

  describe('uptime', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should increase over time', () => {
      const status1 = service.getStatus();
      vi.advanceTimersByTime(5000);
      const status2 = service.getStatus();
      expect(status2.uptime).toBeGreaterThan(status1.uptime);
    });
  });
});
