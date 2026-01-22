// apps/desktop/skills/dev-browser-mcp/src/snapshot/manager.ts

import type { ParsedSnapshot, SnapshotResult } from './types.js';
import { parseSnapshot } from './parser.js';
import { diffSnapshots, formatDiff } from './differ.js';

const SNAPSHOT_TIMEOUT_MS = 30000; // 30 seconds

export interface SnapshotManagerOptions {
  fullSnapshot?: boolean;
  interactiveOnly?: boolean;
}

/**
 * Manages snapshot state and decides whether to return full snapshots or diffs.
 *
 * Singleton per MCP server session - tracks the last snapshot to enable diffing.
 */
export class SnapshotManager {
  private lastSnapshot: ParsedSnapshot | null = null;
  private lastTimestamp: number = 0;

  /**
   * Process a new snapshot and decide whether to return full or diff.
   *
   * @param rawYaml - The raw YAML snapshot from the browser
   * @param url - Current page URL
   * @param title - Current page title
   * @param options - Processing options
   * @returns Full snapshot or diff result
   */
  processSnapshot(
    rawYaml: string,
    url: string,
    title: string,
    options: SnapshotManagerOptions = {}
  ): SnapshotResult {
    const currentSnapshot = parseSnapshot(rawYaml, url, title);
    const now = Date.now();

    // Force full snapshot if:
    // 1. Explicitly requested
    // 2. No previous snapshot
    // 3. Timeout exceeded (page may have changed significantly)
    if (
      options.fullSnapshot ||
      !this.lastSnapshot ||
      now - this.lastTimestamp > SNAPSHOT_TIMEOUT_MS
    ) {
      this.updateState(currentSnapshot, now);
      return { type: 'full', content: rawYaml };
    }

    // Check if same page
    if (this.isSamePage(currentSnapshot.url)) {
      const diff = diffSnapshots(this.lastSnapshot, currentSnapshot);

      // If too many changes, fall back to full snapshot
      if (!diff) {
        this.updateState(currentSnapshot, now);
        return { type: 'full', content: rawYaml };
      }

      // Return diff
      this.updateState(currentSnapshot, now);
      const formattedDiff = formatDiff(diff, url, title);
      return {
        type: 'diff',
        content: formattedDiff,
        unchangedRefs: diff.unchangedRefs,
      };
    }

    // New page - return full snapshot
    this.updateState(currentSnapshot, now);
    return { type: 'full', content: rawYaml };
  }

  /**
   * Reset the snapshot state. Call this after navigation or on errors.
   */
  reset(): void {
    this.lastSnapshot = null;
    this.lastTimestamp = 0;
  }

  /**
   * Check if current URL is the same page as last snapshot.
   * Normalizes URLs by removing hash fragments.
   */
  private isSamePage(currentUrl: string): boolean {
    if (!this.lastSnapshot) return false;

    const normalizedCurrent = this.normalizeUrl(currentUrl);
    const normalizedLast = this.normalizeUrl(this.lastSnapshot.url);

    return normalizedCurrent === normalizedLast;
  }

  /**
   * Normalize URL by removing hash fragment for SPA comparison.
   */
  private normalizeUrl(url: string): string {
    try {
      const parsed = new URL(url);
      parsed.hash = '';
      return parsed.toString();
    } catch {
      return url;
    }
  }

  /**
   * Update internal state with new snapshot.
   */
  private updateState(snapshot: ParsedSnapshot, timestamp: number): void {
    this.lastSnapshot = snapshot;
    this.lastTimestamp = timestamp;
  }
}

// Singleton instance for the MCP server session
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
