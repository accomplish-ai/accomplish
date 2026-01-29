// apps/desktop/mcp-tools/dev-browser-mcp/src/snapshot/differ.ts

import type { ParsedSnapshot, SnapshotDiff, ElementChange, SnapshotElement } from './types.js';

/**
 * Compare two parsed snapshots and return the diff.
 * Returns null if >70% of elements changed (not worth diffing).
 */
export function diffSnapshots(
  previous: ParsedSnapshot,
  current: ParsedSnapshot
): SnapshotDiff | null {
  const unchangedRefs: string[] = [];
  const changes: ElementChange[] = [];
  const addedRefs: string[] = [];
  const removedRefs: string[] = [];

  // Find elements in current that are new or changed
  for (const [ref, currentEl] of current.elements) {
    const previousEl = previous.elements.get(ref);

    if (!previousEl) {
      // Element is new
      addedRefs.push(ref);
      changes.push({
        ref,
        element: currentEl,
        changeType: 'added',
      });
    } else if (hasElementChanged(previousEl, currentEl)) {
      // Element changed
      changes.push({
        ref,
        element: currentEl,
        previousValue: previousEl.value,
        previousChecked: previousEl.checked,
        previousDisabled: previousEl.disabled,
        previousExpanded: previousEl.expanded,
        previousSelected: previousEl.selected,
        changeType: 'modified',
      });
    } else {
      // Element unchanged
      unchangedRefs.push(ref);
    }
  }

  // Find elements that were removed
  for (const [ref, previousEl] of previous.elements) {
    if (!current.elements.has(ref)) {
      removedRefs.push(ref);
      changes.push({
        ref,
        element: previousEl,
        changeType: 'removed',
      });
    }
  }

  // If >70% changed, not worth diffing
  const totalElements = current.elements.size;
  const changedCount = changes.length;
  if (totalElements > 0 && changedCount / totalElements > 0.7) {
    return null;
  }

  return {
    unchangedRefs,
    changes,
    addedRefs,
    removedRefs,
  };
}

/**
 * Check if an element has meaningfully changed.
 */
function hasElementChanged(previous: SnapshotElement, current: SnapshotElement): boolean {
  // Compare all relevant properties
  return (
    previous.role !== current.role ||
    previous.name !== current.name ||
    previous.value !== current.value ||
    previous.checked !== current.checked ||
    previous.disabled !== current.disabled ||
    previous.expanded !== current.expanded ||
    previous.selected !== current.selected ||
    previous.pressed !== current.pressed
  );
}

/**
 * Format a diff into a compact YAML-like string for the agent.
 */
export function formatDiff(
  diff: SnapshotDiff,
  url: string,
  title: string
): string {
  const lines: string[] = [];

  // Header
  lines.push(`[Same page: ${title}]`);
  lines.push(`[URL: ${url}]`);

  // Unchanged refs - compress consecutive refs
  if (diff.unchangedRefs.length > 0) {
    const compressed = compressRefList(diff.unchangedRefs);
    lines.push(`[Unchanged: ${compressed}]`);
  }

  lines.push('');

  // Changed elements
  if (diff.changes.length > 0) {
    lines.push('Changed:');
    for (const change of diff.changes) {
      lines.push(formatChange(change));
    }
  } else {
    lines.push('[No changes detected]');
  }

  lines.push('');
  lines.push('[Tip: Use browser_snapshot(full_snapshot=true) if elements seem incorrect]');

  return lines.join('\n');
}

/**
 * Format a single element change.
 */
function formatChange(change: ElementChange): string {
  const { ref, element, changeType } = change;
  const lines: string[] = [];

  const prefix = changeType === 'added' ? '+ ' : changeType === 'removed' ? '- ' : '';
  let line = `${prefix}ref: ${ref}`;
  line += `  role: ${element.role}`;
  if (element.name) {
    line += `  name: "${element.name}"`;
  }

  lines.push(line);

  // Show value changes for modified elements
  if (changeType === 'modified') {
    if (element.value !== undefined && element.value !== change.previousValue) {
      lines.push(`  value: "${element.value}"  # was: "${change.previousValue || ''}"`);
    }
    if (element.disabled !== undefined && element.disabled !== change.previousDisabled) {
      lines.push(`  disabled: ${element.disabled}  # was: ${change.previousDisabled || false}`);
    }
    if (element.checked !== undefined && element.checked !== change.previousChecked) {
      lines.push(`  checked: ${element.checked}  # was: ${change.previousChecked || false}`);
    }
    if (element.expanded !== undefined && element.expanded !== change.previousExpanded) {
      lines.push(`  expanded: ${element.expanded}  # was: ${change.previousExpanded || false}`);
    }
    if (element.selected !== undefined && element.selected !== change.previousSelected) {
      lines.push(`  selected: ${element.selected}  # was: ${change.previousSelected || false}`);
    }
  } else if (changeType === 'added' && element.value) {
    lines.push(`  value: "${element.value}"`);
  }

  return lines.join('\n');
}

/**
 * Compress a list of refs like ['e1', 'e2', 'e3', 'e5', 'e6'] into 'e1-e3, e5-e6'
 */
export function compressRefList(refs: string[]): string {
  if (refs.length === 0) return '';

  // Extract numbers and sort
  const numbers = refs
    .map(ref => parseInt(ref.replace('e', ''), 10))
    .sort((a, b) => a - b);

  const ranges: string[] = [];
  let rangeStart = numbers[0];
  let rangeEnd = numbers[0];

  for (let i = 1; i < numbers.length; i++) {
    if (numbers[i] === rangeEnd + 1) {
      rangeEnd = numbers[i];
    } else {
      ranges.push(rangeStart === rangeEnd ? `e${rangeStart}` : `e${rangeStart}-e${rangeEnd}`);
      rangeStart = numbers[i];
      rangeEnd = numbers[i];
    }
  }
  ranges.push(rangeStart === rangeEnd ? `e${rangeStart}` : `e${rangeStart}-e${rangeEnd}`);

  return ranges.join(', ');
}
