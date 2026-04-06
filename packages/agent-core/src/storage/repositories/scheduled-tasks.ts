import { randomUUID } from 'node:crypto';
import type { ScheduledTask } from '../../common/types/daemon.js';
import { getDatabase } from '../database.js';

interface ScheduledTaskRow {
  id: string;
  cron: string;
  prompt: string;
  workspace_id: string | null;
  is_enabled: number;
  created_at: string;
  updated_at: string;
  last_run_at: string | null;
  next_run_at: string | null;
}

function rowToScheduledTask(row: ScheduledTaskRow): ScheduledTask {
  return {
    id: row.id,
    cron: row.cron,
    prompt: row.prompt,
    workspaceId: row.workspace_id || undefined,
    enabled: row.is_enabled === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastRunAt: row.last_run_at || undefined,
    nextRunAt: row.next_run_at || undefined,
  };
}

/**
 * Compute the next run time for a cron expression starting from a given date.
 * Scans up to 400 days (supports monthly/yearly schedules).
 * Optimized: scans day-by-day, then hour:minute within matching days.
 */
function computeNextRunAt(cron: string, from: Date): string | null {
  const fields = cron.trim().split(/\s+/);
  if (fields.length !== 5) {
    return null;
  }

  const minutes = parseCronField(fields[0], 0, 59);
  const hours = parseCronField(fields[1], 0, 23);
  const doms = parseCronField(fields[2], 1, 31);
  const months = parseCronField(fields[3], 1, 12);
  const dows = parseCronField(fields[4], 0, 6);

  if (!minutes || !hours || !doms || !months || !dows) {
    return null;
  }

  const start = new Date(from.getTime());
  start.setSeconds(0, 0);
  start.setMinutes(start.getMinutes() + 1);

  // 1461 days = 4 years — guarantees hitting Feb 29 for leap-year schedules
  const maxDays = 1461;

  for (let dayOffset = 0; dayOffset < maxDays; dayOffset++) {
    const day = new Date(start.getTime());
    if (dayOffset > 0) {
      day.setDate(day.getDate() + dayOffset);
      day.setHours(0, 0, 0, 0);
    }

    // Quick day-level check for non-first days
    if (
      dayOffset > 0 &&
      (!doms.includes(day.getDate()) ||
        !months.includes(day.getMonth() + 1) ||
        !dows.includes(day.getDay()))
    ) {
      continue;
    }

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
          continue;
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

    // Handle */step
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

    // Handle range with optional step: N-M or N-M/step
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

    // Simple number
    const num = parseInt(trimmed, 10);
    if (isNaN(num) || num < min || num > max) {
      return null;
    }
    values.push(num);
  }

  return values.length > 0 ? [...new Set(values)].sort((a, b) => a - b) : null;
}

export function getAllScheduledTasks(): ScheduledTask[] {
  const db = getDatabase();
  const rows = db
    .prepare('SELECT * FROM scheduled_tasks ORDER BY created_at')
    .all() as ScheduledTaskRow[];
  return rows.map(rowToScheduledTask);
}

export function getEnabledScheduledTasks(): ScheduledTask[] {
  const db = getDatabase();
  const rows = db
    .prepare('SELECT * FROM scheduled_tasks WHERE is_enabled = 1 ORDER BY created_at')
    .all() as ScheduledTaskRow[];
  return rows.map(rowToScheduledTask);
}

export function getScheduledTasksByWorkspace(workspaceId: string): ScheduledTask[] {
  const db = getDatabase();
  const rows = db
    .prepare('SELECT * FROM scheduled_tasks WHERE workspace_id = ? ORDER BY created_at')
    .all(workspaceId) as ScheduledTaskRow[];
  return rows.map(rowToScheduledTask);
}

export function getScheduledTaskById(id: string): ScheduledTask | null {
  const db = getDatabase();
  const row = db.prepare('SELECT * FROM scheduled_tasks WHERE id = ?').get(id) as
    | ScheduledTaskRow
    | undefined;
  return row ? rowToScheduledTask(row) : null;
}

export function createScheduledTask(
  cron: string,
  prompt: string,
  workspaceId?: string,
): ScheduledTask {
  const db = getDatabase();
  const id = randomUUID();
  const now = new Date().toISOString();
  const nextRunAt = computeNextRunAt(cron, new Date());

  if (!nextRunAt) {
    throw new Error(
      `Cannot schedule "${cron}": no matching date within the scan window. ` +
        'Try a less restrictive cron expression.',
    );
  }

  db.prepare(
    `INSERT INTO scheduled_tasks (id, cron, prompt, workspace_id, is_enabled, created_at, updated_at, last_run_at, next_run_at)
     VALUES (?, ?, ?, ?, 1, ?, ?, NULL, ?)`,
  ).run(id, cron, prompt, workspaceId || null, now, now, nextRunAt);

  return {
    id,
    cron,
    prompt,
    workspaceId,
    enabled: true,
    createdAt: now,
    updatedAt: now,
    nextRunAt: nextRunAt || undefined,
  };
}

export function deleteScheduledTask(id: string): void {
  const db = getDatabase();
  db.prepare('DELETE FROM scheduled_tasks WHERE id = ?').run(id);
}

export function setScheduledTaskEnabled(id: string, enabled: boolean): void {
  const db = getDatabase();
  const now = new Date().toISOString();

  if (enabled) {
    // Recompute next_run_at when enabling — reject if no match in scan window
    const row = db.prepare('SELECT cron FROM scheduled_tasks WHERE id = ?').get(id) as
      | { cron: string }
      | undefined;
    const nextRunAt = row ? computeNextRunAt(row.cron, new Date()) : null;
    if (!nextRunAt) {
      throw new Error(
        `Cannot enable schedule: no matching date within the scan window for "${row?.cron ?? 'unknown'}".`,
      );
    }
    db.prepare(
      'UPDATE scheduled_tasks SET is_enabled = 1, next_run_at = ?, updated_at = ? WHERE id = ?',
    ).run(nextRunAt, now, id);
  } else {
    db.prepare(
      'UPDATE scheduled_tasks SET is_enabled = 0, next_run_at = NULL, updated_at = ? WHERE id = ?',
    ).run(now, id);
  }
}

export function updateScheduledTaskLastRun(id: string, timestamp: string, nextRunAt: string): void {
  const db = getDatabase();
  const now = new Date().toISOString();
  db.prepare(
    'UPDATE scheduled_tasks SET last_run_at = ?, next_run_at = ?, updated_at = ? WHERE id = ?',
  ).run(timestamp, nextRunAt, now, id);
}
