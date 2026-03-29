import type { TodoItem } from '@accomplish_ai/agent-core/common';
import type { TaskState } from './taskStore';

type SetFn = (partial: Partial<TaskState> | ((state: TaskState) => Partial<TaskState>)) => void;
type GetFn = () => TaskState;

/** Setup, launcher, todos, and auth error slice. */
export function createTaskSetupActions(set: SetFn, get: GetFn) {
  return {
    setSetupProgress: (taskId: string | null, message: string | null) => {
      let step = (get as GetFn)().setupDownloadStep;
      if (message) {
        const lower = message.toLowerCase();
        if (lower.includes('downloading chromium headless')) {
          step = 3;
        } else if (lower.includes('downloading ffmpeg')) {
          step = 2;
        } else if (lower.includes('downloading chromium')) {
          step = 1;
        }
      }
      set({ setupProgress: message, setupProgressTaskId: taskId, setupDownloadStep: step });
    },

    setStartupStage: (
      taskId: string | null,
      stage: string | null,
      message?: string,
      modelName?: string,
      isFirstTask?: boolean,
    ) => {
      if (!taskId || !stage) {
        set({ startupStage: null, startupStageTaskId: null });
        return;
      }
      const currentState = get();
      const startTime =
        currentState.startupStageTaskId === taskId && currentState.startupStage
          ? currentState.startupStage.startTime
          : Date.now();
      set({
        startupStage: {
          stage,
          message: message || stage,
          modelName,
          isFirstTask: isFirstTask ?? false,
          startTime,
        },
        startupStageTaskId: taskId,
      });
    },

    clearStartupStage: (taskId: string) => {
      const currentState = get();
      if (currentState.startupStageTaskId === taskId) {
        set({ startupStage: null, startupStageTaskId: null });
      }
    },

    reset: () => {
      set((state) => ({
        _taskStateToken: state._taskStateToken + 1,
        currentTask: null,
        isLoading: false,
        error: null,
        permissionRequests: {},
        setupProgress: null,
        setupProgressTaskId: null,
        setupDownloadStep: 1,
        startupStage: null,
        startupStageTaskId: null,
        todos: [],
        todosTaskId: null,
        authError: null,
        isLauncherOpen: false,
      }));
    },

    setTodos: (taskId: string, todos: TodoItem[]) => {
      set({ todos, todosTaskId: taskId });
    },

    clearTodos: () => {
      set({ todos: [], todosTaskId: null });
    },

    setAuthError: (error: { providerId: string; message: string }) => {
      set({ authError: error });
    },

    clearAuthError: () => {
      set({ authError: null });
    },

    openLauncher: () => set({ isLauncherOpen: true, launcherInitialPrompt: null }),
    openLauncherWithPrompt: (prompt: string) =>
      set({ isLauncherOpen: true, launcherInitialPrompt: prompt }),
    closeLauncher: () => set({ isLauncherOpen: false, launcherInitialPrompt: null }),
  };
}
