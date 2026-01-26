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
 * Priority scoring for elements during snapshot truncation.
 * Higher scores = more likely to be included.
 */
export interface ElementPriority {
  ref: string;
  score: number;
  inViewport: boolean;
}

/**
 * Metadata about snapshot truncation.
 */
export interface SnapshotMetadata {
  totalElements: number;
  includedElements: number;
  truncated: boolean;
  estimatedTokens: number;
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
  metadata?: SnapshotMetadata;
}

/**
 * Options for snapshot generation and processing.
 */
export interface SnapshotOptions {
  /** Return all elements without filtering. Default: false */
  fullSnapshot?: boolean;
  /** Only include interactive elements. Default: true */
  interactiveOnly?: boolean;
  /** Maximum number of elements to include. Default: 300, max: 1000 */
  maxElements?: number;
  /** Only include elements visible in viewport. Default: false */
  viewportOnly?: boolean;
  /** Maximum estimated tokens for output. Default: 8000, max: 50000 */
  maxTokens?: number;
  /** Include session navigation history in output. Default: true */
  includeHistory?: boolean;
}

/** Default values for snapshot options */
export const DEFAULT_SNAPSHOT_OPTIONS: Required<SnapshotOptions> = {
  fullSnapshot: false,
  interactiveOnly: true,
  maxElements: 300,
  viewportOnly: false,
  maxTokens: 8000,
  includeHistory: true,
};

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

/**
 * Entry in session navigation history.
 */
export interface SessionHistoryEntry {
  url: string;
  title: string;
  timestamp: number;
  actionsTaken: string[];
}

/**
 * Compact session summary for context.
 */
export interface SessionSummary {
  history: string;  // "Page A → Page B → Page C"
  pagesVisited: number;
  navigationPatternHash?: string;
}