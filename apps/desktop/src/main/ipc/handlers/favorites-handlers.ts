import type { IpcMainInvokeEvent } from 'electron';
import { handle } from './utils';
import { getDaemonClient } from '../../daemon-bootstrap';

export function registerFavoritesHandlers(): void {
  // Milestone 3 sub-chunk 3c: all favorite reads/writes route through the
  // daemon. `favorites.add` on the daemon side is a thin pass-through
  // over `StorageAPI.addFavorite(taskId, prompt, summary?)` — the task's
  // prompt + summary have to be fetched separately via `task.get` since
  // the daemon doesn't derive them from the taskId.

  handle('favorites:list', async () => {
    return getDaemonClient().call('favorites.list');
  });

  handle('favorites:add', async (_event: IpcMainInvokeEvent, taskId: string) => {
    const client = getDaemonClient();
    const task = await client.call('task.get', { taskId });
    if (!task) {
      throw new Error(`Favorite failed: task not found (taskId: ${taskId})`);
    }
    const allowedFavoriteStatuses: Array<'completed' | 'interrupted'> = [
      'completed',
      'interrupted',
    ];
    if (!allowedFavoriteStatuses.includes(task.status as 'completed' | 'interrupted')) {
      throw new Error(
        `Favorite failed: invalid status (taskId: ${taskId}, status: ${task.status})`,
      );
    }
    await client.call('favorites.add', {
      taskId,
      prompt: task.prompt,
      summary: task.summary,
    });
  });

  handle('favorites:remove', async (_event: IpcMainInvokeEvent, taskId: string) => {
    await getDaemonClient().call('favorites.remove', { taskId });
  });

  handle('favorites:has', async (_event: IpcMainInvokeEvent, taskId: string) => {
    return getDaemonClient().call('favorites.isFavorite', { taskId });
  });
}
