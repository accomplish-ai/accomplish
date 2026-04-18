/**
 * WorkspaceService — wraps workspace + knowledge-note repository functions
 * (which live as top-level agent-core exports, not on the StorageAPI surface)
 * and exposes the desktop-facing surface over RPC.
 *
 * Milestone 2 of the daemon-only-SQLite migration
 * (plan: /Users/yanai/.claude/plans/squishy-exploring-hamster.md).
 *
 * Emits `workspace.changed` on every write. The payload is a discriminated
 * `{ kind, workspaceId }` so subscribers can patch specific lists rather
 * than re-fetching the whole world.
 */
import { EventEmitter } from 'node:events';
import {
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
  Workspace,
  WorkspaceCreateInput,
  WorkspaceUpdateInput,
  KnowledgeNote,
  KnowledgeNoteCreateInput,
  KnowledgeNoteUpdateInput,
} from '@accomplish_ai/agent-core';

export type WorkspaceChangePayload =
  | { kind: 'workspace.created'; workspaceId: string }
  | { kind: 'workspace.updated'; workspaceId: string }
  | { kind: 'workspace.deleted'; workspaceId: string }
  | { kind: 'workspace.activeChanged'; workspaceId: string }
  | { kind: 'knowledgeNote.changed'; workspaceId: string };

/**
 * Event name — subscribe via `service.on(WORKSPACE_CHANGED, listener)`. The
 * listener receives a `WorkspaceChangePayload`. See SettingsService for
 * why we don't use `declare interface` + class merging here.
 */
export const WORKSPACE_CHANGED = 'workspace.changed' as const;

export class WorkspaceService extends EventEmitter {
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

  setActive(workspaceId: string): void {
    // The repo function disallows null — there's always an active workspace
    // (the bootstrap default is created by `createDefaultWorkspace`). Callers
    // that want to "clear" active should switch to the default workspace's id.
    setActiveWorkspaceId(workspaceId);
    this.emit('workspace.changed', { kind: 'workspace.activeChanged', workspaceId });
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

  delete(workspaceId: string): void {
    deleteWorkspaceRecord(workspaceId);
    this.emit('workspace.changed', { kind: 'workspace.deleted', workspaceId });
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
