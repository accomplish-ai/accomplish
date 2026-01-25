// apps/desktop/skills/dev-browser-mcp/src/snapshot/index.ts

export type {
  SnapshotElement,
  ParsedSnapshot,
  ElementChange,
  SnapshotDiff,
  SnapshotResult,
} from './types.js';

export { parseSnapshot, extractTitleFromSnapshot } from './parser.js';
export { diffSnapshots, formatDiff, compressRefList } from './differ.js';
export {
  SnapshotManager,
  getSnapshotManager,
  resetSnapshotManager,
  type SnapshotManagerOptions,
} from './manager.js';
export * from './tokens.js';
export * from './priority.js';
export * from './compactor.js';
