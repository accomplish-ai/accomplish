import { create } from 'zustand';
import {
  type Task,
  type TaskConfig,
  type TaskStatus,
  type TaskUpdateEvent,
  type PermissionRequest,
  type PermissionResponse,
  type TaskMessage,
  type TodoItem,
} from '@accomplish_ai/agent-core/common';
import type { StoredFavorite } from '@accomplish_ai/agent-core';
import { createTaskExecutionActions } from './task-execution-actions';
import { createTaskHistoryActions } from './task-history-actions';
import { createTaskSetupActions } from './task-setup-actions';
import { registerTaskSubscriptions } from './task-subscriptions';

interface TaskUpdateBatchEvent {
  taskId: string;
  messages: TaskMessage[];
}

interface StartupStageInfo {
  stage: string;
  message: string;
  modelName?: string;
  isFirstTask: boolean;
  startTime: number;
}

export interface TaskState {
  _taskStateToken: number;
  currentTask: Task | null;
  isLoading: boolean;
  error: string | null;
  tasks: Task[];
  favorites: StoredFavorite[];
  favoritesLoaded: boolean;
  loadFavorites: () => Promise<void>;
  addFavorite: (taskId: string) => Promise<void>;
  removeFavorite: (taskId: string) => Promise<void>;
  permissionRequests: Record<string, PermissionRequest>;
  setupProgress: string | null;
  setupProgressTaskId: string | null;
  setupDownloadStep: number;
  startupStage: StartupStageInfo | null;
  startupStageTaskId: string | null;
  todos: TodoItem[];
  todosTaskId: string | null;
  authError: { providerId: string; message: string } | null;
  isLauncherOpen: boolean;
  launcherInitialPrompt: string | null;
  openLauncher: () => void;
  openLauncherWithPrompt: (prompt: string) => void;
  closeLauncher: () => void;
  startTask: (config: TaskConfig) => Promise<Task | null>;
  setSetupProgress: (taskId: string | null, message: string | null) => void;
  setStartupStage: (
    taskId: string | null,
    stage: string | null,
    message?: string,
    modelName?: string,
    isFirstTask?: boolean,
  ) => void;
  clearStartupStage: (taskId: string) => void;
  sendFollowUp: (
    message: string,
    attachments?: import('@accomplish_ai/agent-core/common').FileAttachmentInfo[],
  ) => Promise<boolean>;
  cancelTask: () => Promise<void>;
  interruptTask: () => Promise<void>;
  setPermissionRequest: (request: PermissionRequest) => void;
  clearPermissionRequest: (taskId: string) => void;
  respondToPermission: (response: PermissionResponse) => Promise<void>;
  addTaskUpdate: (event: TaskUpdateEvent) => void;
  addTaskUpdateBatch: (event: TaskUpdateBatchEvent) => void;
  updateTaskStatus: (taskId: string, status: TaskStatus) => void;
  setTaskSummary: (taskId: string, summary: string) => void;
  loadTasks: () => Promise<void>;
  loadTaskById: (taskId: string) => Promise<void>;
  deleteTask: (taskId: string) => Promise<void>;
  clearHistory: () => Promise<void>;
  reset: () => void;
  setTodos: (taskId: string, todos: TodoItem[]) => void;
  clearTodos: () => void;
  setAuthError: (error: { providerId: string; message: string }) => void;
  clearAuthError: () => void;
}

export const useTaskStore = create<TaskState>((set, get) => ({
  _taskStateToken: 0,
  currentTask: null,
  isLoading: false,
  error: null,
  tasks: [],
  favorites: [],
  favoritesLoaded: false,
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
  launcherInitialPrompt: null,

  ...createTaskExecutionActions(set, get),
  ...createTaskHistoryActions(set, get),
  ...createTaskSetupActions(set, get),
}));

registerTaskSubscriptions(() => useTaskStore.getState());
