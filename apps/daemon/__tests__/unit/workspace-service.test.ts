import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Milestone 2 — WorkspaceService wraps standalone agent-core repo functions
 * (not StorageAPI methods), so we mock those functions at the module boundary
 * and assert: call-forwarding, event emission, and the (noteId, workspaceId)
 * composite-key threading.
 *
 * `better-sqlite3` isn't loadable in the daemon vitest env, so mocking
 * agent-core here also avoids the `getDatabase()` evaluation inside each
 * repo function.
 */
const mocks = vi.hoisted(() => ({
  createDefaultWorkspace: vi.fn(),
  listWorkspaces: vi.fn(),
  getWorkspace: vi.fn(),
  createWorkspaceRecord: vi.fn(),
  updateWorkspaceRecord: vi.fn(),
  deleteWorkspaceRecord: vi.fn(),
  getActiveWorkspaceId: vi.fn(),
  setActiveWorkspaceId: vi.fn(),
  listKnowledgeNotes: vi.fn(),
  getKnowledgeNote: vi.fn(),
  createKnowledgeNote: vi.fn(),
  updateKnowledgeNote: vi.fn(),
  deleteKnowledgeNote: vi.fn(),
}));

vi.mock('@accomplish_ai/agent-core', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    ...mocks,
  };
});

const { WorkspaceService, WORKSPACE_CHANGED } = await import('../../src/workspace-service.js');
type WorkspaceChangePayload = import('../../src/workspace-service.js').WorkspaceChangePayload;

function capture(service: InstanceType<typeof WorkspaceService>): WorkspaceChangePayload[] {
  const captured: WorkspaceChangePayload[] = [];
  service.on(WORKSPACE_CHANGED, (p) => captured.push(p));
  return captured;
}

