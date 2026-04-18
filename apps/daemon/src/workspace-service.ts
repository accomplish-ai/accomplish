/**
 * WorkspaceService — wraps workspace + knowledge-note repository functions
 * (which live as top-level agent-core exports, not on the StorageAPI surface)
 * and exposes the desktop-facing surface over RPC.
 *
 * Milestone 2 of the daemon-only-SQLite migration
 * (plan: /Users/yanai/.claude/plans/squishy-exploring-hamster.md).
 *
 * Emits `workspace.changed` on every real write. The payload type lives in
 * `@accomplish_ai/agent-core` (`common/types/daemon.ts`) so both daemon and
 * renderer subscribe to the same discriminated union.
 *
 * Invariants ported from the desktop `workspaceManager.ts` so M3 can repoint
 * IPC handlers here without regressing UX:
 *
 *   - `setActive` rejects unknown workspace ids with a clear error.
 *   - `setActive` is a no-op (returns `{ changed: false }`) when the target
 *     is already active — the renderer uses this to skip redundant reloads.
 *   - `delete` refuses to delete the default workspace or a non-existent id,
 *     returning `{ deleted: false }` so callers can surface a UX error.
 *   - When the active workspace is deleted, `delete` first switches active
 *     to the default (or the first remaining workspace) and reports the new
 *     id in `newActiveWorkspaceId`. Without this, `active_workspace_id` would
 *     point at a deleted row and every subsequent read would fail silently.
 *
 * The active-workspace id is NOT cached on this service — every read goes
 * through `getActiveWorkspaceId()` so the daemon stays stateless between
 * restarts. (The desktop `workspaceManager` cached it for synchronous
 * getters in the renderer; that will be handled via events in M3.)
 */
import { EventEmitter } from 'node:events';
import {
  createDefaultWorkspace,
  listWorkspaces,
  getWorkspace,
  createWorkspaceRecord,
  updateWorkspaceRecord,
  deleteWorkspaceRecord,
  getActiveWorkspaceId,
  setActiveWorkspaceId,
  listKnowledgeNotes,
  getKnowledgeNote,
  createKnowledgeNote,
  updateKnowledgeNote,
  deleteKnowledgeNote,
} from '@accomplish_ai/agent-core';
import type {
  KnowledgeNote,
  KnowledgeNoteCreateInput,
  KnowledgeNoteUpdateInput,
  Workspace,
  WorkspaceChangePayload,
  WorkspaceCreateInput,
  WorkspaceDeleteResult,
  WorkspaceSetActiveResult,
  WorkspaceUpdateInput,
} from '@accomplish_ai/agent-core';

/**
 * Event name — subscribe via `service.on(WORKSPACE_CHANGED, listener)`. See
 * SettingsService for why we don't use `declare interface` + class merging.
 */
export const WORKSPACE_CHANGED = 'workspace.changed' as const;

export class WorkspaceService extends EventEmitter {
  /**
   * Bootstrap invariants: ensure the default workspace exists and that
   * `active_workspace_id` points at a real row. Ported from the desktop
   * `workspaceManager.initialize()` so M5's daemon-first startup can drop
   * main's own `workspaceManager.initialize()` call without regressing
   * fresh-profile behavior (migrations only create the tables — they do NOT
   * seed a default row).
   *
   * Idempotent: safe to call on every daemon startup. `createDefaultWorkspace`
   * returns the existing default if one already exists; the active-id
   * normalization only runs when the stored id is missing or stale.
   *
   * Must be called AFTER `StorageService.initialize()` has run (so migrations
   * are applied and `getDatabase()` resolves) and BEFORE any RPC registers —
   * otherwise the first `workspace.list` or `workspace.getActive` on a fresh
   * profile can return `[]` / `null`.
   */
  ensureInitialized(): void {
    const defaultWs = createDefaultWorkspace();
    const activeId = getActiveWorkspaceId();
    if (!activeId || !getWorkspace(activeId)) {
      setActiveWorkspaceId(defaultWs.id);
    }
  }

  // ─── Workspaces ─────────────────────────────────────────────────────────

  list(): Workspace[] {
    return listWorkspaces();
  }

  get(workspaceId: string): Workspace | null {
    return getWorkspace(workspaceId) ?? null;
  }

  getActive(): Workspace | null {
    const id = getActiveWorkspaceId();
    if (!id) {
      return null;
    }
    return getWorkspace(id) ?? null;
  }

