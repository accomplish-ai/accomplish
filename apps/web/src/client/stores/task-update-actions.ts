import type {
  TaskStatus,
  TaskUpdateEvent,
  TaskMessage,
} from '@accomplish_ai/agent-core';
import { getAccomplish } from '../lib/accomplish';
import type { TaskState } from './taskStore';

type SetFn = (partial: Partial<TaskState> | ((state: TaskState) => Partial<TaskState>)) => void;
type GetFn = () => TaskState;

/** Task update event handling slice of the task store. */
export function createTaskUpdateActions(set: SetFn, _get: GetFn) {
  return {
    addTaskUpdate: (event: TaskUpdateEvent) => {
      const accomplish = getAccomplish();
      void accomplish.logEvent({
        level: 'debug',
        message: 'UI task update received',
        context: { ...event },
      });
      set((state) => {
        const isCurrentTask = state.currentTask?.id === event.taskId;
        let updatedCurrentTask = state.currentTask;
        let updatedTasks = state.tasks;
        let newStatus: TaskStatus | null = null;
        if (event.type === 'message' && event.message && isCurrentTask && state.currentTask) {
          updatedCurrentTask = {
            ...state.currentTask,
            messages: [...state.currentTask.messages, event.message],
          };
        }
        if (event.type === 'complete' && event.result) {
          if (event.result.status === 'success') {
            newStatus = 'completed';
          } else if (event.result.status === 'interrupted') {
            newStatus = 'interrupted';
          } else {
            newStatus = 'failed';
          }
          if (isCurrentTask && state.currentTask) {
            updatedCurrentTask = {
              ...state.currentTask,
              status: newStatus,
              result: event.result,
              completedAt: newStatus === 'interrupted' ? undefined : new Date().toISOString(),
              sessionId: event.result.sessionId || state.currentTask.sessionId,
            };
          }
        }
        if (event.type === 'error') {
          newStatus = 'failed';
          if (isCurrentTask && state.currentTask) {
            updatedCurrentTask = {
              ...state.currentTask,
              status: newStatus,
              result: { status: 'error', error: event.error },
            };
          }
        }
        if (newStatus) {
          const finalStatus = newStatus;
          updatedTasks = state.tasks.map((t) => {
            if (t.id !== event.taskId) return t;
            const taskUpdate: Partial<typeof t> = { status: finalStatus };
            if (isCurrentTask && updatedCurrentTask) {
              // Keep tasks array in sync with currentTask for terminal fields
              taskUpdate.messages = updatedCurrentTask.messages;
              if ('result' in updatedCurrentTask) taskUpdate.result = updatedCurrentTask.result;
              if ('sessionId' in updatedCurrentTask && updatedCurrentTask.sessionId != null) {
                taskUpdate.sessionId = updatedCurrentTask.sessionId;
              }
              if ('completedAt' in updatedCurrentTask && updatedCurrentTask.completedAt != null) {
                taskUpdate.completedAt = updatedCurrentTask.completedAt;
              }
            }
            return { ...t, ...taskUpdate };
          });
        }
        let shouldClearTodos = false;
        if (
          (event.type === 'complete' || event.type === 'error') &&
          state.todosTaskId === event.taskId
        ) {
          const isInterrupted = event.type === 'complete' && event.result?.status === 'interrupted';
          shouldClearTodos = !isInterrupted;
        }
        // Only clear isLoading when the event is for the currently active task
        // Also clear isLoading when the task transitions out of 'queued'
        const wasQueued = state.currentTask?.id === event.taskId && state.currentTask?.status === 'queued';
        const shouldClearLoading =
          isCurrentTask &&
          (newStatus !== null || wasQueued);
        return {
          currentTask: updatedCurrentTask,
          tasks: updatedTasks,
          ...(shouldClearLoading ? { isLoading: false } : {}),
          ...(shouldClearTodos ? { todos: [], todosTaskId: null } : {}),
        };
      });
    },

    addTaskUpdateBatch: (event: { taskId: string; messages: TaskMessage[] }) => {
      const accomplish = getAccomplish();
      void accomplish.logEvent({
        level: 'debug',
        message: 'UI task batch update received',
        context: { taskId: event.taskId, messageCount: event.messages.length },
      });
      set((state) => {
        if (!state.currentTask || state.currentTask.id !== event.taskId) {
          return state;
        }
        const updatedMessages = [...state.currentTask.messages, ...event.messages];
        const updatedTask = {
          ...state.currentTask,
          messages: updatedMessages,
        };
        // Keep tasks array in sync with currentTask batch messages
        const updatedTasks = state.tasks.map((t) =>
          t.id === event.taskId ? { ...t, messages: updatedMessages } : t,
        );
        return { currentTask: updatedTask, tasks: updatedTasks, isLoading: false };
      });
    },

    updateTaskStatus: (taskId: string, status: TaskStatus) => {
      set((state) => ({
        tasks: state.tasks.map((task) =>
          task.id === taskId ? { ...task, status, updatedAt: new Date().toISOString() } : task,
        ),
        currentTask:
          state.currentTask?.id === taskId
            ? { ...state.currentTask, status, updatedAt: new Date().toISOString() }
            : state.currentTask,
      }));
    },

    setTaskSummary: (taskId: string, summary: string) => {
      set((state) => ({
        tasks: state.tasks.map((task) => (task.id === taskId ? { ...task, summary } : task)),
        currentTask:
          state.currentTask?.id === taskId ? { ...state.currentTask, summary } : state.currentTask,
      }));
    },
  };
}