describe('WorkspaceService', () => {
  let service: InstanceType<typeof WorkspaceService>;

  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    service = new WorkspaceService();
  });

  // ── ensureInitialized (review P2) ─────────────────────────────────────
  // Ports desktop `workspaceManager.initialize()` so fresh profiles get a
  // default workspace + a normalized active-id even after M5 removes main's
  // initialize() call. Idempotent by design.
  describe('ensureInitialized', () => {
    it('creates the default workspace and sets active when no active id is stored', () => {
      mocks.createDefaultWorkspace.mockReturnValue({ id: 'w-default' });
      mocks.getActiveWorkspaceId.mockReturnValue(null);

      service.ensureInitialized();

      expect(mocks.createDefaultWorkspace).toHaveBeenCalledTimes(1);
      expect(mocks.setActiveWorkspaceId).toHaveBeenCalledWith('w-default');
    });

    it('normalizes a stale active id pointing at a deleted workspace', () => {
      mocks.createDefaultWorkspace.mockReturnValue({ id: 'w-default' });
      mocks.getActiveWorkspaceId.mockReturnValue('w-gone');
      mocks.getWorkspace.mockReturnValue(undefined);

      service.ensureInitialized();

      expect(mocks.setActiveWorkspaceId).toHaveBeenCalledWith('w-default');
    });

    it('leaves active id untouched when it still points at a real workspace', () => {
      mocks.createDefaultWorkspace.mockReturnValue({ id: 'w-default' });
      mocks.getActiveWorkspaceId.mockReturnValue('w-custom');
      mocks.getWorkspace.mockReturnValue({ id: 'w-custom' });

      service.ensureInitialized();

      // createDefault still runs (idempotent) — but no pointer rewrite.
      expect(mocks.createDefaultWorkspace).toHaveBeenCalledTimes(1);
      expect(mocks.setActiveWorkspaceId).not.toHaveBeenCalled();
    });
  });

  describe('workspaces', () => {
    it('list forwards to listWorkspaces and returns its result', () => {
      mocks.listWorkspaces.mockReturnValue([{ id: 'w1' }]);
      expect(service.list()).toEqual([{ id: 'w1' }]);
    });

    it('get returns null when the repo returns undefined', () => {
      mocks.getWorkspace.mockReturnValue(undefined);
      expect(service.get('w404')).toBeNull();
    });

    it('getActive returns null when no active id', () => {
      mocks.getActiveWorkspaceId.mockReturnValue(null);
      expect(service.getActive()).toBeNull();
      expect(mocks.getWorkspace).not.toHaveBeenCalled();
    });

    it('getActive loads the workspace row when an id is set', () => {
      mocks.getActiveWorkspaceId.mockReturnValue('w1');
      mocks.getWorkspace.mockReturnValue({ id: 'w1', name: 'Default' });
      expect(service.getActive()).toEqual({ id: 'w1', name: 'Default' });
    });

    // ── setActive invariants (review P2a) ──────────────────────────────
    describe('setActive', () => {
      it('throws when the target workspace does not exist', () => {
        mocks.getWorkspace.mockReturnValue(undefined);
        expect(() => service.setActive('w-missing')).toThrow(/not found/);
        expect(mocks.setActiveWorkspaceId).not.toHaveBeenCalled();
      });

      it('returns { changed: false } and does NOT emit when already active', () => {
        mocks.getWorkspace.mockReturnValue({ id: 'w1' });
        mocks.getActiveWorkspaceId.mockReturnValue('w1');
        const changes = capture(service);

        expect(service.setActive('w1')).toEqual({ changed: false });
        expect(mocks.setActiveWorkspaceId).not.toHaveBeenCalled();
        expect(changes).toEqual([]);
      });

      it('writes and emits when switching to a different workspace', () => {
        mocks.getWorkspace.mockReturnValue({ id: 'w2' });
        mocks.getActiveWorkspaceId.mockReturnValue('w1');
        const changes = capture(service);

        expect(service.setActive('w2')).toEqual({ changed: true });
        expect(mocks.setActiveWorkspaceId).toHaveBeenCalledWith('w2');
        expect(changes).toEqual([{ kind: 'workspace.activeChanged', workspaceId: 'w2' }]);
      });
    });

    it('create forwards input, returns the new row, and emits created', () => {
      mocks.createWorkspaceRecord.mockReturnValue({ id: 'w-new' });
      const changes = capture(service);
      const created = service.create({ name: 'New' } as never);
      expect(mocks.createWorkspaceRecord).toHaveBeenCalledWith({ name: 'New' });
      expect(created).toEqual({ id: 'w-new' });
      expect(changes).toEqual([{ kind: 'workspace.created', workspaceId: 'w-new' }]);
    });

    it('update emits only when the repo returns a row', () => {
      mocks.updateWorkspaceRecord.mockReturnValue(null);
      const changes = capture(service);
      expect(service.update('w404', {} as never)).toBeNull();
      expect(changes).toEqual([]);

      mocks.updateWorkspaceRecord.mockReturnValue({ id: 'w1' });
      service.update('w1', { name: 'X' } as never);
      expect(changes).toEqual([{ kind: 'workspace.updated', workspaceId: 'w1' }]);
    });

    // ── delete invariants (review P2a) ─────────────────────────────────
    describe('delete', () => {
      it('returns { deleted: false } and does NOT emit when the workspace does not exist', () => {
        mocks.getWorkspace.mockReturnValue(undefined);
        const changes = capture(service);

        expect(service.delete('w-missing')).toEqual({ deleted: false });
        expect(mocks.deleteWorkspaceRecord).not.toHaveBeenCalled();
        expect(mocks.setActiveWorkspaceId).not.toHaveBeenCalled();
        expect(changes).toEqual([]);
      });

      it('refuses to delete the default workspace', () => {
        mocks.getWorkspace.mockReturnValue({ id: 'w-default', isDefault: true });
        const changes = capture(service);

        expect(service.delete('w-default')).toEqual({ deleted: false });
        expect(mocks.deleteWorkspaceRecord).not.toHaveBeenCalled();
        expect(changes).toEqual([]);
      });

      it('deletes a non-active, non-default workspace and emits deleted', () => {
        mocks.getWorkspace.mockReturnValue({ id: 'w1', isDefault: false });
        mocks.getActiveWorkspaceId.mockReturnValue('w-active');
        mocks.deleteWorkspaceRecord.mockReturnValue(true);
        const changes = capture(service);

        const result = service.delete('w1');

        expect(result).toEqual({ deleted: true });
        expect(mocks.setActiveWorkspaceId).not.toHaveBeenCalled();
        expect(changes).toEqual([{ kind: 'workspace.deleted', workspaceId: 'w1' }]);
      });

      it('switches active to the default BEFORE deleting the active workspace', () => {
        mocks.getWorkspace.mockReturnValue({ id: 'w-active', isDefault: false });
        mocks.getActiveWorkspaceId.mockReturnValue('w-active');
        mocks.listWorkspaces.mockReturnValue([
          { id: 'w-default', isDefault: true },
          { id: 'w-active', isDefault: false },
        ]);
        mocks.deleteWorkspaceRecord.mockReturnValue(true);
        const changes = capture(service);

        const result = service.delete('w-active');

        expect(result).toEqual({
          deleted: true,
          newActiveWorkspaceId: 'w-default',
        });
        // Order: activeChanged FIRST (preempts stale pointer), deleted SECOND
        expect(changes).toEqual([
          { kind: 'workspace.activeChanged', workspaceId: 'w-default' },
          { kind: 'workspace.deleted', workspaceId: 'w-active' },
        ]);
        // And the repo call order matches — setActive before delete
        const setActiveOrder = mocks.setActiveWorkspaceId.mock.invocationCallOrder[0];
        const deleteOrder = mocks.deleteWorkspaceRecord.mock.invocationCallOrder[0];
        expect(setActiveOrder).toBeLessThan(deleteOrder);
      });

      it('falls back to the first remaining workspace when no default exists', () => {
        // This is the (unlikely but possible) edge case where someone
        // deletes the default or a profile is imported without one.
        mocks.getWorkspace.mockReturnValue({ id: 'w-active', isDefault: false });
        mocks.getActiveWorkspaceId.mockReturnValue('w-active');
        mocks.listWorkspaces.mockReturnValue([
          { id: 'w-active', isDefault: false },
          { id: 'w-other', isDefault: false },
        ]);
        mocks.deleteWorkspaceRecord.mockReturnValue(true);

        const result = service.delete('w-active');

        expect(result.newActiveWorkspaceId).toBe('w-other');
        expect(mocks.setActiveWorkspaceId).toHaveBeenCalledWith('w-other');
      });

      it('handles the race where the row disappears between check and delete', () => {
        mocks.getWorkspace.mockReturnValue({ id: 'w1', isDefault: false });
        mocks.getActiveWorkspaceId.mockReturnValue('w-active');
        // Repo returns false — something raced us
        mocks.deleteWorkspaceRecord.mockReturnValue(false);
        const changes = capture(service);

        const result = service.delete('w1');

        expect(result.deleted).toBe(false);
        // No deleted event emitted — the state didn't change due to our call
        expect(changes.filter((c) => c.kind === 'workspace.deleted')).toEqual([]);
      });
    });
  });

  describe('knowledge notes', () => {
    it('list takes a workspaceId and forwards through', () => {
      mocks.listKnowledgeNotes.mockReturnValue([{ id: 'n1' }]);
      expect(service.listKnowledgeNotes('w1')).toEqual([{ id: 'n1' }]);
      expect(mocks.listKnowledgeNotes).toHaveBeenCalledWith('w1');
    });

    it('get threads the composite (noteId, workspaceId) key to the repo', () => {
      mocks.getKnowledgeNote.mockReturnValue({ id: 'n1', workspaceId: 'w1' });
      service.getKnowledgeNote('n1', 'w1');
      expect(mocks.getKnowledgeNote).toHaveBeenCalledWith('n1', 'w1');
    });

    it('get returns null when the repo returns undefined', () => {
      mocks.getKnowledgeNote.mockReturnValue(undefined);
      expect(service.getKnowledgeNote('missing', 'w1')).toBeNull();
    });

    it('create emits with the note.workspaceId from the returned row', () => {
      mocks.createKnowledgeNote.mockReturnValue({ id: 'n1', workspaceId: 'w-custom' });
      const changes = capture(service);
      service.createKnowledgeNote({ workspaceId: 'w-custom' } as never);
      expect(changes).toEqual([{ kind: 'knowledgeNote.changed', workspaceId: 'w-custom' }]);
    });

    it('update threads (noteId, workspaceId, input) and only emits on success', () => {
      mocks.updateKnowledgeNote.mockReturnValue(null);
      const changes = capture(service);
      expect(service.updateKnowledgeNote('n404', 'w1', {} as never)).toBeNull();
      expect(mocks.updateKnowledgeNote).toHaveBeenCalledWith('n404', 'w1', {});
      expect(changes).toEqual([]);

      mocks.updateKnowledgeNote.mockReturnValue({ id: 'n1', workspaceId: 'w1' });
      service.updateKnowledgeNote('n1', 'w1', { text: 'x' } as never);
      expect(changes).toEqual([{ kind: 'knowledgeNote.changed', workspaceId: 'w1' }]);
    });

    it('delete forwards the composite key and emits only when repo returns true', () => {
      mocks.deleteKnowledgeNote.mockReturnValue(false);
      const changes = capture(service);
      service.deleteKnowledgeNote('n404', 'w1');
      expect(mocks.deleteKnowledgeNote).toHaveBeenCalledWith('n404', 'w1');
      expect(changes).toEqual([]);

      mocks.deleteKnowledgeNote.mockReturnValue(true);
      service.deleteKnowledgeNote('n1', 'w1');
      expect(changes).toEqual([{ kind: 'knowledgeNote.changed', workspaceId: 'w1' }]);
    });
  });
});
