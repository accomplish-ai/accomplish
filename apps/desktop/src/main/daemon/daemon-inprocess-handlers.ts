/**
 * Daemon In-Process Handlers
 *
 * Registers all RPC method handlers on the in-process DaemonServer.
 */

import {
  DaemonServer,
  addScheduledTask,
  listScheduledTasks,
  cancelScheduledTask,
  createTaskId,
} from '@accomplish_ai/agent-core';
import type { TaskManagerAPI, StorageAPI } from '@accomplish_ai/agent-core';
import { getLogCollector } from '../logging';
import { buildInProcessCallbacks } from './daemon-inprocess-callbacks';
import { registerPermissionHandlers } from './daemon-inprocess-permissions';

/**
 * Register in-process daemon handlers (same as daemon/entry.ts).
 */
export function registerInProcessHandlers(
  srv: DaemonServer,
  taskManager: TaskManagerAPI,
  storage: StorageAPI,
): void {
  srv.registerMethod('task.get', (params) => {
    if (!params) {
      return null;
    }
    return storage.getTask(params.taskId) ?? null;
  });

  srv.registerMethod('task.list', () => storage.getTasks());
  srv.registerMethod('task.delete', (params) => {
    if (params) storage.deleteTask(params.taskId);
  });
  srv.registerMethod('task.clearHistory', () => storage.clearHistory());

  srv.registerMethod('task.getTodos', (params) => {
    if (!params) {
      return [];
    }
    return storage.getTodosForTask(params.taskId);
  });

  srv.registerMethod('task.cancel', async (params) => {
    if (!params) {
      return;
    }
    const { taskId } = params;
    if (taskManager.cancelQueuedTask(taskId)) {
      storage.updateTaskStatus(taskId, 'cancelled', new Date().toISOString());
      return;
    }
    if (taskManager.hasActiveTask(taskId)) {
      await taskManager.cancelTask(taskId);
      storage.updateTaskStatus(taskId, 'cancelled', new Date().toISOString());
    }
  });

  srv.registerMethod('task.interrupt', async (params) => {
    if (!params) {
      return;
    }
    if (taskManager.hasActiveTask(params.taskId)) {
      await taskManager.interruptTask(params.taskId);
    }
  });

  srv.registerMethod('task.sendResponse', async (params) => {
    if (!params) {
      return;
    }
    await taskManager.sendResponse(params.taskId, params.response);
  });

  srv.registerMethod('task.getActiveIds', () => taskManager.getActiveTaskIds());
  srv.registerMethod('task.getActiveCount', () => taskManager.getActiveTaskCount());
  srv.registerMethod('task.hasActive', (params) =>
    params ? taskManager.hasActiveTask(params.taskId) : false,
  );
  srv.registerMethod('task.isQueued', (params) =>
    params ? taskManager.isTaskQueued(params.taskId) : false,
  );

  srv.registerMethod('task.cancelQueued', (params) => {
    if (!params) {
      return false;
    }
    const cancelled = taskManager.cancelQueuedTask(params.taskId);
    if (cancelled) storage.updateTaskStatus(params.taskId, 'cancelled', new Date().toISOString());
    return cancelled;
  });

  srv.registerMethod('storage.saveTask', (params) => {
    if (params) storage.saveTask(params.task);
  });
  srv.registerMethod('storage.updateTaskStatus', (params) => {
    if (params) storage.updateTaskStatus(params.taskId, params.status, params.completedAt);
  });
  srv.registerMethod('storage.updateTaskSummary', (params) => {
    if (params) storage.updateTaskSummary(params.taskId, params.summary);
  });
  srv.registerMethod('storage.addTaskMessage', (params) => {
    if (params) storage.addTaskMessage(params.taskId, params.message);
  });

  // ── Task execution ────────────────────────────────────────────────

  srv.registerMethod('task.start', async (params) => {
    if (!params) {
      throw new Error('Missing task.start params');
    }
    const { taskId: providedTaskId, config } = params;
    const taskId = providedTaskId ?? createTaskId();
    storage.saveTask({
      taskId,
      status: 'pending',
      config,
      createdAt: new Date().toISOString(),
    } as unknown as Parameters<StorageAPI['saveTask']>[0]);
    const callbacks = buildInProcessCallbacks(taskId, srv, storage);
    const task = await taskManager.startTask(taskId, config, callbacks);
    try {
      storage.saveTask(task);
    } catch {
      // post-start persistence failure — task is running, don't mark as failed
    }
    return task;
  });

  srv.registerMethod('session.resume', async (params) => {
    if (!params) {
      throw new Error('Missing session.resume params');
    }
    const { sessionId, prompt, existingTaskId } = params;
    const taskId = existingTaskId ?? createTaskId();
    if (!existingTaskId) {
      storage.saveTask({
        taskId,
        status: 'pending',
        config: { prompt, sessionId },
        createdAt: new Date().toISOString(),
      } as unknown as Parameters<StorageAPI['saveTask']>[0]);
    }
    const callbacks = buildInProcessCallbacks(taskId, srv, storage);
    try {
      const task = await taskManager.startTask(taskId, { prompt, sessionId }, callbacks);
      if (existingTaskId) {
        storage.updateTaskStatus(existingTaskId, task.status, new Date().toISOString());
      } else {
        storage.saveTask(task);
      }
      return task;
    } catch (err) {
      storage.updateTaskStatus(taskId, 'failed', new Date().toISOString());
      throw err;
    }
  });

  // ── Permission + Scheduling ───────────────────────────────────────
  registerPermissionHandlers(srv, taskManager);

  srv.registerMethod('task.schedule', (params) => {
    if (!params) {
      throw new Error('Missing schedule params');
    }
    return addScheduledTask(params.cron, params.prompt);
  });
  srv.registerMethod('task.listScheduled', () => listScheduledTasks());
  srv.registerMethod('task.cancelScheduled', (params) => {
    if (params) cancelScheduledTask(params.scheduleId);
  });

  getLogCollector().logEnv('INFO', '[DaemonBootstrap] In-process handlers registered');
}
