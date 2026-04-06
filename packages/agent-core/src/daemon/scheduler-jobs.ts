/**
 * Scheduler cron parsing and matching utilities
 *
 * Pure cron parsing helpers extracted from scheduler.ts.
 * No side effects — safe to import and test in isolation.
 */

/**
 * Parse a cron field into its expanded numeric values.
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
    if (/^\d+-\d+$/.test(part)) {
      const rangeParts = part.split('-');
      const start = parseInt(rangeParts[0], 10);
      const end = parseInt(rangeParts[1], 10);
      if (start > end || start < min || end > max) {
        return [];
      }
      for (let i = start; i <= end; i++) {
        values.push(i);
      }
    } else if (/^\d+$/.test(part)) {
      const val = parseInt(part, 10);
      if (val < min || val > max) {
        return [];
      }
      values.push(val);
    } else {
      return [];
    }
  }

  if (values.length === 0) {
    return [];
  }

  // Deduplicate and sort, since ranges might overlap (e.g. "1,1-3")
  return Array.from(new Set(values)).sort((a, b) => a - b);
}

/**
 * Returns true if the given Date matches the cron expression.
 * Standard 5-field cron: minute hour day-of-month month day-of-week
 */
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
 * Returns ISO string or undefined if no match within 7 days.
 */
export function getNextRunTime(cron: string): string | undefined {
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

/** Cron field ranges indexed by position (0=minute, 1=hour, ...) */
const CRON_FIELD_RANGES: [number, number][] = [
  [0, 59], // minute
  [0, 23], // hour
  [1, 31], // day of month
  [1, 12], // month
  [0, 6], // day of week
];

/**
 * Validate a cron expression string. Throws if invalid.
 */
export function validateCronExpression(cron: string): void {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new Error(`Invalid cron expression: "${cron}" — must have exactly 5 fields`);
  }

  for (let i = 0; i < 5; i++) {
    const field = parts[i];
    if (field === '*') {
      continue;
    }
    const values = parseCronField(field, CRON_FIELD_RANGES[i][0], CRON_FIELD_RANGES[i][1]);
    if (values.length === 0) {
      throw new Error(
        `Invalid cron expression: "${cron}" — field ${i + 1} ("${field}") has no valid values`,
      );
    }
  }
}
