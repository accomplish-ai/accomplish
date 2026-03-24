import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  addScheduledTask,
  listScheduledTasks,
  cancelScheduledTask,
  onScheduledTaskFire,
  disposeScheduler,
  matchesCron,
  parseCronField,
} from '@accomplish_ai/agent-core';

describe('daemon/scheduler', () => {
  afterEach(() => {
    disposeScheduler();
  });

  describe('parseCronField', () => {
    it('parses wildcard', () => {
      expect(parseCronField('*', 0, 5)).toEqual([0, 1, 2, 3, 4, 5]);
    });

    it('parses single number', () => {
      expect(parseCronField('5', 0, 59)).toEqual([5]);
    });

    it('parses range', () => {
      expect(parseCronField('1-3', 0, 59)).toEqual([1, 2, 3]);
    });

    it('parses comma-separated values', () => {
      expect(parseCronField('1,3,5', 0, 59)).toEqual([1, 3, 5]);
    });

    it('parses mixed range and values', () => {
      expect(parseCronField('1-3,7,9', 0, 59)).toEqual([1, 2, 3, 7, 9]);
    });

    it('filters out-of-range values', () => {
      expect(parseCronField('70', 0, 59)).toEqual([]);
    });
  });

  describe('matchesCron', () => {
    it('matches every minute with * * * * *', () => {
      const date = new Date(2025, 0, 15, 10, 30); // Jan 15, 2025 10:30
      expect(matchesCron('* * * * *', date)).toBe(true);
    });

    it('matches specific minute', () => {
      const date = new Date(2025, 0, 15, 10, 30);
      expect(matchesCron('30 * * * *', date)).toBe(true);
      expect(matchesCron('31 * * * *', date)).toBe(false);
    });

    it('matches specific hour and minute', () => {
      const date = new Date(2025, 0, 15, 9, 0); // 9:00 AM
      expect(matchesCron('0 9 * * *', date)).toBe(true);
      expect(matchesCron('0 10 * * *', date)).toBe(false);
    });

    it('matches weekdays (1-5)', () => {
      const wednesday = new Date(2025, 0, 15, 9, 0); // Wed Jan 15
      const saturday = new Date(2025, 0, 18, 9, 0); // Sat Jan 18
      expect(matchesCron('0 9 * * 1-5', wednesday)).toBe(true);
      expect(matchesCron('0 9 * * 1-5', saturday)).toBe(false);
    });

    it('matches specific month', () => {
      const jan = new Date(2025, 0, 15, 9, 0); // January
      const feb = new Date(2025, 1, 15, 9, 0); // February
      expect(matchesCron('0 9 15 1 *', jan)).toBe(true);
      expect(matchesCron('0 9 15 1 *', feb)).toBe(false);
    });

    it('rejects invalid cron (wrong number of fields)', () => {
      const date = new Date();
      expect(matchesCron('* * *', date)).toBe(false);
      expect(matchesCron('* * * * * *', date)).toBe(false);
    });

    it('uses OR semantics when both dom and dow are restricted', () => {
      // Jan 15, 2025 is a Wednesday (dow=3). Cron: 1st of month OR Friday (dow=5)
      const wed15 = new Date(2025, 0, 15, 9, 0);
      // "0 9 1 * 5" = 1st of month OR every Friday — Wednesday the 15th matches neither
      expect(matchesCron('0 9 1 * 5', wed15)).toBe(false);

      // Jan 1, 2025 is a Wednesday (dow=3). Matches dom=1 via OR
      const wed1 = new Date(2025, 0, 1, 9, 0);
      expect(matchesCron('0 9 1 * 5', wed1)).toBe(true);

      // Jan 17, 2025 is a Friday (dow=5). Matches dow=5 via OR
      const fri17 = new Date(2025, 0, 17, 9, 0);
      expect(matchesCron('0 9 1 * 5', fri17)).toBe(true);
    });

    it('uses AND semantics when dom is * (only dow restricts)', () => {
      // Weekday check: * for dom, 1-5 for dow — Wednesday matches, Saturday doesn't
      const wednesday = new Date(2025, 0, 15, 9, 0);
      const saturday = new Date(2025, 0, 18, 9, 0);
      expect(matchesCron('0 9 * * 1-5', wednesday)).toBe(true);
      expect(matchesCron('0 9 * * 1-5', saturday)).toBe(false);
    });
  });

  describe('addScheduledTask', () => {
    it('creates a scheduled task with an id', () => {
      const task = addScheduledTask('0 9 * * *', 'Test prompt');
      expect(task.id).toMatch(/^sched-/);
      expect(task.cron).toBe('0 9 * * *');
      expect(task.prompt).toBe('Test prompt');
      expect(task.enabled).toBe(true);
      expect(task.createdAt).toBeDefined();
    });

    it('computes nextRunAt', () => {
      const task = addScheduledTask('* * * * *', 'Every minute');
      expect(task.nextRunAt).toBeDefined();
    });

    it('rejects invalid cron expressions', () => {
      expect(() => addScheduledTask('70 * * * *', 'Bad minute')).toThrow('Invalid cron expression');
      expect(() => addScheduledTask('* * *', 'Too few fields')).toThrow('Invalid cron expression');
      expect(() => addScheduledTask('abc def ghi jkl mno', 'Non-numeric')).toThrow(
        'Invalid cron expression',
      );
    });
  });

  describe('listScheduledTasks', () => {
    it('returns empty array when no schedules exist', () => {
      expect(listScheduledTasks()).toEqual([]);
    });

    it('returns all added schedules', () => {
      addScheduledTask('0 9 * * *', 'Morning task');
      addScheduledTask('0 17 * * *', 'Evening task');
      expect(listScheduledTasks()).toHaveLength(2);
    });
  });

  describe('cancelScheduledTask', () => {
    it('removes the specified schedule', () => {
      const task = addScheduledTask('0 9 * * *', 'Test');
      expect(listScheduledTasks()).toHaveLength(1);
      const existed = cancelScheduledTask(task.id);
      expect(existed).toBe(true);
      expect(listScheduledTasks()).toHaveLength(0);
    });

    it('returns false for non-existent schedule', () => {
      const existed = cancelScheduledTask('nonexistent');
      expect(existed).toBe(false);
    });
  });

  describe('onScheduledTaskFire', () => {
    it('registers a callback', () => {
      const callback = vi.fn();
      onScheduledTaskFire(callback);
      // No error thrown
      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('disposeScheduler', () => {
    it('clears all schedules', () => {
      addScheduledTask('0 9 * * *', 'Test');
      addScheduledTask('0 17 * * *', 'Test 2');
      disposeScheduler();
      expect(listScheduledTasks()).toHaveLength(0);
    });

    it('is idempotent', () => {
      disposeScheduler();
      disposeScheduler(); // Should not throw
    });
  });
});
