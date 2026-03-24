import type {
  ParsedSnapshot,
  SnapshotResult,
  SessionHistoryEntry,
  SessionSummary,
} from './types.js';
import { parseSnapshot } from './parser.js';
import { diffSnapshots, formatDiff } from './differ.js';

const SNAPSHOT_TIMEOUT_MS = 30000;

export interface SnapshotManagerOptions {
  fullSnapshot?: boolean;
  interactiveOnly?: boolean;
}

export class SnapshotManager {
  private lastSnapshot: ParsedSnapshot | null = null;
  private lastTimestamp: number = 0;
  private sessionHistory: SessionHistoryEntry[] = [];
  private readonly MAX_HISTORY_SIZE = 10;

  processSnapshot(
    rawYaml: string,
    url: string,
    title: string,
    options: SnapshotManagerOptions = {},
  ): SnapshotResult {
    const currentSnapshot = parseSnapshot(rawYaml, url, title);
    const now = Date.now();

    this.recordNavigation(url, title);

    if (
      options.fullSnapshot ||
      !this.lastSnapshot ||
      now - this.lastTimestamp > SNAPSHOT_TIMEOUT_MS
    ) {
      this.updateState(currentSnapshot, now);
      return { type: 'full', content: rawYaml };
    }

    if (this.isSamePage(currentSnapshot.url)) {
      const diff = diffSnapshots(this.lastSnapshot, currentSnapshot);

      if (!diff) {
        this.updateState(currentSnapshot, now);
        return { type: 'full', content: rawYaml };
      }

      this.updateState(currentSnapshot, now);
      const formattedDiff = formatDiff(diff, url, title);
      return {
        type: 'diff',
        content: formattedDiff,
        unchangedRefs: diff.unchangedRefs,
      };
    }

    this.updateState(currentSnapshot, now);
    return { type: 'full', content: rawYaml };
  }

  reset(): void {
    this.lastSnapshot = null;
    this.lastTimestamp = 0;
    this.sessionHistory = [];
  }

  private isSamePage(currentUrl: string): boolean {
    if (!this.lastSnapshot) return false;

    const normalizedCurrent = this.normalizeUrl(currentUrl);
    const normalizedLast = this.normalizeUrl(this.lastSnapshot.url);

    return normalizedCurrent === normalizedLast;
  }

  private normalizeUrl(url: string): string {
    try {
      const parsed = new URL(url);
      parsed.hash = '';
      return parsed.toString();
    } catch {
      return url;
    }
  }

  private updateState(snapshot: ParsedSnapshot, timestamp: number): void {
    this.lastSnapshot = snapshot;
    this.lastTimestamp = timestamp;
  }

  private recordNavigation(url: string, title: string): void {
    this.sessionHistory.push({
      url,
      title,
      timestamp: Date.now(),
      actionsTaken: [],
    });

    if (this.sessionHistory.length > this.MAX_HISTORY_SIZE) {
      this.sessionHistory = this.sessionHistory.slice(-this.MAX_HISTORY_SIZE);
    }
  }

  public getSessionSummary(): SessionSummary {
    if (this.sessionHistory.length === 0) {
      return { history: '', pagesVisited: 0 };
    }

    const history = this.sessionHistory.map((h) => h.title || new URL(h.url).pathname).join(' → ');

    return {
      history,
      pagesVisited: this.sessionHistory.length,
    };
  }
}

let snapshotManagerInstance: SnapshotManager | null = null;

export function getSnapshotManager(): SnapshotManager {
  if (!snapshotManagerInstance) {
    snapshotManagerInstance = new SnapshotManager();
  }
  return snapshotManagerInstance;
}

export function resetSnapshotManager(): void {
  if (snapshotManagerInstance) {
    snapshotManagerInstance.reset();
  }
}
