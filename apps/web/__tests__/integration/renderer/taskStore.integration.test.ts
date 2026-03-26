/**
 * Integration tests for taskStore (Zustand)
 * Tests store actions with mocked window.accomplish API
 * @module __tests__/integration/renderer/taskStore.integration.test
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { STARTUP_STAGES } from '@accomplish_ai/agent-core/common';
import type {
  Task,
  TaskConfig,
  TaskStatus,
  TaskMessage,
  TaskResult,
} from '@accomplish_ai/agent-core';

// Helper to create a mock task
function createMockTask(
  id: string,
  prompt: string = 'Test task',
  status: TaskStatus = 'pending',
): Task {
  return {
    id,
    prompt,
    status,
    messages: [],
    createdAt: new Date().toISOString(),
  };
}

// Helper to create a mock message
function createMockMessage(
  id: string,
  type: 'assistant' | 'user' | 'tool' | 'system' = 'assistant',
  content: string = 'Test message',
): TaskMessage {
  return {
    id,
    type,
    content,
    timestamp: new Date().toISOString(),
  };
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

// Mock accomplish API
const mockAccomplish = {
  startTask: vi.fn(),
  cancelTask: vi.fn(),
  interruptTask: vi.fn(),
  resumeSession: vi.fn(),
  respondToPermission: vi.fn(),
  listTasks: vi.fn(),
  getTask: vi.fn(),
  deleteTask: vi.fn(),
  clearTaskHistory: vi.fn(),
  logEvent: vi.fn().mockResolvedValue(undefined),
  getSelectedModel: vi.fn().mockResolvedValue({ provider: 'anthropic', id: 'claude-3-opus' }),
  getOllamaConfig: vi.fn().mockResolvedValue(null),
  isE2EMode: vi.fn().mockResolvedValue(false),
  getProviderSettings: vi.fn().mockResolvedValue({
    activeProviderId: 'anthropic',
    connectedProviders: {
      anthropic: {
        providerId: 'anthropic',
        connectionStatus: 'connected',
        selectedModelId: 'claude-3-5-sonnet-20241022',
        credentials: { type: 'api-key', apiKey: 'test-key' },
      },
    },
    debugMode: false,
  }),
  // Provider settings methods
  setActiveProvider: vi.fn().mockResolvedValue(undefined),
  setConnectedProvider: vi.fn().mockResolvedValue(undefined),
  removeConnectedProvider: vi.fn().mockResolvedValue(undefined),
  setProviderDebugMode: vi.fn().mockResolvedValue(undefined),
  validateApiKeyForProvider: vi.fn().mockResolvedValue({ valid: true }),
  validateBedrockCredentials: vi.fn().mockResolvedValue({ valid: true }),
  saveBedrockCredentials: vi.fn().mockResolvedValue(undefined),
};

// Mock the accomplish module
vi.mock('@/lib/accomplish', () => ({
  getAccomplish: () => mockAccomplish,
}));

// Mock window.accomplish for global subscriptions
const mockOnTaskProgress = vi.fn();
const mockOnTaskUpdate = vi.fn();

function getTaskProgressHandler(): (progress: unknown) => void {
  const handler = mockOnTaskProgress.mock.calls.at(-1)?.[0];
  if (typeof handler !== 'function') {
    throw new Error('Expected task progress handler to be registered');
  }
  return handler as (progress: unknown) => void;
}

vi.stubGlobal('window', {
  accomplish: {
    onTaskProgress: mockOnTaskProgress,
    onTaskUpdate: mockOnTaskUpdate,
    onTodoUpdate: vi.fn(),
    onTaskSummary: vi.fn(),
  },
});

describe('taskStore Integration', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  afterEach(async () => {
    // Reset store state
    try {
      const { useTaskStore } = await import('@/stores/taskStore');
      useTaskStore.setState({
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
      });
    } catch {
      // Store may not be loaded
    }
  });

  describe('initial state', () => {
    it('should have null currentTask initially', async () => {
      // Arrange
      const { useTaskStore } = await import('@/stores/taskStore');

      // Act
      const state = useTaskStore.getState();

      // Assert
      expect(state.currentTask).toBeNull();
    });

    it('should have isLoading as false initially', async () => {
      // Arrange
      const { useTaskStore } = await import('@/stores/taskStore');

      // Act
      const state = useTaskStore.getState();

      // Assert
      expect(state.isLoading).toBe(false);
    });

    it('should have null error initially', async () => {
      // Arrange
      const { useTaskStore } = await import('@/stores/taskStore');

      // Act
      const state = useTaskStore.getState();

      // Assert
      expect(state.error).toBeNull();
    });

    it('should have empty tasks array initially', async () => {
      // Arrange
      const { useTaskStore } = await import('@/stores/taskStore');

      // Act
      const state = useTaskStore.getState();

      // Assert
      expect(state.tasks).toEqual([]);
    });

    it('should have empty permissionRequests initially', async () => {
      // Arrange
      const { useTaskStore } = await import('@/stores/taskStore');

      // Act
      const state = useTaskStore.getState();

      // Assert
      expect(state.permissionRequests).toEqual({});
    });

    it('should have setupDownloadStep as 1 initially', async () => {
      // Arrange
      const { useTaskStore } = await import('@/stores/taskStore');

      // Act
      const state = useTaskStore.getState();

      // Assert
      expect(state.setupDownloadStep).toBe(1);
    });
  });

  describe('startTask', () => {
    it('should call startTask API and update state on success', async () => {
      // Arrange
      const { useTaskStore } = await import('@/stores/taskStore');
      const mockTask = createMockTask('task-123', 'Test prompt', 'running');
      mockAccomplish.startTask.mockResolvedValueOnce(mockTask);

      const config: TaskConfig = { prompt: 'Test prompt' };

      // Act
      const result = await useTaskStore.getState().startTask(config);
      const state = useTaskStore.getState();

      // Assert
      expect(mockAccomplish.startTask).toHaveBeenCalledWith(config);
      expect(result).toEqual(mockTask);
      expect(state.currentTask).toEqual(mockTask);
      expect(state.isLoading).toBe(false);
      expect(state.tasks).toContainEqual(mockTask);
    });

    it('should set isLoading to true for queued tasks', async () => {
      // Arrange
      const { useTaskStore } = await import('@/stores/taskStore');
      const mockTask = createMockTask('task-123', 'Test prompt', 'queued');
      mockAccomplish.startTask.mockResolvedValueOnce(mockTask);

      // Act
      await useTaskStore.getState().startTask({ prompt: 'Test prompt' });
      const state = useTaskStore.getState();

      // Assert
      expect(state.isLoading).toBe(true);
    });

    it('should set error state on failure', async () => {
      // Arrange
      const { useTaskStore } = await import('@/stores/taskStore');
      mockAccomplish.startTask.mockRejectedValueOnce(new Error('API Error'));

      // Act
      const result = await useTaskStore.getState().startTask({ prompt: 'Test prompt' });
      const state = useTaskStore.getState();

      // Assert
      expect(result).toBeNull();
      expect(state.error).toBe('API Error');
      expect(state.isLoading).toBe(false);
    });

    it('should handle non-Error exceptions gracefully', async () => {
      // Arrange
      const { useTaskStore } = await import('@/stores/taskStore');
      mockAccomplish.startTask.mockRejectedValueOnce('String error');

      // Act
      const result = await useTaskStore.getState().startTask({ prompt: 'Test' });
      const state = useTaskStore.getState();

      // Assert
      expect(result).toBeNull();
      expect(state.error).toBe('Failed to start task');
    });

    it('should add task to tasks list', async () => {
      // Arrange
      const { useTaskStore } = await import('@/stores/taskStore');
      const mockTask = createMockTask('task-123', 'Test', 'running');
      mockAccomplish.startTask.mockResolvedValueOnce(mockTask);

      // Set existing tasks
      useTaskStore.setState({ tasks: [createMockTask('existing-task')] });

      // Act
      await useTaskStore.getState().startTask({ prompt: 'Test' });
      const state = useTaskStore.getState();

      // Assert
      expect(state.tasks).toHaveLength(2);
      expect(state.tasks[0].id).toBe('task-123'); // New task should be first
    });

    it('should update existing task if same ID', async () => {
      // Arrange
      const { useTaskStore } = await import('@/stores/taskStore');
      const existingTask = createMockTask('task-123', 'Old prompt', 'pending');
      const updatedTask = createMockTask('task-123', 'New prompt', 'running');
      mockAccomplish.startTask.mockResolvedValueOnce(updatedTask);

      useTaskStore.setState({ tasks: [existingTask] });

      // Act
      await useTaskStore.getState().startTask({ prompt: 'New prompt', taskId: 'task-123' });
      const state = useTaskStore.getState();

      // Assert
      expect(state.tasks).toHaveLength(1);
      expect(state.tasks[0].prompt).toBe('New prompt');
    });

    it('should ignore late startTask completion after history is cleared', async () => {
      // Arrange
      const { useTaskStore } = await import('@/stores/taskStore');
      const deferred = createDeferred<Task>();
      mockAccomplish.startTask.mockReturnValueOnce(deferred.promise);
      mockAccomplish.clearTaskHistory.mockResolvedValueOnce(undefined);

      // Act
      const startTaskPromise = useTaskStore.getState().startTask({ prompt: 'Test prompt' });
      await useTaskStore.getState().clearHistory();
      deferred.resolve(createMockTask('task-123', 'Test prompt', 'running'));
      const result = await startTaskPromise;
      const state = useTaskStore.getState();

      // Assert
      expect(result).toBeNull();
      expect(state.currentTask).toBeNull();
      expect(state.tasks).toEqual([]);
      expect(state.error).toBeNull();
      expect(state.isLoading).toBe(false);
    });
  });

  describe('sendFollowUp', () => {
    it('should show error if no active task', async () => {
      // Arrange
      const { useTaskStore } = await import('@/stores/taskStore');
      useTaskStore.setState({ currentTask: null });

      // Act
      const store = useTaskStore.getState();
      await store.sendFollowUp('Follow up message');

      // Assert
      expect(useTaskStore.getState().error).toBe('No active task to continue');
      expect(mockAccomplish.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'warn',
          message: 'UI follow-up failed: no active task',
        }),
      );
    });

    it('should show error if no session id', async () => {
      // Arrange
      const { useTaskStore } = await import('@/stores/taskStore');
      useTaskStore.setState({
        currentTask: {
          ...createMockTask('task-123', 'Test', 'completed'),
          sessionId: undefined,
          result: undefined,
        },
      });

      // Act
      const store = useTaskStore.getState();
      await store.sendFollowUp('Follow up');

      // Assert
      expect(useTaskStore.getState().error).toBe(
        'No session to continue - please start a new task',
      );
      expect(mockAccomplish.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'warn',
          message: 'UI follow-up failed: missing session',
        }),
      );
    });
    it('should start fresh task for interrupted task without session', async () => {
      // Arrange
      const { useTaskStore } = await import('@/stores/taskStore');
      const interruptedTask: Task = {
        ...createMockTask('task-123', 'Original', 'interrupted'),
      };
      const newTask = createMockTask('task-456', 'Fresh start', 'running');
      mockAccomplish.startTask.mockResolvedValueOnce(newTask);

      useTaskStore.setState({ currentTask: interruptedTask, tasks: [interruptedTask] });

      // Act
      await useTaskStore.getState().sendFollowUp('New message');

      // Assert
      expect(mockAccomplish.startTask).toHaveBeenCalled();
    });

    it('should resume session when task has sessionId', async () => {
      // Arrange
      const { useTaskStore } = await import('@/stores/taskStore');
      const taskWithSession: Task = {
        ...createMockTask('task-123', 'Test', 'completed'),
        sessionId: 'session-abc',
      };
      const resumedTask = createMockTask('task-123', 'Test', 'running');
      mockAccomplish.resumeSession.mockResolvedValueOnce(resumedTask);

      useTaskStore.setState({ currentTask: taskWithSession, tasks: [taskWithSession] });

      // Act
      await useTaskStore.getState().sendFollowUp('Continue please');
      const state = useTaskStore.getState();

      // Assert
      expect(mockAccomplish.resumeSession).toHaveBeenCalledWith(
        'session-abc',
        'Continue please',
        'task-123',
        undefined,
      );
      expect(state.currentTask?.status).toBe('running');
    });

    it('should use result.sessionId if available', async () => {
      // Arrange
      const { useTaskStore } = await import('@/stores/taskStore');
      const taskWithResultSession: Task = {
        ...createMockTask('task-123', 'Test', 'completed'),
        result: { status: 'success', sessionId: 'result-session-xyz' },
      };
      const resumedTask = createMockTask('task-123', 'Test', 'running');
      mockAccomplish.resumeSession.mockResolvedValueOnce(resumedTask);

      useTaskStore.setState({ currentTask: taskWithResultSession, tasks: [taskWithResultSession] });

      // Act
      await useTaskStore.getState().sendFollowUp('More work');

      // Assert
      expect(mockAccomplish.resumeSession).toHaveBeenCalledWith(
        'result-session-xyz',
        'More work',
        'task-123',
        undefined,
      );
    });

    it('should add user message optimistically', async () => {
      // Arrange
      const { useTaskStore } = await import('@/stores/taskStore');
      const taskWithSession: Task = {
        ...createMockTask('task-123', 'Test', 'completed'),
        sessionId: 'session-abc',
        messages: [],
      };
      mockAccomplish.resumeSession.mockResolvedValueOnce(
        createMockTask('task-123', 'Test', 'running'),
      );

      useTaskStore.setState({ currentTask: taskWithSession, tasks: [taskWithSession] });

      // Act
      await useTaskStore.getState().sendFollowUp('User follow up');
      const state = useTaskStore.getState();

      // Assert
      expect(state.currentTask?.messages).toHaveLength(1);
      expect(state.currentTask?.messages[0].type).toBe('user');
      expect(state.currentTask?.messages[0].content).toBe('User follow up');
    });

    it('should handle resumeSession failure', async () => {
      // Arrange
      const { useTaskStore } = await import('@/stores/taskStore');
      const taskWithSession: Task = {
        ...createMockTask('task-123', 'Test', 'completed'),
        sessionId: 'session-abc',
      };
      mockAccomplish.resumeSession.mockRejectedValueOnce(new Error('Resume failed'));

      useTaskStore.setState({ currentTask: taskWithSession, tasks: [taskWithSession] });

      // Act
      await useTaskStore.getState().sendFollowUp('Follow up');
      const state = useTaskStore.getState();

      // Assert
      expect(state.error).toBe('Resume failed');
      expect(state.currentTask?.status).toBe('failed');
      expect(state.isLoading).toBe(false);
    });

    it('should ignore late follow-up completion after history is cleared', async () => {
      // Arrange
      const { useTaskStore } = await import('@/stores/taskStore');
      const deferred = createDeferred<Task>();
      const taskWithSession: Task = {
        ...createMockTask('task-123', 'Test', 'completed'),
        sessionId: 'session-abc',
      };
      useTaskStore.setState({ currentTask: taskWithSession, tasks: [taskWithSession] });
      mockAccomplish.resumeSession.mockReturnValueOnce(deferred.promise);
      mockAccomplish.clearTaskHistory.mockResolvedValueOnce(undefined);

      // Act
      const followUpPromise = useTaskStore.getState().sendFollowUp('Continue');
      await useTaskStore.getState().clearHistory();
      deferred.resolve(createMockTask('task-123', 'Test', 'running'));
      const result = await followUpPromise;
      const state = useTaskStore.getState();

      // Assert
      expect(result).toBe(false);
      expect(state.currentTask).toBeNull();
      expect(state.tasks).toEqual([]);
      expect(state.error).toBeNull();
      expect(state.isLoading).toBe(false);
    });
  });

  describe('cancelTask', () => {
    it('should call cancelTask API and update status', async () => {
      // Arrange
      const { useTaskStore } = await import('@/stores/taskStore');
      const runningTask = createMockTask('task-123', 'Test', 'running');
      useTaskStore.setState({ currentTask: runningTask, tasks: [runningTask] });
      mockAccomplish.cancelTask.mockResolvedValueOnce(undefined);

      // Act
      await useTaskStore.getState().cancelTask();
      const state = useTaskStore.getState();

      // Assert
      expect(mockAccomplish.cancelTask).toHaveBeenCalledWith('task-123');
      expect(state.currentTask?.status).toBe('cancelled');
      expect(state.tasks[0].status).toBe('cancelled');
    });

    it('should do nothing when no current task', async () => {
      // Arrange
      const { useTaskStore } = await import('@/stores/taskStore');

      // Act
      await useTaskStore.getState().cancelTask();

      // Assert
      expect(mockAccomplish.cancelTask).not.toHaveBeenCalled();
    });
  });

  describe('interruptTask', () => {
    it('should call interruptTask API for running task', async () => {
      // Arrange
      const { useTaskStore } = await import('@/stores/taskStore');
      const runningTask = createMockTask('task-123', 'Test', 'running');
      useTaskStore.setState({ currentTask: runningTask });
      mockAccomplish.interruptTask.mockResolvedValueOnce(undefined);

      // Act
      await useTaskStore.getState().interruptTask();

      // Assert
      expect(mockAccomplish.interruptTask).toHaveBeenCalledWith('task-123');
    });

    it('should not call API for non-running task', async () => {
      // Arrange
      const { useTaskStore } = await import('@/stores/taskStore');
      const completedTask = createMockTask('task-123', 'Test', 'completed');
      useTaskStore.setState({ currentTask: completedTask });

      // Act
      await useTaskStore.getState().interruptTask();

      // Assert
      expect(mockAccomplish.interruptTask).not.toHaveBeenCalled();
    });

    it('should not change task status', async () => {
      // Arrange
      const { useTaskStore } = await import('@/stores/taskStore');
      const runningTask = createMockTask('task-123', 'Test', 'running');
      useTaskStore.setState({ currentTask: runningTask });
      mockAccomplish.interruptTask.mockResolvedValueOnce(undefined);

      // Act
      await useTaskStore.getState().interruptTask();
      const state = useTaskStore.getState();

      // Assert - status should remain 'running' (interrupt is handled by event)
      expect(state.currentTask?.status).toBe('running');
    });
  });

  describe('addTaskUpdateBatch', () => {
    it('should add multiple messages in single update', async () => {
      // Arrange
      const { useTaskStore } = await import('@/stores/taskStore');
      const task = createMockTask('task-123', 'Test', 'running');
      useTaskStore.setState({ currentTask: task, tasks: [task] });

      const messages = [
        createMockMessage('msg-1', 'assistant', 'First'),
        createMockMessage('msg-2', 'tool', 'Second'),
        createMockMessage('msg-3', 'assistant', 'Third'),
      ];

      // Act
      useTaskStore.getState().addTaskUpdateBatch({ taskId: 'task-123', messages });
      const state = useTaskStore.getState();

      // Assert
      expect(state.currentTask?.messages).toHaveLength(3);
      expect(state.currentTask?.messages[0].content).toBe('First');
      expect(state.currentTask?.messages[1].content).toBe('Second');
      expect(state.currentTask?.messages[2].content).toBe('Third');
    });

    it('should not update state if task ID does not match', async () => {
      // Arrange
      const { useTaskStore } = await import('@/stores/taskStore');
      const task = createMockTask('task-123', 'Test', 'running');
      useTaskStore.setState({ currentTask: task });

      // Act
      useTaskStore.getState().addTaskUpdateBatch({
        taskId: 'different-task',
        messages: [createMockMessage('msg-1')],
      });
      const state = useTaskStore.getState();

      // Assert
      expect(state.currentTask?.messages).toHaveLength(0);
    });

    it('should not update state if no current task', async () => {
      // Arrange
      const { useTaskStore } = await import('@/stores/taskStore');

      // Act
      useTaskStore.getState().addTaskUpdateBatch({
        taskId: 'task-123',
        messages: [createMockMessage('msg-1')],
      });
      const state = useTaskStore.getState();

      // Assert
      expect(state.currentTask).toBeNull();
    });

    it('should append to existing messages', async () => {
      // Arrange
      const { useTaskStore } = await import('@/stores/taskStore');
      const task: Task = {
        ...createMockTask('task-123', 'Test', 'running'),
        messages: [createMockMessage('existing', 'user', 'Existing')],
      };
      useTaskStore.setState({ currentTask: task });

      // Act
      useTaskStore.getState().addTaskUpdateBatch({
        taskId: 'task-123',
        messages: [createMockMessage('new', 'assistant', 'New')],
      });
      const state = useTaskStore.getState();

      // Assert
      expect(state.currentTask?.messages).toHaveLength(2);
      expect(state.currentTask?.messages[0].content).toBe('Existing');
      expect(state.currentTask?.messages[1].content).toBe('New');
    });

    it('should set isLoading to false after batch update', async () => {
      // Arrange
      const { useTaskStore } = await import('@/stores/taskStore');
      const task = createMockTask('task-123', 'Test', 'running');
      useTaskStore.setState({ currentTask: task, isLoading: true });

      // Act
      useTaskStore.getState().addTaskUpdateBatch({ taskId: 'task-123', messages: [] });
      const state = useTaskStore.getState();

      // Assert
      expect(state.isLoading).toBe(false);
    });
  });

  describe('error state management', () => {
    it('should clear error on successful task start', async () => {
      // Arrange
      const { useTaskStore } = await import('@/stores/taskStore');
      useTaskStore.setState({ error: 'Previous error' });
      mockAccomplish.startTask.mockResolvedValueOnce(createMockTask('task-123'));

      // Act
      await useTaskStore.getState().startTask({ prompt: 'Test' });
      const state = useTaskStore.getState();

      // Assert
      expect(state.error).toBeNull();
    });

    it('should clear error on successful follow up', async () => {
      // Arrange
      const { useTaskStore } = await import('@/stores/taskStore');
      const taskWithSession: Task = {
        ...createMockTask('task-123', 'Test', 'completed'),
        sessionId: 'session-abc',
      };
      useTaskStore.setState({
        currentTask: taskWithSession,
        tasks: [taskWithSession],
        error: 'Previous error',
      });
      mockAccomplish.resumeSession.mockResolvedValueOnce(
        createMockTask('task-123', 'Test', 'running'),
      );

      // Act
      await useTaskStore.getState().sendFollowUp('Continue');
      const state = useTaskStore.getState();

      // Assert
      expect(state.error).toBeNull();
    });
  });

  describe('loadTasks', () => {
    it('should load tasks from API', async () => {
      // Arrange
      const { useTaskStore } = await import('@/stores/taskStore');
      const mockTasks = [
        createMockTask('task-1'),
        createMockTask('task-2'),
        createMockTask('task-3'),
      ];
      mockAccomplish.listTasks.mockResolvedValueOnce(mockTasks);

      // Act
      await useTaskStore.getState().loadTasks();
      const state = useTaskStore.getState();

      // Assert
      expect(mockAccomplish.listTasks).toHaveBeenCalled();
      expect(state.tasks).toEqual(mockTasks);
    });
  });

  describe('loadTaskById', () => {
    it('should load specific task and set as current', async () => {
      // Arrange
      const { useTaskStore } = await import('@/stores/taskStore');
      const mockTask = createMockTask('task-123', 'Loaded task');
      mockAccomplish.getTask.mockResolvedValueOnce(mockTask);

      // Act
      await useTaskStore.getState().loadTaskById('task-123');
      const state = useTaskStore.getState();

      // Assert
      expect(mockAccomplish.getTask).toHaveBeenCalledWith('task-123');
      expect(state.currentTask).toEqual(mockTask);
      expect(state.error).toBeNull();
    });

    it('should set error when task not found', async () => {
      // Arrange
      const { useTaskStore } = await import('@/stores/taskStore');
      mockAccomplish.getTask.mockResolvedValueOnce(null);

      // Act
      await useTaskStore.getState().loadTaskById('non-existent');
      const state = useTaskStore.getState();

      // Assert
      expect(state.currentTask).toBeNull();
      expect(state.error).toBe('Task not found');
    });

    it('should ignore late loadTaskById completion after the task is deleted', async () => {
      // Arrange
      const { useTaskStore } = await import('@/stores/taskStore');
      const deferred = createDeferred<Task | null>();
      const trackedTask = createMockTask('task-123', 'Tracked task');
      useTaskStore.setState({ tasks: [trackedTask] });
      mockAccomplish.getTask.mockReturnValueOnce(deferred.promise);
      mockAccomplish.deleteTask.mockResolvedValueOnce(undefined);

      // Act
      const loadTaskPromise = useTaskStore.getState().loadTaskById('task-123');
      await useTaskStore.getState().deleteTask('task-123');
      deferred.resolve(trackedTask);
      await loadTaskPromise;
      const state = useTaskStore.getState();

      // Assert
      expect(state.currentTask).toBeNull();
      expect(state.tasks).toEqual([]);
      expect(state.error).toBeNull();
    });
  });

  describe('deleteTask', () => {
    it('should delete task and remove from list', async () => {
      // Arrange
      const { useTaskStore } = await import('@/stores/taskStore');
      const tasks = [createMockTask('task-1'), createMockTask('task-2'), createMockTask('task-3')];
      useTaskStore.setState({ tasks });
      mockAccomplish.deleteTask.mockResolvedValueOnce(undefined);

      // Act
      await useTaskStore.getState().deleteTask('task-2');
      const state = useTaskStore.getState();

      // Assert
      expect(mockAccomplish.deleteTask).toHaveBeenCalledWith('task-2');
      expect(state.tasks).toHaveLength(2);
      expect(state.tasks.find((t) => t.id === 'task-2')).toBeUndefined();
    });

    it('should clear task-scoped state when deleting the current task', async () => {
      const { useTaskStore } = await import('@/stores/taskStore');
      const onTaskProgress = getTaskProgressHandler();
      const activeTask = createMockTask('task-2', 'Active task', 'running');
      useTaskStore.setState({
        currentTask: activeTask,
        error: 'Task failed',
        isLoading: true,
        tasks: [createMockTask('task-1'), activeTask, createMockTask('task-3')],
        permissionRequests: {
          'task-1': {
            id: 'perm-1',
            taskId: 'task-1',
            type: 'file',
          } as import('@accomplish_ai/agent-core/common').PermissionRequest,
          'task-2': {
            id: 'perm-2',
            taskId: 'task-2',
            type: 'file',
          } as import('@accomplish_ai/agent-core/common').PermissionRequest,
        },
        setupProgress: 'Downloading dependencies...',
        setupProgressTaskId: 'task-2',
        setupDownloadStep: 2,
        startupStage: {
          stage: 'booting',
          message: 'Starting model',
          isFirstTask: false,
          startTime: 123,
        },
        startupStageTaskId: 'task-2',
        todos: [{ id: 'todo-1', content: 'Finish setup', status: 'in_progress' }],
        todosTaskId: 'task-2',
      });
      mockAccomplish.deleteTask.mockResolvedValueOnce(undefined);

      await useTaskStore.getState().deleteTask('task-2');
      onTaskProgress({
        taskId: 'task-2',
        stage: 'setup',
        message: 'Downloading Chromium',
      });
      onTaskProgress({
        taskId: 'task-2',
        stage: STARTUP_STAGES[0],
        message: 'Starting model',
      });

      const state = useTaskStore.getState();
      expect(state.currentTask).toBeNull();
      expect(state.error).toBeNull();
      expect(state.isLoading).toBe(false);
      expect(state.tasks.map((task) => task.id)).toEqual(['task-1', 'task-3']);
      expect(state.permissionRequests).toEqual({
        'task-1': {
          id: 'perm-1',
          taskId: 'task-1',
          type: 'file',
        },
      });
      expect(state.setupProgress).toBeNull();
      expect(state.setupProgressTaskId).toBeNull();
      expect(state.setupDownloadStep).toBe(1);
      expect(state.startupStage).toBeNull();
      expect(state.startupStageTaskId).toBeNull();
      expect(state.todos).toEqual([]);
      expect(state.todosTaskId).toBeNull();
    });

    it('should preserve other task state when deleting a different task', async () => {
      const { useTaskStore } = await import('@/stores/taskStore');
      const activeTask = createMockTask('task-1', 'Active task', 'running');
      useTaskStore.setState({
        currentTask: activeTask,
        isLoading: true,
        tasks: [activeTask, createMockTask('task-2')],
        permissionRequests: {
          'task-1': {
            id: 'perm-1',
            taskId: 'task-1',
            type: 'file',
          } as import('@accomplish_ai/agent-core/common').PermissionRequest,
        },
        setupProgress: 'Downloading dependencies...',
        setupProgressTaskId: 'task-1',
        setupDownloadStep: 2,
        startupStage: {
          stage: 'booting',
          message: 'Starting model',
          isFirstTask: false,
          startTime: 123,
        },
        startupStageTaskId: 'task-1',
        todos: [{ id: 'todo-1', content: 'Finish setup', status: 'in_progress' }],
        todosTaskId: 'task-1',
      });
      mockAccomplish.deleteTask.mockResolvedValueOnce(undefined);

      await useTaskStore.getState().deleteTask('task-2');
      const state = useTaskStore.getState();

      expect(state.currentTask?.id).toBe('task-1');
      expect(state.isLoading).toBe(true);
      expect(state.tasks.map((task) => task.id)).toEqual(['task-1']);
      expect(state.permissionRequests['task-1']).toBeDefined();
      expect(state.setupProgress).toBe('Downloading dependencies...');
      expect(state.setupProgressTaskId).toBe('task-1');
      expect(state.setupDownloadStep).toBe(2);
      expect(state.startupStage).toEqual({
        stage: 'booting',
        message: 'Starting model',
        isFirstTask: false,
        startTime: 123,
      });
      expect(state.startupStageTaskId).toBe('task-1');
      expect(state.todos).toEqual([
        { id: 'todo-1', content: 'Finish setup', status: 'in_progress' },
      ]);
      expect(state.todosTaskId).toBe('task-1');
    });
  });

  describe('clearHistory', () => {
    it('should clear all tasks', async () => {
      // Arrange
      const { useTaskStore } = await import('@/stores/taskStore');
      useTaskStore.setState({ tasks: [createMockTask('task-1'), createMockTask('task-2')] });
      mockAccomplish.clearTaskHistory.mockResolvedValueOnce(undefined);

      // Act
      await useTaskStore.getState().clearHistory();
      const state = useTaskStore.getState();

      // Assert
      expect(mockAccomplish.clearTaskHistory).toHaveBeenCalled();
      expect(state.tasks).toEqual([]);
    });

    it('should clear current task and task-scoped state', async () => {
      const { useTaskStore } = await import('@/stores/taskStore');
      const onTaskProgress = getTaskProgressHandler();
      const activeTask = createMockTask('task-1', 'Active task', 'running');
      useTaskStore.setState({
        currentTask: activeTask,
        error: 'Task failed',
        isLoading: true,
        tasks: [activeTask, createMockTask('task-2')],
        permissionRequests: {
          'task-1': {
            id: 'perm-1',
            taskId: 'task-1',
            type: 'file',
          } as import('@accomplish_ai/agent-core/common').PermissionRequest,
        },
        setupProgress: 'Downloading dependencies...',
        setupProgressTaskId: 'task-1',
        setupDownloadStep: 3,
        startupStage: {
          stage: 'booting',
          message: 'Starting model',
          isFirstTask: false,
          startTime: 123,
        },
        startupStageTaskId: 'task-1',
        todos: [{ id: 'todo-1', content: 'Finish setup', status: 'in_progress' }],
        todosTaskId: 'task-1',
      });
      mockAccomplish.clearTaskHistory.mockResolvedValueOnce(undefined);

      await useTaskStore.getState().clearHistory();
      onTaskProgress({
        taskId: 'task-1',
        stage: 'setup',
        message: 'Downloading Chromium',
      });
      onTaskProgress({
        taskId: 'task-1',
        stage: STARTUP_STAGES[0],
        message: 'Starting model',
      });

      const state = useTaskStore.getState();
      expect(state.tasks).toEqual([]);
      expect(state.currentTask).toBeNull();
      expect(state.error).toBeNull();
      expect(state.isLoading).toBe(false);
      expect(state.permissionRequests).toEqual({});
      expect(state.setupProgress).toBeNull();
      expect(state.setupProgressTaskId).toBeNull();
      expect(state.setupDownloadStep).toBe(1);
      expect(state.startupStage).toBeNull();
      expect(state.startupStageTaskId).toBeNull();
      expect(state.todos).toEqual([]);
      expect(state.todosTaskId).toBeNull();
    });
  });

  describe('reset', () => {
    it('should reset task-related state but preserve tasks list', async () => {
      // Arrange
      const { useTaskStore } = await import('@/stores/taskStore');
      const tasks = [createMockTask('task-1'), createMockTask('task-2')];
      useTaskStore.setState({
        currentTask: createMockTask('task-current'),
        isLoading: true,
        error: 'Some error',
        tasks,
        permissionRequests: {
          'task-1': {
            id: 'perm-1',
            taskId: 'task-1',
            type: 'file',
          } as import('@accomplish_ai/agent-core/common').PermissionRequest,
        },
        setupProgress: 'Downloading...',
        setupProgressTaskId: 'task-1',
        setupDownloadStep: 2,
      });

      // Act
      useTaskStore.getState().reset();
      const state = useTaskStore.getState();

      // Assert
      expect(state.currentTask).toBeNull();
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
      expect(state.permissionRequests).toEqual({});
      expect(state.setupProgress).toBeNull();
      expect(state.setupProgressTaskId).toBeNull();
      expect(state.setupDownloadStep).toBe(1);
      // Tasks should be preserved
      expect(state.tasks).toEqual(tasks);
    });
  });

  describe('respondToPermission', () => {
    it('should call API and clear permission request', async () => {
      // Arrange
      const { useTaskStore } = await import('@/stores/taskStore');
      useTaskStore.setState({
        permissionRequests: {
          'task-1': {
            id: 'perm-1',
            taskId: 'task-1',
            type: 'file',
          } as import('@accomplish_ai/agent-core/common').PermissionRequest,
        },
      });
      mockAccomplish.respondToPermission.mockResolvedValueOnce(undefined);

      const response = { requestId: 'perm-1', taskId: 'task-1', decision: 'allow' as const };

      // Act
      await useTaskStore.getState().respondToPermission(response);
      const state = useTaskStore.getState();

      // Assert
      expect(mockAccomplish.respondToPermission).toHaveBeenCalledWith(response);
      expect(state.permissionRequests['task-1']).toBeUndefined();
    });
  });

  describe('updateTaskStatus', () => {
    it('should update task status in tasks list and currentTask', async () => {
      // Arrange
      const { useTaskStore } = await import('@/stores/taskStore');
      const task = createMockTask('task-123', 'Test', 'queued');
      useTaskStore.setState({ currentTask: task, tasks: [task] });

      // Act
      useTaskStore.getState().updateTaskStatus('task-123', 'running');
      const state = useTaskStore.getState();

      // Assert
      expect(state.currentTask?.status).toBe('running');
      expect(state.tasks[0].status).toBe('running');
    });

    it('should only update tasks list when currentTask does not match', async () => {
      // Arrange
      const { useTaskStore } = await import('@/stores/taskStore');
      const currentTask = createMockTask('task-current', 'Current', 'running');
      const otherTask = createMockTask('task-other', 'Other', 'queued');
      useTaskStore.setState({ currentTask, tasks: [currentTask, otherTask] });

      // Act
      useTaskStore.getState().updateTaskStatus('task-other', 'running');
      const state = useTaskStore.getState();

      // Assert
      expect(state.currentTask?.status).toBe('running'); // Unchanged
      expect(state.tasks.find((t) => t.id === 'task-other')?.status).toBe('running');
    });
  });

  describe('addTaskUpdate - complete event', () => {
    it('should set completed status for success result', async () => {
      // Arrange
      const { useTaskStore } = await import('@/stores/taskStore');
      const task = createMockTask('task-123', 'Test', 'running');
      useTaskStore.setState({ currentTask: task, tasks: [task] });

      // Act
      useTaskStore.getState().addTaskUpdate({
        type: 'complete',
        taskId: 'task-123',
        result: { status: 'success' },
      });
      const state = useTaskStore.getState();

      // Assert
      expect(state.currentTask?.status).toBe('completed');
      expect(state.tasks[0].status).toBe('completed');
    });

    it('should set interrupted status for interrupted result', async () => {
      // Arrange
      const { useTaskStore } = await import('@/stores/taskStore');
      const task = createMockTask('task-123', 'Test', 'running');
      useTaskStore.setState({ currentTask: task, tasks: [task] });

      // Act
      useTaskStore.getState().addTaskUpdate({
        type: 'complete',
        taskId: 'task-123',
        result: { status: 'interrupted' },
      });
      const state = useTaskStore.getState();

      // Assert
      expect(state.currentTask?.status).toBe('interrupted');
    });

    it('should set failed status for error result', async () => {
      // Arrange
      const { useTaskStore } = await import('@/stores/taskStore');
      const task = createMockTask('task-123', 'Test', 'running');
      useTaskStore.setState({ currentTask: task, tasks: [task] });

      // Act
      useTaskStore.getState().addTaskUpdate({
        type: 'complete',
        taskId: 'task-123',
        result: { status: 'error', error: 'Something went wrong' },
      });
      const state = useTaskStore.getState();

      // Assert
      expect(state.currentTask?.status).toBe('failed');
    });

    it('should preserve sessionId from result', async () => {
      // Arrange
      const { useTaskStore } = await import('@/stores/taskStore');
      const task = createMockTask('task-123', 'Test', 'running');
      useTaskStore.setState({ currentTask: task, tasks: [task] });

      const result: TaskResult = { status: 'success', sessionId: 'session-from-result' };

      // Act
      useTaskStore.getState().addTaskUpdate({
        type: 'complete',
        taskId: 'task-123',
        result,
      });
      const state = useTaskStore.getState();

      // Assert
      expect(state.currentTask?.sessionId).toBe('session-from-result');
      expect(state.currentTask?.result).toEqual(result);
    });

    it('should NOT clear todos when task is interrupted', async () => {
      // Arrange
      const { useTaskStore } = await import('@/stores/taskStore');
      const task = createMockTask('task-123', 'Test', 'running');
      useTaskStore.setState({
        currentTask: task,
        tasks: [task],
        todos: [{ id: 'todo-1', content: 'First task', status: 'in_progress' }],
        todosTaskId: 'task-123',
      });

      // Act - simulate interrupted completion
      useTaskStore.getState().addTaskUpdate({
        type: 'complete',
        taskId: 'task-123',
        result: { status: 'interrupted' },
      });
      const state = useTaskStore.getState();

      // Assert - todos should be preserved
      expect(state.todos).toHaveLength(1);
      expect(state.todosTaskId).toBe('task-123');
    });

    it('should clear todos when task completes successfully', async () => {
      // Arrange
      const { useTaskStore } = await import('@/stores/taskStore');
      const task = createMockTask('task-123', 'Test', 'running');
      useTaskStore.setState({
        currentTask: task,
        tasks: [task],
        todos: [{ id: 'todo-1', content: 'First task', status: 'completed' }],
        todosTaskId: 'task-123',
      });

      // Act - simulate successful completion
      useTaskStore.getState().addTaskUpdate({
        type: 'complete',
        taskId: 'task-123',
        result: { status: 'success' },
      });
      const state = useTaskStore.getState();

      // Assert - todos should be cleared
      expect(state.todos).toHaveLength(0);
      expect(state.todosTaskId).toBeNull();
    });

    it('should NOT clear todos for different task completion', async () => {
      // Arrange
      const { useTaskStore } = await import('@/stores/taskStore');
      const task = createMockTask('task-123', 'Test', 'running');
      useTaskStore.setState({
        currentTask: task,
        tasks: [task],
        todos: [{ id: 'todo-1', content: 'First task', status: 'in_progress' }],
        todosTaskId: 'task-123',
      });

      // Act - simulate different task completing
      useTaskStore.getState().addTaskUpdate({
        type: 'complete',
        taskId: 'task-different',
        result: { status: 'success' },
      });
      const state = useTaskStore.getState();

      // Assert - todos should be preserved (different task)
      expect(state.todos).toHaveLength(1);
      expect(state.todosTaskId).toBe('task-123');
    });
  });
});
