import { BrowserWindow } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import type { WorkspaceCreateInput, WorkspaceUpdateInput } from '@accomplish_ai/agent-core';
import * as workspaceManager from '../../store/workspaceManager';
import { handle } from './utils';

export function registerWorkspaceHandlers(): void {
  handle('workspace:list', async () => {
    return workspaceManager.listWorkspaces();
  });

  handle('workspace:get-active', async () => {
    return workspaceManager.getActiveWorkspace();
  });

  handle('workspace:switch', async (event: IpcMainInvokeEvent, workspaceId: string) => {
    const window = BrowserWindow.fromWebContents(event.sender);

    let switched: boolean;
    try {
      switched = workspaceManager.switchWorkspace(workspaceId);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      return { success: false, reason };
    }

    if (!switched) {
      return { success: false, reason: 'Switch did not complete (task running or same workspace)' };
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
    const deleted = workspaceManager.deleteWorkspace(id);

    if (deleted && window && !window.isDestroyed()) {
      window.webContents.send('workspace:deleted', { workspaceId: id });
    }

    return deleted;
  });
}
