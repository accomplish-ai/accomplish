/**
 * Scheduler Service
 *
 * Ticks every 60 seconds, checks for enabled scheduled tasks whose
 * next_run_at has passed, fires their prompts via the onTaskFire callback,
 * and updates the database with last_run_at / next_run_at.
 */

import type { StorageAPI, ScheduledTask } from '@accomplish_ai/agent-core';
import { log } from './logger.js';

// =============================================================================
// Cron Parsing & Matching
// =============================================================================

/**
 * Parse a single cron field (e.g. "1,5,10", "1-5", "star/10", "*") into an
 * array of matching integer values within [min, max].
 */
function parseCronField(field: string, min: number, max: number): number[] | null {
  const values: number[] = [];

  for (const part of field.split(',')) {
    const trimmed = part.trim();

    if (trimmed === '*') {
      for (let i = min; i <= max; i++) {
        values.push(i);
      }
      continue;
    }

    const stepMatch = trimmed.match(/^\*\/(\d+)$/);
    if (stepMatch) {
      const step = parseInt(stepMatch[1], 10);
      if (step <= 0) {
        return null;
      }
      for (let i = min; i <= max; i += step) {
        values.push(i);
      }
      continue;
    }

    const rangeMatch = trimmed.match(/^(\d+)-(\d+)(?:\/(\d+))?$/);
    if (rangeMatch) {
      const start = parseInt(rangeMatch[1], 10);
      const end = parseInt(rangeMatch[2], 10);
      const step = rangeMatch[3] ? parseInt(rangeMatch[3], 10) : 1;
      if (start < min || end > max || start > end || step <= 0) {
        return null;
      }
      for (let i = start; i <= end; i += step) {
        values.push(i);
      }
      continue;
    }

    const num = parseInt(trimmed, 10);
    if (isNaN(num) || num < min || num > max) {
      return null;
    }
    values.push(num);
  }

  return values.length > 0 ? [...new Set(values)].sort((a, b) => a - b) : null;
}

/** Check whether a cron expression matches a given Date. */
/** Check if a cron expression matches a specific date. Used by validateCron. */
function _matchesCron(cron: string, date: Date): boolean {
  const fields = cron.trim().split(/\s+/);
  if (fields.length !== 5) {
    return false;
  }

  const minutes = parseCronField(fields[0], 0, 59);
  const hours = parseCronField(fields[1], 0, 23);
  const doms = parseCronField(fields[2], 1, 31);
  const months = parseCronField(fields[3], 1, 12);
  const dows = parseCronField(fields[4], 0, 6);

  if (!minutes || !hours || !doms || !months || !dows) {
    return false;
  }

  return (
    minutes.includes(date.getMinutes()) &&
    hours.includes(date.getHours()) &&
    doms.includes(date.getDate()) &&
    months.includes(date.getMonth() + 1) &&
    dows.includes(date.getDay())
  );
}

/**
 * Compute the next time a cron expression will fire, starting from `from`.
 * Supports schedules up to 400 days out (monthly, yearly).
 * Optimized: scans days first, then minutes within matching days.
 */
function computeNextRunAt(cron: string, from: Date): string | null {
  const fields = cron.trim().split(/\s+/);
  if (fields.length !== 5) {
    return null;
  }
  const [minField, hourField, domField, monField, dowField] = fields;
  const minutes = parseCronField(minField, 0, 59);
  const hours = parseCronField(hourField, 0, 23);
  const doms = parseCronField(domField, 1, 31);
  const months = parseCronField(monField, 1, 12);
  const dows = parseCronField(dowField, 0, 6);

  if (!minutes || !hours || !doms || !months || !dows) {
    return null;
  }

  const start = new Date(from.getTime());
  start.setSeconds(0, 0);
  start.setMinutes(start.getMinutes() + 1);

  // Scan up to 400 days (covers monthly + yearly schedules)
  // 1461 days = 4 years — guarantees hitting Feb 29 for leap-year schedules
  const maxDays = 1461;

  for (let dayOffset = 0; dayOffset < maxDays; dayOffset++) {
    const day = new Date(start.getTime());
    if (dayOffset > 0) {
      day.setDate(day.getDate() + dayOffset);
      day.setHours(0, 0, 0, 0);
    }

    // Quick day-level check: does this day match dom/month/dow?
    if (
      !doms.includes(day.getDate()) ||
      !months.includes(day.getMonth() + 1) ||
      !dows.includes(day.getDay())
    ) {
      // For the first day, we need to check remaining hours/minutes
      // For subsequent days, skip entirely if day doesn't match
      if (dayOffset > 0) {
        continue;
      }
      // First day: the day might not match, but we started partway through
      // Fall through to check if remaining minutes on this day match
    }

    // Check each valid hour:minute on this day
    for (const hour of hours) {
      for (const minute of minutes) {
        const candidate = new Date(
          day.getFullYear(),
          day.getMonth(),
          day.getDate(),
          hour,
          minute,
          0,
          0,
        );
        if (candidate.getTime() <= from.getTime()) {
          continue; // Skip times already passed
        }
        if (
          doms.includes(candidate.getDate()) &&
          months.includes(candidate.getMonth() + 1) &&
          dows.includes(candidate.getDay())
        ) {
          return candidate.toISOString();
        }
      }
    }
  }

  return null;
}

/** Validate that a string is a well-formed 5-field cron expression. */
function validateCron(cron: string): boolean {
  const fields = cron.trim().split(/\s+/);
  if (fields.length !== 5) {
    return false;
  }

  const limits: [number, number][] = [
    [0, 59],
    [0, 23],
    [1, 31],
    [1, 12],
    [0, 6],
  ];

  return fields.every((field, i) => parseCronField(field, limits[i][0], limits[i][1]) !== null);
}

