/**
 * Task Scheduler
 *
 * Lightweight cron-based task scheduler for the daemon. Stores scheduled tasks
 * in memory and fires them via a DaemonClient `task.start` call.
 *
 * Uses simple cron matching (no external dependencies). For production,
 * consider replacing with a library like `cron` or `node-schedule`.
 *
 * ESM module — use .js extensions on imports.
 */

import type { ScheduledTask } from '../common/types/daemon.js';
import { createLogger } from './logger.js';

const logger = createLogger('Scheduler');

type ScheduledTaskCallback = (task: ScheduledTask) => void;

const schedules = new Map<string, ScheduledTask>();
let timerId: ReturnType<typeof setInterval> | null = null;
let onFireCallback: ScheduledTaskCallback | null = null;

/**
 * Parse a cron expression into its 5 fields.
 * Supports: minute hour day-of-month month day-of-week
 * Supports: * (any), numbers, ranges (1-5), commas (1,3,5)
 */
export function parseCronField(field: string, min: number, max: number): number[] {
  if (field === '*') {
    const result: number[] = [];
    for (let i = min; i <= max; i++) {
      result.push(i);
    }
    return result;
  }

  const values: number[] = [];
  const parts = field.split(',');

  for (const part of parts) {
    if (part.includes('-')) {
      const [start, end] = part.split('-').map(Number);
      for (let i = start; i <= end; i++) {
        values.push(i);
      }
    } else {
      values.push(Number(part));
    }
  }

  return values.filter((v) => v >= min && v <= max);
}

export function matchesCron(cron: string, date: Date): boolean {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) {
    return false;
  }

  const [minuteField, hourField, domField, monthField, dowField] = parts;

  const minutes = parseCronField(minuteField, 0, 59);
  const hours = parseCronField(hourField, 0, 23);
  const doms = parseCronField(domField, 1, 31);
  const months = parseCronField(monthField, 1, 12);
  const dows = parseCronField(dowField, 0, 6);

  // Standard cron OR semantics: when both dom and dow are restricted (non-wildcard),
  // a match occurs if dom OR dow matches. When either is wildcard, AND semantics apply.
  const domIsWildcard = domField === '*';
  const dowIsWildcard = dowField === '*';

  let domDowMatch: boolean;
  if (!domIsWildcard && !dowIsWildcard) {
    // OR semantics: match if dom OR dow matches
    domDowMatch = doms.includes(date.getDate()) || dows.includes(date.getDay());
  } else {
    // AND semantics: both must match (wildcard fields match any value)
    domDowMatch = doms.includes(date.getDate()) && dows.includes(date.getDay());
  }

  return (
    minutes.includes(date.getMinutes()) &&
    hours.includes(date.getHours()) &&
    months.includes(date.getMonth() + 1) &&
    domDowMatch
  );
}

/**
 * Calculate the next run time for a cron expression.
 * Returns ISO string or undefined if can't determine within 7 days.
 */
function getNextRunTime(cron: string): string | undefined {
  const now = new Date();
  const check = new Date(now);
  check.setSeconds(0);
  check.setMilliseconds(0);
  check.setMinutes(check.getMinutes() + 1);

  // Search up to 7 days ahead
  const maxMinutes = 7 * 24 * 60;
  for (let i = 0; i < maxMinutes; i++) {
    if (matchesCron(cron, check)) {
      return check.toISOString();
    }
    check.setMinutes(check.getMinutes() + 1);
  }
  return undefined;
}

/**
 * Add a scheduled task. Returns the created ScheduledTask.
 */
export function addScheduledTask(cron: string, prompt: string): ScheduledTask {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new Error(`Invalid cron expression: "${cron}" — must have exactly 5 fields`);
  }
  const ranges: [number, number][] = [
    [0, 59], // minute
    [0, 23], // hour
    [1, 31], // day of month
    [1, 12], // month
    [0, 6], // day of week
  ];
  for (let i = 0; i < 5; i++) {
    const field = parts[i];
    if (field === '*') continue;
    const values = parseCronField(field, ranges[i][0], ranges[i][1]);
    if (values.length === 0) {
      throw new Error(
        `Invalid cron expression: "${cron}" — field ${i + 1} ("${field}") has no valid values`,
      );
    }
  }

  const id = `sched-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const task: ScheduledTask = {
    id,
    cron,
    prompt,
    enabled: true,
    createdAt: new Date().toISOString(),
    nextRunAt: getNextRunTime(cron),
  };

  schedules.set(id, task);
  logger.info('Added schedule:', id, cron, prompt.slice(0, 50));

  // Start the timer if not running
  if (!timerId) {
    startTimer();
  }

  return task;
}

/**
 * List all scheduled tasks.
 */
export function listScheduledTasks(): ScheduledTask[] {
  return Array.from(schedules.values());
}

/**
 * Cancel (remove) a scheduled task.
 */
export function cancelScheduledTask(scheduleId: string): boolean {
  const existed = schedules.has(scheduleId);
  schedules.delete(scheduleId);
  logger.info('Cancelled schedule:', scheduleId);

  if (schedules.size === 0 && timerId) {
    stopTimer();
  }
  return existed;
}

/**
 * Set the callback to invoke when a scheduled task fires.
 */
export function onScheduledTaskFire(callback: ScheduledTaskCallback): void {
  onFireCallback = callback;
}

/**
 * Stop the scheduler and clear all schedules.
 */
export function disposeScheduler(): void {
  stopTimer();
  schedules.clear();
  onFireCallback = null;
  logger.info('Disposed');
}

// ── Internal timer ───────────────────────────────────────────────────

function startTimer(): void {
  // Check every 60 seconds (aligned to minute boundaries)
  timerId = setInterval(() => {
    tick();
  }, 60_000);

  logger.info('Timer started');
}

function stopTimer(): void {
  if (timerId) {
    clearInterval(timerId);
    timerId = null;
    logger.info('Timer stopped');
  }
}

function tick(): void {
  const now = new Date();

  for (const task of schedules.values()) {
    if (!task.enabled) {
      continue;
    }

    if (matchesCron(task.cron, now)) {
      logger.info('Firing scheduled task:', task.id, task.prompt.slice(0, 50));
      task.lastRunAt = now.toISOString();
      task.nextRunAt = getNextRunTime(task.cron);

      if (onFireCallback) {
        try {
          onFireCallback(task);
        } catch (err) {
          logger.error('Callback error for task', task.id, err);
        }
      }
    }
  }
}
