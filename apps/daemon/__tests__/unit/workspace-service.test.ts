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

    it('setActive forwards + emits activeChanged', () => {
      const changes = capture(service);
      service.setActive('w2');
      expect(mocks.setActiveWorkspaceId).toHaveBeenCalledWith('w2');
      expect(changes).toEqual([{ kind: 'workspace.activeChanged', workspaceId: 'w2' }]);
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

    it('delete forwards + emits deleted', () => {
      const changes = capture(service);
      service.delete('w1');
      expect(mocks.deleteWorkspaceRecord).toHaveBeenCalledWith('w1');
      expect(changes).toEqual([{ kind: 'workspace.deleted', workspaceId: 'w1' }]);
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
