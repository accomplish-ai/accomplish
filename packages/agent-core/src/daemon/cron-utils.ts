/**
 * Cron expression parsing and matching utilities.
 *
 * ESM module — use .js extensions on imports.
 */

/**
 * Parse a cron expression into its 5 fields.
 * Supports: minute hour day-of-month month day-of-week
 * Supports: * (any), numbers, ranges (1-5), commas (1,3,5), steps (*\/N, start-end/step)
 */
export function parseCronField(field: string, min: number, max: number): number[] | null {
  // Wildcard: match all values
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
    // */N — every Nth value
    const stepWildcard = /^\*\/(\d+)$/.exec(part);
    if (stepWildcard) {
      const step = parseInt(stepWildcard[1], 10);
      if (step <= 0) {
        return null;
      }
      for (let i = min; i <= max; i += step) {
        values.push(i);
      }
      continue;
    }

    // start-end or start-end/step
    const rangeStep = /^(\d+)-(\d+)(?:\/(\d+))?$/.exec(part);
    if (rangeStep) {
      const start = parseInt(rangeStep[1], 10);
      const end = parseInt(rangeStep[2], 10);
      const step = rangeStep[3] !== undefined ? parseInt(rangeStep[3], 10) : 1;
      if (start > end || step <= 0) {
        return null;
      }
      for (let i = start; i <= end; i += step) {
        if (i >= min && i <= max) {
          values.push(i);
        }
      }
      continue;
    }

    // Single number
    if (/^\d+$/.test(part)) {
      const val = parseInt(part, 10);
      if (val >= min && val <= max) {
        values.push(val);
      }
      continue;
    }

    // Unrecognised pattern
    return null;
  }

  if (values.length === 0) {
    return null;
  }

  return Array.from(new Set(values)).sort((a, b) => a - b);
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

  if (!minutes || !hours || !doms || !months || !dows) {
    return false;
  }

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
