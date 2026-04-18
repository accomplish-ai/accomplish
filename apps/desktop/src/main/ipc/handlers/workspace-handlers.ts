import { BrowserWindow } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import type {
  KnowledgeNoteCreateInput,
  KnowledgeNoteUpdateInput,
  WorkspaceCreateInput,
  WorkspaceUpdateInput,
} from '@accomplish_ai/agent-core/desktop-main';
import * as workspaceManager from '../../store/workspaceManager';
import { handle } from './utils';
import { getDaemonClient } from '../../daemon-bootstrap';
import { isDaemonStopped } from '../../daemon/daemon-connector';

async function hasDaemonActiveTasks(): Promise<boolean> {
  try {
    // Always try the daemon first — it knows the real task count,
    // even during the 30s drain window after daemon.shutdown
    const client = getDaemonClient();
    const count = await client.call('task.getActiveCount');
    return count > 0;
  } catch {
    // Daemon unreachable. Two cases:
    // 1. Explicitly stopped → no tasks running (allow workspace changes)
    // 2. Crash/disconnect → tasks might still be running (block)
    return !isDaemonStopped();
  }
}

export function registerWorkspaceHandlers(): void {
  // Milestone 3 sub-chunk 3d: workspace + knowledge-note reads/writes
  // route through the daemon. `workspaceManager` is now a thin
  // event-cached RPC wrapper; knowledge notes talk to the daemon
  // directly (they don't need a local cache).
  handle('workspace:list', async () => {
    return workspaceManager.listWorkspaces();
  });

  handle('workspace:get-active', async () => {
    return workspaceManager.getActiveWorkspace();
  });

  handle('workspace:switch', async (event: IpcMainInvokeEvent, workspaceId: string) => {
    const window = BrowserWindow.fromWebContents(event.sender);

    // Check daemon for active tasks (replaces stale desktop TaskManager check)
    if (await hasDaemonActiveTasks()) {
      return { success: false, reason: 'Cannot switch workspace while tasks are running' };
    }

    let switched: boolean;
    try {
      switched = await workspaceManager.switchWorkspace(workspaceId);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      return { success: false, reason };
    }

    if (!switched) {
      return { success: false, reason: 'Switch did not complete (same workspace)' };
    }

    if (window && !window.isDestroyed()) {
      window.webContents.send('workspace:changed', { workspaceId });
    }

    return { success: true };
  });

  handle('workspace:create', async (_event: IpcMainInvokeEvent, input: WorkspaceCreateInput) => {
    return workspaceManager.createWorkspace(input);
  });

  handle(
    'workspace:update',
    async (_event: IpcMainInvokeEvent, id: string, input: WorkspaceUpdateInput) => {
      return workspaceManager.updateWorkspace(id, input);
    },
  );

  handle('workspace:delete', async (event: IpcMainInvokeEvent, id: string) => {
    const window = BrowserWindow.fromWebContents(event.sender);

    // Check daemon for active tasks before deleting active workspace
    if (workspaceManager.getActiveWorkspace() === id && (await hasDaemonActiveTasks())) {
      return false;
    }

    const result = await workspaceManager.deleteWorkspace(id);

    if (result.deleted && window && !window.isDestroyed()) {
      window.webContents.send('workspace:deleted', { workspaceId: id });
    }

    return result.deleted;
  });

  // Knowledge Notes handlers — talk to the daemon directly. No local
  // cache because the renderer subscribes to `knowledgeNote.changed`
  // via the `workspace.changed` forwarder and re-fetches.
  handle('knowledge-notes:list', async (_event: IpcMainInvokeEvent, workspaceId: string) => {
    return getDaemonClient().call('knowledgeNote.list', { workspaceId });
  });

  handle(
    'knowledge-notes:create',
    async (_event: IpcMainInvokeEvent, input: KnowledgeNoteCreateInput) => {
      return getDaemonClient().call('knowledgeNote.create', { input });
    },
  );

  handle(
    'knowledge-notes:update',
    async (
      _event: IpcMainInvokeEvent,
      id: string,
      workspaceId: string,
      input: KnowledgeNoteUpdateInput,
    ) => {
      return getDaemonClient().call('knowledgeNote.update', {
        noteId: id,
        workspaceId,
        input,
      });
    },
  );

  handle(
    'knowledge-notes:delete',
    async (_event: IpcMainInvokeEvent, id: string, workspaceId: string) => {
      await getDaemonClient().call('knowledgeNote.delete', { noteId: id, workspaceId });
    },
  );
}
