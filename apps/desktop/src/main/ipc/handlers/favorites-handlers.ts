import type { IpcMainInvokeEvent } from 'electron';
import { getStorage } from '../../store/storage';
import { handle } from './utils';

export function registerFavoritesHandlers(): void {
  const storage = getStorage();

  handle('favorites:list', async () => {
    return storage.getFavorites();
  });

  handle('favorites:add', async (_event: IpcMainInvokeEvent, taskId: string) => {
    const task = storage.getTask(taskId);
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
    storage.addFavorite(taskId, task.prompt, task.summary);
  });

  handle('favorites:remove', async (_event: IpcMainInvokeEvent, taskId: string) => {
    storage.removeFavorite(taskId);
  });

  handle('favorites:has', async (_event: IpcMainInvokeEvent, taskId: string) => {
    return storage.isFavorite(taskId);
  });
}
