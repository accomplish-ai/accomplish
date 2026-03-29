import type { TaskState } from './taskStore';

export function hasTrackedTask(
  state: Pick<TaskState, 'currentTask' | 'tasks'>,
  taskId: string | null | undefined,
): boolean {
  if (!taskId) {
    return false;
  }
  return state.currentTask?.id === taskId || state.tasks.some((task) => task.id === taskId);
}

export function hasTaskStateToken(
  state: Pick<TaskState, '_taskStateToken'>,
  taskStateToken: number,
): boolean {
  return state._taskStateToken === taskStateToken;
}

export function clearScopedTaskState(
  state: Pick<
    TaskState,
    | '_taskStateToken'
    | 'currentTask'
    | 'isLoading'
    | 'permissionRequests'
    | 'setupProgressTaskId'
    | 'startupStageTaskId'
    | 'todosTaskId'
  >,
  taskId: string,
): Partial<TaskState> {
  const nextState: Partial<TaskState> = {};
  let shouldBumpTaskStateToken = false;

  if (state.currentTask?.id === taskId) {
    nextState.currentTask = null;
    nextState.isLoading = false;
    nextState.error = null;
    shouldBumpTaskStateToken = true;
  }

  if (taskId in state.permissionRequests) {
    const { [taskId]: _, ...rest } = state.permissionRequests;
    nextState.permissionRequests = rest;
  }

  if (state.setupProgressTaskId === taskId) {
    nextState.setupProgress = null;
    nextState.setupProgressTaskId = null;
    nextState.setupDownloadStep = 1;
    shouldBumpTaskStateToken = true;
  }

  if (state.startupStageTaskId === taskId) {
    nextState.startupStage = null;
    nextState.startupStageTaskId = null;
    shouldBumpTaskStateToken = true;
  }

  if (state.todosTaskId === taskId) {
    nextState.todos = [];
    nextState.todosTaskId = null;
    shouldBumpTaskStateToken = true;
  }

  if (shouldBumpTaskStateToken) {
    nextState._taskStateToken = state._taskStateToken + 1;
  }

  return nextState;
}

export function clearAllTaskScopedState(
  state: Pick<TaskState, '_taskStateToken'>,
): Partial<TaskState> {
  return {
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
  };
}
