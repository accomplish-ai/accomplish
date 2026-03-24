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

export interface ElementPriority {
  ref: string;
  score: number;
  inViewport: boolean;
}

export interface SnapshotMetadata {
  totalElements: number;
  includedElements: number;
  truncated: boolean;
  estimatedTokens: number;
}

export interface ParsedSnapshot {
  url: string;
  title: string;
  timestamp: number;
  elements: Map<string, SnapshotElement>;
  rawYaml: string;
  metadata?: SnapshotMetadata;
}

export interface SnapshotOptions {
  fullSnapshot?: boolean;
  interactiveOnly?: boolean;
  maxElements?: number;
  viewportOnly?: boolean;
  maxTokens?: number;
  includeHistory?: boolean;
  includeBoundingBoxes?: boolean;
}

export const DEFAULT_SNAPSHOT_OPTIONS: Required<SnapshotOptions> = {
  fullSnapshot: false,
  interactiveOnly: true,
  maxElements: 300,
  viewportOnly: false,
  maxTokens: 8000,
  includeHistory: true,
};

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

export interface SnapshotDiff {
  unchangedRefs: string[];
  changes: ElementChange[];
  addedRefs: string[];
  removedRefs: string[];
}

export type SnapshotResult =
  | { type: 'full'; content: string }
  | { type: 'diff'; content: string; unchangedRefs: string[] };

export interface SessionHistoryEntry {
  url: string;
  title: string;
  timestamp: number;
  actionsTaken: string[];
}

export interface SessionSummary {
  history: string;
  pagesVisited: number;
  navigationPatternHash?: string;
}
