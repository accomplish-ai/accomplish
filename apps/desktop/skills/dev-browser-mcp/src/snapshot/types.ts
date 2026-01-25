// apps/desktop/skills/dev-browser-mcp/src/snapshot/types.ts

/**
 * Represents a parsed element from the ARIA snapshot
 */
export interface SnapshotElement {
  ref: string;
  role: string;
  name: string;
  value?: string;
  checked?: boolean | 'mixed';
  disabled?: boolean;
  expanded?: boolean;
  selected?: boolean;
  level?: number;
  pressed?: boolean | 'mixed';
  url?: string;
  placeholder?: string;
}

/**
 * Represents the full parsed snapshot with elements indexed by ref
 */
export interface ParsedSnapshot {
  url: string;
  title: string;
  timestamp: number;
  elements: Map<string, SnapshotElement>;
  rawYaml: string;
}

/**
 * Represents a change to an element between snapshots
 */
export interface ElementChange {
  ref: string;
  element: SnapshotElement;
  previousValue?: string;
  previousChecked?: boolean | 'mixed';
  previousDisabled?: boolean;
  previousExpanded?: boolean;
  previousSelected?: boolean;
  changeType: 'added' | 'modified' | 'removed';
}

/**
 * Result of diffing two snapshots
 */
export interface SnapshotDiff {
  unchangedRefs: string[];
  changes: ElementChange[];
  addedRefs: string[];
  removedRefs: string[];
}

/**
 * Result from SnapshotManager.processSnapshot()
 */
export type SnapshotResult =
  | { type: 'full'; content: string }
  | { type: 'diff'; content: string; unchangedRefs: string[] };
