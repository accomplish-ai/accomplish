import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ScheduledTask } from '@accomplish_ai/agent-core';
import { SchedulerService } from '../../src/scheduler-service.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let idCounter = 0;

function makeTask(overrides: Partial<ScheduledTask> = {}): ScheduledTask {
  idCounter += 1;
  const now = new Date().toISOString();
  return {
    id: `task-${idCounter}`,
    cron: '0 9 * * *',
    prompt: 'do something',
    enabled: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mock StorageAPI (in-memory)
// ---------------------------------------------------------------------------

function createMockStorage() {
  const tasks: ScheduledTask[] = [];

  return {
    tasks, // exposed for test assertions

    getAllScheduledTasks: vi.fn(() => [...tasks]),

    getEnabledScheduledTasks: vi.fn(() => tasks.filter((t) => t.enabled)),

    getScheduledTasksByWorkspace: vi.fn((workspaceId: string) =>
      tasks.filter((t) => t.workspaceId === workspaceId),
    ),

    getScheduledTaskById: vi.fn((id: string) => tasks.find((t) => t.id === id) ?? null),

    createScheduledTask: vi.fn((cron: string, prompt: string, workspaceId?: string) => {
      const task = makeTask({ cron, prompt, workspaceId });
      // Simulate DB: compute nextRunAt
      task.nextRunAt = new Date(Date.now() + 60_000).toISOString();
      tasks.push(task);
      return task;
    }),

    deleteScheduledTask: vi.fn((id: string) => {
      const idx = tasks.findIndex((t) => t.id === id);
      if (idx !== -1) {
        tasks.splice(idx, 1);
      }
    }),

    setScheduledTaskEnabled: vi.fn((id: string, enabled: boolean) => {
      const task = tasks.find((t) => t.id === id);
      if (task) {
        task.enabled = enabled;
        if (!enabled) {
          task.nextRunAt = undefined;
        } else {
          task.nextRunAt = new Date(Date.now() + 60_000).toISOString();
        }
      }
    }),

    updateScheduledTaskLastRun: vi.fn((id: string, timestamp: string, nextRunAt: string) => {
      const task = tasks.find((t) => t.id === id);
      if (task) {
        task.lastRunAt = timestamp;
        task.nextRunAt = nextRunAt;
      }
    }),
  };
}

type MockStorage = ReturnType<typeof createMockStorage>;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SchedulerService', () => {
  let storage: MockStorage;
  let onTaskFire: ReturnType<typeof vi.fn>;
  let service: SchedulerService;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-15T10:00:00.000Z'));
    idCounter = 0;
    storage = createMockStorage();
    onTaskFire = vi.fn();
    // Cast to satisfy the StorageAPI type — we only mock the scheduler methods
    service = new SchedulerService(storage as never, onTaskFire);
  });

  afterEach(() => {
    service.stop();
    vi.useRealTimers();
  });

  // =========================================================================
  // createSchedule
  // =========================================================================

  describe('createSchedule', () => {
    it('creates a schedule with a valid daily cron', () => {
      const task = service.createSchedule('0 9 * * *', 'good morning');
      expect(task.cron).toBe('0 9 * * *');
      expect(task.prompt).toBe('good morning');
      expect(storage.createScheduledTask).toHaveBeenCalledWith(
        '0 9 * * *',
        'good morning',
        undefined,
      );
    });

    it('creates a schedule with a step expression', () => {
      const task = service.createSchedule('*/5 * * * *', 'every 5 min');
      expect(task.cron).toBe('*/5 * * * *');
    });

    it('creates a schedule with weekday range', () => {
      const task = service.createSchedule('0 9 * * 1-5', 'weekday mornings');
      expect(task.cron).toBe('0 9 * * 1-5');
    });

    it('creates a schedule for first of month', () => {
      const task = service.createSchedule('0 9 1 * *', 'monthly');
      expect(task.cron).toBe('0 9 1 * *');
    });

    it('passes workspaceId to storage', () => {
      service.createSchedule('0 9 * * *', 'hello', 'ws-123');
      expect(storage.createScheduledTask).toHaveBeenCalledWith('0 9 * * *', 'hello', 'ws-123');
    });

    it('throws on malformed cron — random string', () => {
      expect(() => service.createSchedule('bad', 'nope')).toThrow('Invalid cron expression');
    });

    it('throws on malformed cron — too few fields', () => {
      expect(() => service.createSchedule('* *', 'nope')).toThrow('Invalid cron expression');
    });

    it('throws on malformed cron — minute out of range (60)', () => {
      expect(() => service.createSchedule('60 * * * *', 'nope')).toThrow('Invalid cron expression');
    });

    it('throws on malformed cron — hour out of range (25)', () => {
      expect(() => service.createSchedule('* 25 * * *', 'nope')).toThrow('Invalid cron expression');
    });

    it('throws on malformed cron — day-of-month out of range (32)', () => {
      expect(() => service.createSchedule('0 0 32 * *', 'nope')).toThrow('Invalid cron expression');
    });

    it('throws on malformed cron — month out of range (13)', () => {
      expect(() => service.createSchedule('0 0 * 13 *', 'nope')).toThrow('Invalid cron expression');
    });

    it('throws on malformed cron — day-of-week out of range (7)', () => {
      expect(() => service.createSchedule('0 0 * * 7', 'nope')).toThrow('Invalid cron expression');
    });

    it('throws on malformed cron — too many fields', () => {
      expect(() => service.createSchedule('0 0 * * * *', 'nope')).toThrow(
        'Invalid cron expression',
      );
    });

    it('throws on malformed cron — negative step', () => {
      expect(() => service.createSchedule('*/-1 * * * *', 'nope')).toThrow(
        'Invalid cron expression',
      );
    });

    it('throws on valid syntax but unschedulable cron (no match in scan window)', () => {
      // Feb 29 on a Monday — can be decades away
      expect(() => service.createSchedule('0 0 29 2 1', 'leap monday')).toThrow('no matching date');
    });
  });

  // =========================================================================
  // listSchedules
  // =========================================================================

  describe('listSchedules', () => {
    it('returns all schedules when no workspace filter', () => {
      storage.tasks.push(makeTask({ workspaceId: 'ws-1' }));
      storage.tasks.push(makeTask({ workspaceId: 'ws-2' }));

      const result = service.listSchedules();
      expect(result).toHaveLength(2);
      expect(storage.getAllScheduledTasks).toHaveBeenCalled();
    });

    it('filters by workspace when workspaceId provided', () => {
      storage.tasks.push(makeTask({ workspaceId: 'ws-1' }));
      storage.tasks.push(makeTask({ workspaceId: 'ws-2' }));

      const result = service.listSchedules('ws-1');
      expect(result).toHaveLength(1);
      expect(result[0].workspaceId).toBe('ws-1');
      expect(storage.getScheduledTasksByWorkspace).toHaveBeenCalledWith('ws-1');
    });

    it('returns empty array when no schedules exist', () => {
      const result = service.listSchedules();
      expect(result).toEqual([]);
    });
  });

  // =========================================================================
  // deleteSchedule
  // =========================================================================

  describe('deleteSchedule', () => {
    it('delegates to storage.deleteScheduledTask', () => {
      storage.tasks.push(makeTask({ id: 'sched-1' }));

      service.deleteSchedule('sched-1');
      expect(storage.deleteScheduledTask).toHaveBeenCalledWith('sched-1');
      expect(storage.tasks).toHaveLength(0);
    });
  });

  // =========================================================================
  // setEnabled
  // =========================================================================

  describe('setEnabled', () => {
    it('disables a schedule via storage', () => {
      storage.tasks.push(makeTask({ id: 'sched-1', enabled: true }));

      service.setEnabled('sched-1', false);
      expect(storage.setScheduledTaskEnabled).toHaveBeenCalledWith('sched-1', false);
    });

    it('enables a schedule via storage', () => {
      storage.tasks.push(makeTask({ id: 'sched-1', enabled: false }));

      service.setEnabled('sched-1', true);
      expect(storage.setScheduledTaskEnabled).toHaveBeenCalledWith('sched-1', true);
    });
  });

  // =========================================================================
  // tick
  // =========================================================================

  describe('tick', () => {
    it('fires due schedules and updates last_run_at / next_run_at', () => {
      const pastTime = new Date(Date.now() - 60_000).toISOString();
      storage.tasks.push(
        makeTask({
          id: 'due-1',
          prompt: 'run me',
          enabled: true,
          nextRunAt: pastTime,
          workspaceId: 'ws-1',
        }),
      );

      service.tick();

      expect(onTaskFire).toHaveBeenCalledWith('run me', 'ws-1');
      expect(storage.updateScheduledTaskLastRun).toHaveBeenCalledWith(
        'due-1',
        expect.any(String),
        expect.any(String),
      );
    });

    it('fires multiple due schedules', () => {
      const pastTime = new Date(Date.now() - 60_000).toISOString();
      storage.tasks.push(
        makeTask({ id: 'due-1', prompt: 'first', enabled: true, nextRunAt: pastTime }),
        makeTask({ id: 'due-2', prompt: 'second', enabled: true, nextRunAt: pastTime }),
      );

      service.tick();

      expect(onTaskFire).toHaveBeenCalledTimes(2);
      expect(onTaskFire).toHaveBeenCalledWith('first', undefined);
      expect(onTaskFire).toHaveBeenCalledWith('second', undefined);
    });

    it('skips schedules whose nextRunAt is in the future', () => {
      const futureTime = new Date(Date.now() + 60_000).toISOString();
      storage.tasks.push(
        makeTask({ id: 'not-yet', prompt: 'too early', enabled: true, nextRunAt: futureTime }),
      );

      service.tick();

      expect(onTaskFire).not.toHaveBeenCalled();
    });

    it('skips disabled schedules', () => {
      const pastTime = new Date(Date.now() - 60_000).toISOString();
      storage.tasks.push(
        makeTask({ id: 'disabled', prompt: 'skip me', enabled: false, nextRunAt: pastTime }),
      );

      service.tick();

      expect(onTaskFire).not.toHaveBeenCalled();
    });

    it('skips schedules with no nextRunAt', () => {
      storage.tasks.push(
        makeTask({ id: 'no-next', prompt: 'skip', enabled: true, nextRunAt: undefined }),
      );

      service.tick();

      expect(onTaskFire).not.toHaveBeenCalled();
    });

    it('continues firing remaining tasks if one throws', () => {
      const pastTime = new Date(Date.now() - 60_000).toISOString();
      storage.tasks.push(
        makeTask({ id: 'bad', prompt: 'explode', enabled: true, nextRunAt: pastTime }),
        makeTask({ id: 'good', prompt: 'still runs', enabled: true, nextRunAt: pastTime }),
      );

      onTaskFire.mockImplementationOnce(() => {
        throw new Error('boom');
      });

      // Should not throw
      expect(() => service.tick()).not.toThrow();
      expect(onTaskFire).toHaveBeenCalledTimes(2);
    });
  });

  // =========================================================================
  // catchUp
  // =========================================================================

  describe('catchUp', () => {
    it('fires overdue schedules', () => {
      const overdueTime = new Date(Date.now() - 120_000).toISOString();
      storage.tasks.push(
        makeTask({ id: 'overdue-1', prompt: 'catch up', enabled: true, nextRunAt: overdueTime }),
      );

      service.catchUp();

      expect(onTaskFire).toHaveBeenCalledWith('catch up', undefined);
      expect(storage.updateScheduledTaskLastRun).toHaveBeenCalled();
    });

    it('does not fire schedules with future nextRunAt', () => {
      const futureTime = new Date(Date.now() + 120_000).toISOString();
      storage.tasks.push(
        makeTask({ id: 'future', prompt: 'not yet', enabled: true, nextRunAt: futureTime }),
      );

      service.catchUp();

      expect(onTaskFire).not.toHaveBeenCalled();
    });

    it('does not fire disabled schedules even if overdue', () => {
      const overdueTime = new Date(Date.now() - 120_000).toISOString();
      storage.tasks.push(
        makeTask({
          id: 'disabled-overdue',
          prompt: 'nope',
          enabled: false,
          nextRunAt: overdueTime,
        }),
      );

      service.catchUp();

      expect(onTaskFire).not.toHaveBeenCalled();
    });

    it('catches up schedules due at exactly the current time (<=)', () => {
      const exactlyNow = new Date().toISOString();
      storage.tasks.push(
        makeTask({
          id: 'exact-now',
          prompt: 'exact catch-up',
          enabled: true,
          nextRunAt: exactlyNow,
        }),
      );

      service.catchUp();

      expect(onTaskFire).toHaveBeenCalledWith('exact catch-up', undefined);
    });
  });

  // =========================================================================
  // start / stop / minute-boundary alignment
  // =========================================================================

  describe('start and stop', () => {
    it('calls catchUp immediately on start', () => {
      const overdueTime = new Date(Date.now() - 60_000).toISOString();
      storage.tasks.push(
        makeTask({ id: 'overdue', prompt: 'catch-up', enabled: true, nextRunAt: overdueTime }),
      );

      service.start();

      // catchUp should have fired synchronously
      expect(onTaskFire).toHaveBeenCalledWith('catch-up', undefined);
    });

    it('ticks immediately when started exactly on a minute boundary', () => {
      // Current time: 2025-06-15T10:00:00.000Z — exactly on the minute
      // With the fix, remainder === 0, so tick runs immediately
      const pastTime = new Date(Date.now() - 1000).toISOString();
      storage.tasks.push(
        makeTask({
          id: 'boundary-test',
          prompt: 'boundary fire',
          enabled: true,
          nextRunAt: pastTime,
        }),
      );

      service.start();

      // tick should have fired immediately (no setTimeout delay)
      expect(onTaskFire).toHaveBeenCalledWith('boundary fire', undefined);
    });

    it('aligns tick to next minute boundary when not on boundary', () => {
      // Move to mid-minute: 10:00:30.000
      vi.setSystemTime(new Date('2025-06-15T10:00:30.000Z'));

      service = new SchedulerService(storage as never, onTaskFire);
      service.start();

      const pastTime = new Date(Date.now() - 1000).toISOString();
      storage.tasks.push(
        makeTask({ id: 'align-test', prompt: 'aligned fire', enabled: true, nextRunAt: pastTime }),
      );

      // Advance to just before alignment (30s away)
      vi.advanceTimersByTime(29_999);
      expect(onTaskFire).not.toHaveBeenCalled();

      // Advance past alignment
      vi.advanceTimersByTime(1);
      expect(onTaskFire).toHaveBeenCalledWith('aligned fire', undefined);
    });

    it('ticks every 60 seconds after alignment', () => {
      service.start();

      // Advance past alignment
      vi.advanceTimersByTime(60_000);

      // Add a due task
      const pastTime = new Date(Date.now() - 1000).toISOString();
      storage.tasks.push(
        makeTask({ id: 'recurring', prompt: 'again', enabled: true, nextRunAt: pastTime }),
      );

      // Advance one more interval
      vi.advanceTimersByTime(60_000);
      expect(onTaskFire).toHaveBeenCalledWith('again', undefined);
    });

    it('stop clears all timers — no further ticks', () => {
      service.start();
      service.stop();

      const pastTime = new Date(Date.now() - 1000).toISOString();
      storage.tasks.push(
        makeTask({ id: 'no-fire', prompt: 'should not fire', enabled: true, nextRunAt: pastTime }),
      );

      // Advance well past when tick would have fired
      vi.advanceTimersByTime(120_000);
      expect(onTaskFire).not.toHaveBeenCalled();
    });

    it('stop is safe to call multiple times', () => {
      service.start();
      expect(() => {
        service.stop();
        service.stop();
      }).not.toThrow();
    });

    it('stop is safe to call without start', () => {
      expect(() => service.stop()).not.toThrow();
    });
  });
});
