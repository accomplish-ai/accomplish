import { Notification, type BrowserWindow } from 'electron';
import type { StorageAPI } from '@accomplish_ai/agent-core';

interface NotifyOptions {
  status: 'success' | 'error';
  label: string;
}

export function notifyTaskCompletion(
  mainWindow: BrowserWindow,
  storage: StorageAPI,
  options: NotifyOptions,
): void {
  if (mainWindow.isDestroyed() || mainWindow.isFocused()) return;
  if (!storage.getNotificationsEnabled()) return;

  const title = options.status === 'success' ? 'Task Completed' : 'Task Failed';
  const body = options.label.length > 80 ? options.label.slice(0, 77) + '...' : options.label;

  const notification = new Notification({ title, body });
  notification.on('click', () => {
    if (mainWindow.isDestroyed()) return;
    mainWindow.show();
    mainWindow.focus();
  });
  notification.show();
}