  /**
   * Switch the active workspace. Throws if the target workspace doesn't
   * exist. Returns `{ changed: false }` when the target is already active
   * so callers can skip redundant UI reloads.
   */
  setActive(workspaceId: string): WorkspaceSetActiveResult {
    const target = getWorkspace(workspaceId);
    if (!target) {
      throw new Error(`Workspace not found: ${workspaceId}`);
    }
    if (getActiveWorkspaceId() === workspaceId) {
      return { changed: false };
    }
    setActiveWorkspaceId(workspaceId);
    this.emit('workspace.changed', { kind: 'workspace.activeChanged', workspaceId });
    return { changed: true };
  }

  create(input: WorkspaceCreateInput): Workspace {
    const ws = createWorkspaceRecord(input);
    this.emit('workspace.changed', { kind: 'workspace.created', workspaceId: ws.id });
    return ws;
  }

  update(workspaceId: string, input: WorkspaceUpdateInput): Workspace | null {
    const ws = updateWorkspaceRecord(workspaceId, input);
    if (ws) {
      this.emit('workspace.changed', { kind: 'workspace.updated', workspaceId });
    }
    return ws ?? null;
  }

  /**
   * Delete a workspace.
   *
   * - Missing id or default workspace → returns `{ deleted: false }` with no
   *   DB writes and no event emission.
   * - Active workspace → switches the active pointer to the default (or to
   *   the first non-target workspace if no default exists) BEFORE deleting.
   *   Without this fallback, the active_workspace_id column would point at
   *   a deleted row.
   * - Otherwise → deletes and returns `{ deleted: true }`.
   *
   * When a fallback switch happens, the callback receives
   * `newActiveWorkspaceId` so it can update any cached active-id state.
   * The service emits `workspace.activeChanged` FIRST (fallback) then
   * `workspace.deleted` — two separate events, in that order.
   */
  delete(workspaceId: string): WorkspaceDeleteResult {
    const target = getWorkspace(workspaceId);
    if (!target || target.isDefault) {
      return { deleted: false };
    }

    let newActiveWorkspaceId: string | undefined;
    if (getActiveWorkspaceId() === workspaceId) {
      const all = listWorkspaces();
      const defaultWs = all.find((w) => w.isDefault);
      const fallback = defaultWs ?? all.find((w) => w.id !== workspaceId);
      if (fallback) {
        setActiveWorkspaceId(fallback.id);
        newActiveWorkspaceId = fallback.id;
        this.emit('workspace.changed', {
          kind: 'workspace.activeChanged',
          workspaceId: fallback.id,
        });
      }
    }

    const deleted = deleteWorkspaceRecord(workspaceId);
    if (!deleted) {
      // Race condition: the row was gone between our `getWorkspace` check
      // and the `deleteWorkspaceRecord` call. Don't emit the deleted event
      // — the state is the same as before our call.
      return { deleted: false, newActiveWorkspaceId };
    }

    this.emit('workspace.changed', { kind: 'workspace.deleted', workspaceId });
    return { deleted: true, newActiveWorkspaceId };
  }

  // ─── Knowledge notes ────────────────────────────────────────────────────
  //
  // Knowledge notes are scoped to a workspace — their repo functions take
  // `(noteId, workspaceId)` as a composite key. Callers (renderer via RPC)
  // already know the workspaceId from the list page they came from, so
  // threading it through here matches the renderer's data flow without
  // requiring a pre-lookup.

  listKnowledgeNotes(workspaceId: string): KnowledgeNote[] {
    return listKnowledgeNotes(workspaceId);
  }

  getKnowledgeNote(noteId: string, workspaceId: string): KnowledgeNote | null {
    return getKnowledgeNote(noteId, workspaceId) ?? null;
  }

  createKnowledgeNote(input: KnowledgeNoteCreateInput): KnowledgeNote {
    const note = createKnowledgeNote(input);
    this.emit('workspace.changed', {
      kind: 'knowledgeNote.changed',
      workspaceId: note.workspaceId,
    });
    return note;
  }

  updateKnowledgeNote(
    noteId: string,
    workspaceId: string,
    input: KnowledgeNoteUpdateInput,
  ): KnowledgeNote | null {
    const note = updateKnowledgeNote(noteId, workspaceId, input);
    if (note) {
      this.emit('workspace.changed', {
        kind: 'knowledgeNote.changed',
        workspaceId: note.workspaceId,
      });
    }
    return note ?? null;
  }

  deleteKnowledgeNote(noteId: string, workspaceId: string): void {
    const deleted = deleteKnowledgeNote(noteId, workspaceId);
    if (deleted) {
      this.emit('workspace.changed', {
        kind: 'knowledgeNote.changed',
        workspaceId,
      });
    }
  }
}

// Re-export the shared payload type so daemon-routes.ts keeps its existing
// import; single source of truth stays in agent-core.
export type { WorkspaceChangePayload };
