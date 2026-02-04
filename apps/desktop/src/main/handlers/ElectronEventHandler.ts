import type { BrowserWindow } from 'electron';
import type {
  TaskEventHandler,
  TaskMessage,
  TaskProgress,
  TaskResult,
} from '@accomplish/core';

export class ElectronEventHandler implements TaskEventHandler {
  private mainWindow: BrowserWindow;

  constructor(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow;
  }

  onMessage(taskId: string, message: TaskMessage): void {
    this.send('task:message', { taskId, message });
  }

  onProgress(taskId: string, progress: TaskProgress): void {
    this.send('task:progress', { taskId, progress });
  }

  onToolUse(taskId: string, toolName: string, toolInput: unknown): void {
    this.send('task:tool-use', { taskId, toolName, toolInput });
  }

  onComplete(taskId: string, result: TaskResult): void {
    this.send('task:complete', { taskId, result });
  }

  onError(taskId: string, error: Error): void {
    this.send('task:error', {
      taskId,
      error: {
        message: error.message,
        name: error.name,
        stack: error.stack,
      },
    });
  }

  onCancelled(taskId: string): void {
    this.send('task:cancelled', { taskId });
  }

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  private send(channel: string, data: unknown): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }
}