// =============================================================================
// SchedulerService
// =============================================================================

export class SchedulerService {
  private storage: StorageAPI;
  private onTaskFire: (prompt: string, workspaceId?: string) => void;
  private alignTimeout: ReturnType<typeof setTimeout> | null = null;
  private tickInterval: ReturnType<typeof setInterval> | null = null;

  constructor(storage: StorageAPI, onTaskFire: (prompt: string, workspaceId?: string) => void) {
    this.storage = storage;
    this.onTaskFire = onTaskFire;
  }

  /**
   * Start the scheduler. Fires overdue schedules immediately (catch-up),
   * then aligns to the next minute boundary and ticks every 60 seconds.
   */
  start(): void {
    this.catchUp();

    // Align to the next minute boundary.
    // If we're exactly on a boundary (msUntilNextMinute === 60000), tick immediately.
    const now = Date.now();
    const remainder = now % 60_000;
    const msUntilNextMinute = remainder === 0 ? 0 : 60_000 - remainder;

    if (msUntilNextMinute === 0) {
      this.tick();
      this.tickInterval = setInterval(() => this.tick(), 60_000);
    } else {
      this.alignTimeout = setTimeout(() => {
        this.tick();
        this.tickInterval = setInterval(() => this.tick(), 60_000);
      }, msUntilNextMinute);
    }
  }

  /** Stop all timers. */
  stop(): void {
    if (this.alignTimeout) {
      clearTimeout(this.alignTimeout);
      this.alignTimeout = null;
    }
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
  }

  /**
   * Tick: find enabled schedules whose next_run_at <= now, update their
   * last_run_at and next_run_at, then fire their prompts.
   */
  tick(): void {
    const now = new Date();
    const nowIso = now.toISOString();

    const enabled = this.storage.getEnabledScheduledTasks();
    const due = enabled.filter((t) => t.nextRunAt && t.nextRunAt <= nowIso);

    for (const task of due) {
      const next = computeNextRunAt(task.cron, now);
      if (!next) {
        log.warn(`[Scheduler] Could not compute next run for schedule ${task.id} — skipping`);
        continue;
      }
      this.storage.updateScheduledTaskLastRun(task.id, nowIso, next);
      log.info(`[Scheduler] Firing schedule ${task.id}: "${task.prompt.slice(0, 80)}"`);
      try {
        this.onTaskFire(task.prompt, task.workspaceId);
      } catch (err) {
        log.error(`[Scheduler] Error firing task ${task.id}:`, err);
      }
    }
  }

  /**
   * Fire once for any overdue schedules (e.g. daemon was stopped).
   * Only fires schedules whose next_run_at is in the past.
   */
  catchUp(): void {
    const now = new Date();
    const nowIso = now.toISOString();

    const enabled = this.storage.getEnabledScheduledTasks();
    const overdue = enabled.filter((t) => t.nextRunAt && t.nextRunAt <= nowIso);

    for (const task of overdue) {
      const next = computeNextRunAt(task.cron, now);
      if (!next) {
        log.warn(
          `[Scheduler] Could not compute next run for overdue schedule ${task.id} — skipping`,
        );
        continue;
      }
      this.storage.updateScheduledTaskLastRun(task.id, nowIso, next);
      log.info(`[Scheduler] Catch-up firing schedule ${task.id}: "${task.prompt.slice(0, 80)}"`);
      try {
        this.onTaskFire(task.prompt, task.workspaceId);
      } catch (err) {
        log.error(`[Scheduler] Error during catch-up for task ${task.id}:`, err);
      }
    }
  }

  /** Create a new schedule after validating the cron expression. */
  createSchedule(cron: string, prompt: string, workspaceId?: string): ScheduledTask {
    if (!validateCron(cron)) {
      throw new Error(`Invalid cron expression: ${cron}`);
    }
    // Verify the cron can actually fire within the scan window.
    // Rejects expressions like "0 0 29 2 1" (Feb 29 on Monday) that may
    // be decades away and would be persisted with next_run_at = NULL.
    const nextRun = computeNextRunAt(cron, new Date());
    if (!nextRun) {
      throw new Error(
        `Schedule "${cron}" has no matching date within the next 4 years. ` +
          'This can happen with very specific day-of-month + day-of-week combinations. ' +
          'Try a less restrictive expression.',
      );
    }
    return this.storage.createScheduledTask(cron, prompt, workspaceId);
  }

  /** List all schedules, optionally filtered by workspace. */
  listSchedules(workspaceId?: string): ScheduledTask[] {
    if (workspaceId) {
      return this.storage.getScheduledTasksByWorkspace(workspaceId);
    }
    return this.storage.getAllScheduledTasks();
  }

  /** Delete a schedule by ID. */
  deleteSchedule(id: string): void {
    this.storage.deleteScheduledTask(id);
  }

  /** Enable or disable a schedule. */
  setEnabled(id: string, enabled: boolean): void {
    if (enabled) {
      // Verify the schedule can fire before enabling
      const task = this.storage.getScheduledTaskById(id);
      if (task) {
        const nextRun = computeNextRunAt(task.cron, new Date());
        if (!nextRun) {
          throw new Error(
            `Cannot enable schedule: "${task.cron}" has no matching date within the next 4 years.`,
          );
        }
      }
    }
    this.storage.setScheduledTaskEnabled(id, enabled);
  }
}
