import type { BrowserWindow } from 'electron';
import type { PermissionHandler, PermissionRequest, PermissionResponse } from '@accomplish/core';

interface PendingRequest {
  requestId: string;
  taskId: string;
  resolve: (response: PermissionResponse) => void;
}

export class ElectronPermissionHandler implements PermissionHandler {
  private mainWindow: BrowserWindow;
  private pendingRequests = new Map<string, PendingRequest>();

  constructor(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow;
  }

  async requestPermission(request: PermissionRequest): Promise<PermissionResponse> {
    return new Promise((resolve) => {
      const requestId = request.id || `perm-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const requestWithId = { ...request, id: requestId };

      this.pendingRequests.set(requestId, {
        requestId,
        taskId: request.taskId,
        resolve,
      });

      if (!this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('permission:request', requestWithId);
      } else {
        this.pendingRequests.delete(requestId);
        resolve({
          requestId,
          taskId: request.taskId,
          decision: 'deny',
        });
      }
    });
  }

  resolvePermission(requestId: string, response: PermissionResponse): boolean {
    const pending = this.pendingRequests.get(requestId);
    if (pending) {
      this.pendingRequests.delete(requestId);
      pending.resolve(response);
      return true;
    }
    return false;
  }

  hasPendingRequest(requestId: string): boolean {
    return this.pendingRequests.has(requestId);
  }

  cancelAllPending(): void {
    for (const [requestId, pending] of this.pendingRequests) {
      pending.resolve({
        requestId: pending.requestId,
        taskId: pending.taskId,
        decision: 'deny',
      });
      this.pendingRequests.delete(requestId);
    }
  }

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }
}
