import type { TaskStatus } from '@accomplish_ai/agent-core';
import { getAccomplish } from '../lib/accomplish';
import type { TaskState } from './taskStore';
import { hasTaskStateToken } from './task-state-helpers';

type SetFn = (partial: Partial<TaskState> | ((state: TaskState) => Partial<TaskState>)) => void;
type GetFn = () => TaskState;

/**
 * Groups task-stop actions so the store can expose a consistent API for
 * ending active work while guarding updates against stale task state.
 */
export function createTaskLifecycleActions(set: SetFn, get: GetFn) {
  return {
    cancelTask: async () => {
      const accomplish = getAccomplish();
      const { currentTask } = get();
      if (currentTask) {
        const taskStateToken = get()._taskStateToken;
        void accomplish.logEvent({
          level: 'info',
          message: 'UI cancel task',
          context: { taskId: currentTask.id },
        });
        try {
          await accomplish.cancelTask(currentTask.id);
          if (!hasTaskStateToken(get(), taskStateToken)) {
            return;
          }
          set((state) => ({
            currentTask: state.currentTask ? { ...state.currentTask, status: 'cancelled' } : null,
            tasks: state.tasks.map((t) =>
              t.id === currentTask.id ? { ...t, status: 'cancelled' as TaskStatus } : t,
            ),
            isLoading: false,
          }));
        } catch (err) {
          if (!hasTaskStateToken(get(), taskStateToken)) {
            return;
          }
          set({ isLoading: false, error: err instanceof Error ? err.message : 'Failed to cancel task' });
          void accomplish.logEvent({
            level: 'error',
            message: 'UI cancel task failed',
            context: { taskId: currentTask.id, error: err instanceof Error ? err.message : String(err) },
          });
        }
      }
    },

    interruptTask: async () => {
      const accomplish = getAccomplish();
      const { currentTask } = get();
      if (currentTask && currentTask.status === 'running') {
        const taskStateToken = get()._taskStateToken;
        void accomplish.logEvent({
          level: 'info',
          message: 'UI interrupt task',
          context: { taskId: currentTask.id },
        });
        try {
          await accomplish.interruptTask(currentTask.id);
        } catch (err) {
          if (!hasTaskStateToken(get(), taskStateToken)) {
            return;
          }
          set({ error: err instanceof Error ? err.message : 'Failed to interrupt task' });
          void accomplish.logEvent({
            level: 'error',
            message: 'UI interrupt task failed',
            context: { taskId: currentTask.id, error: err instanceof Error ? err.message : String(err) },
          });
        }
      }
    },
  };
}
