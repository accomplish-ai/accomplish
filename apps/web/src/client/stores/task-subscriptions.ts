import {
  STARTUP_STAGES,
  type TaskUpdateEvent,
  type TodoItem,
} from '@accomplish_ai/agent-core/common';
import { createLogger } from '../lib/logger';
import { hasTrackedTask } from './task-state-helpers';

const logger = createLogger('TaskStore');

interface SetupProgressEvent {
  taskId: string;
  stage: string;
  message?: string;
  isFirstTask?: boolean;
  modelName?: string;
}

/** Registers all global IPC subscriptions for the task store. Called once on module load. */
export function registerTaskSubscriptions(getStore: () => import('./taskStore').TaskState) {
  if (typeof window === 'undefined' || !window.accomplish) {
    return;
  }

  window.accomplish.onTaskProgress((progress: unknown) => {
    const event = progress as SetupProgressEvent;
    const state = getStore();

    if (!hasTrackedTask(state, event.taskId)) {
      return;
    }

    if (STARTUP_STAGES.includes(event.stage)) {
      state.setStartupStage(
        event.taskId,
        event.stage,
        event.message,
        event.modelName,
        event.isFirstTask,
      );
      return;
    }
    if (event.stage === 'tool-use') {
      state.clearStartupStage(event.taskId);
      return;
    }
    if (event.stage === 'setup' && event.message) {
      if (event.message.toLowerCase().includes('installed successfully')) {
        state.setSetupProgress(null, null);
      } else {
        state.setSetupProgress(event.taskId, event.message);
      }
      return;
    }
    if (event.message) {
      if (event.message.toLowerCase().includes('installed successfully')) {
        state.setSetupProgress(null, null);
      } else if (event.message.toLowerCase().includes('download')) {
        state.setSetupProgress(event.taskId, event.message);
      }
    }
  });

  window.accomplish.onTaskUpdate((event: unknown) => {
    const updateEvent = event as TaskUpdateEvent;
    if (updateEvent.type === 'complete' || updateEvent.type === 'error') {
      const state = getStore();
      if (state.setupProgressTaskId === updateEvent.taskId) {
        state.setSetupProgress(null, null);
      }
      state.clearStartupStage(updateEvent.taskId);
    }
  });

  window.accomplish.onTaskSummary?.((data: { taskId: string; summary: string }) => {
    getStore().setTaskSummary(data.taskId, data.summary);
  });

  window.accomplish.onTodoUpdate?.((data: { taskId: string; todos: TodoItem[] }) => {
    const state = getStore();
    if (state.currentTask?.id === data.taskId) {
      state.setTodos(data.taskId, data.todos);
    }
  });

  window.accomplish.onAuthError?.((data: { providerId: string; message: string }) => {
    getStore().setAuthError(data);
  });

  window.accomplish.onWorkspaceChanged?.(async () => {
    const state = getStore();
    state.reset();
    try {
      await state.loadTasks();
    } catch (err) {
      logger.error('Failed to load tasks after workspace change:', err);
      return;
    }
    const tasks = getStore().tasks;
    if (tasks.length > 0) {
      window.location.hash = `#/execution/${tasks[0].id}`;
    } else {
      window.location.hash = '#/';
    }
  });
}
