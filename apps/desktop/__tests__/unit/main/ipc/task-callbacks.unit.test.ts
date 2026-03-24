import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrowserWindow, WebContents } from 'electron';
import type { TaskMessage } from '@accomplish_ai/agent-core';

vi.mock('@main/services/task-notification', () => ({
  notifyTaskCompletion: vi.fn(),
}));

const mockStorage = {
  addTaskMessage: vi.fn(),
  updateTaskStatus: vi.fn(),
  updateTaskSessionId: vi.fn(),
  clearTodosForTask: vi.fn(),
  saveTodosForTask: vi.fn(),
  getDebugMode: vi.fn(() => false),
  getNotificationsEnabled: vi.fn(() => true),
};

const mockTaskManager = {
  getSessionId: vi.fn(() => null),
};

vi.mock('@main/store/storage', () => ({
  getStorage: vi.fn(() => mockStorage),
}));

vi.mock('@main/opencode', () => ({
  getTaskManager: vi.fn(() => mockTaskManager),
}));

vi.mock('@accomplish_ai/agent-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@accomplish_ai/agent-core')>();
  return {
    ...actual,
    mapResultToStatus: vi.fn(() => 'completed'),
  };
});

import { createTaskCallbacks } from '@main/ipc/task-callbacks';
import { notifyTaskCompletion } from '@main/services/task-notification';

describe('task-callbacks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('stops sending IPC events after the first sender failure', () => {
    const window = {
      isDestroyed: vi.fn(() => false),
    } as unknown as BrowserWindow;
    const sender = {
      isDestroyed: vi.fn(() => false),
      send: vi.fn(() => {
        throw new Error('ERR_IPC_CHANNEL_CLOSED');
      }),
    } as unknown as WebContents;

    const callbacks = createTaskCallbacks({
      taskId: 'task-1',
      window,
      sender,
    });

    callbacks.onProgress({ stage: 'working' });
    callbacks.onProgress({ stage: 'still-working' });

    expect(sender.send).toHaveBeenCalledTimes(1);
  });

  it('continues persisting task messages even after renderer send fails', () => {
    const now = new Date().toISOString();
    const window = {
      isDestroyed: vi.fn(() => false),
    } as unknown as BrowserWindow;
    const sender = {
      isDestroyed: vi.fn(() => false),
      send: vi.fn(() => {
        throw new Error('ERR_IPC_CHANNEL_CLOSED');
      }),
    } as unknown as WebContents;
    const message: TaskMessage = {
      id: 'msg-1',
      type: 'assistant',
      content: 'hello',
      timestamp: now,
    };

    const callbacks = createTaskCallbacks({
      taskId: 'task-1',
      window,
      sender,
    });

    callbacks.onBatchedMessages([message]);
    callbacks.onBatchedMessages([message]);

    expect(sender.send).toHaveBeenCalledTimes(1);
    expect(mockStorage.addTaskMessage).toHaveBeenCalledTimes(2);
  });

  describe('notifications', () => {
    it('calls notifyTaskCompletion on task success', () => {
      const window = {
        isDestroyed: vi.fn(() => false),
        isFocused: vi.fn(() => false),
      } as unknown as BrowserWindow;
      const sender = {
        isDestroyed: vi.fn(() => false),
        send: vi.fn(),
      } as unknown as WebContents;

      const callbacks = createTaskCallbacks({ taskId: 'task-1', window, sender });
      callbacks.onComplete({ status: 'success', sessionId: 'sess-1' } as never);

      expect(notifyTaskCompletion).toHaveBeenCalledWith(window, mockStorage, {
        status: 'success',
        label: 'task-1'.slice(0, 8),
      });
    });

    it('calls notifyTaskCompletion on task error', () => {
      const window = {
        isDestroyed: vi.fn(() => false),
        isFocused: vi.fn(() => false),
      } as unknown as BrowserWindow;
      const sender = {
        isDestroyed: vi.fn(() => false),
        send: vi.fn(),
      } as unknown as WebContents;

      const callbacks = createTaskCallbacks({ taskId: 'task-1', window, sender });
      callbacks.onError(new Error('something failed'));

      expect(notifyTaskCompletion).toHaveBeenCalledWith(window, mockStorage, {
        status: 'error',
        label: 'Task task-1 failed',
      });
    });

    it('does not call notifyTaskCompletion when task is interrupted', () => {
      const window = {
        isDestroyed: vi.fn(() => false),
      } as unknown as BrowserWindow;
      const sender = {
        isDestroyed: vi.fn(() => false),
        send: vi.fn(),
      } as unknown as WebContents;

      const callbacks = createTaskCallbacks({ taskId: 'task-1', window, sender });
      callbacks.onComplete({ status: 'interrupted', sessionId: 'sess-1' } as never);

      expect(notifyTaskCompletion).not.toHaveBeenCalled();
    });
  });
});
