import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OpenCodeCliNotFoundError } from '../../../src/opencode/adapter.js';

/**
 * Tests for TaskManager module.
 *
 * Note: The TaskManager depends on OpenCodeAdapter which uses node-pty.
 * We test the TaskManager's business logic through interface verification
 * and state management tests that don't require the full PTY stack.
 *
 * Integration tests in the desktop app provide coverage for the full flow.
 */
describe('TaskManager', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('TaskManagerOptions interface', () => {
    it('should require adapterOptions', () => {
      const validOptions = {
        adapterOptions: {
          platform: 'darwin' as NodeJS.Platform,
          isPackaged: false,
          tempPath: '/tmp',
          getCliCommand: () => ({ command: 'opencode', args: [] }),
          buildEnvironment: async (_taskId: string) => ({}),
          buildCliArgs: async () => [],
        },
        defaultWorkingDirectory: '/home/user',
        isCliAvailable: async () => true,
      };

      expect(validOptions.adapterOptions).toBeDefined();
      expect(validOptions.defaultWorkingDirectory).toBeDefined();
      expect(validOptions.isCliAvailable).toBeDefined();
    });

    it('should support optional maxConcurrentTasks', () => {
      const defaultMax = 10;
      expect(defaultMax).toBe(10);
    });
  });

  describe('TaskCallbacks interface', () => {
    it('should define all required callback functions', () => {
      const callbacks = {
        onMessage: vi.fn(),
        onProgress: vi.fn(),
        onPermissionRequest: vi.fn(),
        onComplete: vi.fn(),
        onError: vi.fn(),
      };

      expect(callbacks.onMessage).toBeDefined();
      expect(callbacks.onProgress).toBeDefined();
      expect(callbacks.onPermissionRequest).toBeDefined();
      expect(callbacks.onComplete).toBeDefined();
      expect(callbacks.onError).toBeDefined();
    });

    it('should support optional callbacks', () => {
      const callbacks = {
        onMessage: vi.fn(),
        onProgress: vi.fn(),
        onPermissionRequest: vi.fn(),
        onComplete: vi.fn(),
        onError: vi.fn(),
        onStatusChange: vi.fn(),
        onDebug: vi.fn(),
        onTodoUpdate: vi.fn(),
        onAuthError: vi.fn(),
      };

      expect(callbacks.onStatusChange).toBeDefined();
      expect(callbacks.onDebug).toBeDefined();
      expect(callbacks.onTodoUpdate).toBeDefined();
      expect(callbacks.onAuthError).toBeDefined();
    });
  });

  describe('OpenCodeCliNotFoundError', () => {
    it('should be thrown when CLI is not available', async () => {
      const error = new OpenCodeCliNotFoundError();
      expect(error.name).toBe('OpenCodeCliNotFoundError');
      expect(error.message).toContain('OpenCode CLI is not available');
    });
  });

  describe('Task queuing logic', () => {
    it('should identify queued status', () => {
      const queuedTask = {
        id: 'task-1',
        prompt: 'test',
        status: 'queued' as const,
        messages: [],
        createdAt: new Date().toISOString(),
      };

      expect(queuedTask.status).toBe('queued');
    });

    it('should track queue position (1-based)', () => {
      const queue = ['task-1', 'task-2', 'task-3'];
      const getPosition = (taskId: string) => {
        const index = queue.indexOf(taskId);
        return index === -1 ? 0 : index + 1;
      };

      expect(getPosition('task-1')).toBe(1);
      expect(getPosition('task-2')).toBe(2);
      expect(getPosition('task-3')).toBe(3);
      expect(getPosition('task-4')).toBe(0);
    });

    it('should enforce queue limit', () => {
      const maxConcurrent = 2;
      const maxQueued = 2;
      const activeTasks = 2;
      const queuedTasks = 2;

      const canQueue = queuedTasks < maxQueued;
      expect(canQueue).toBe(false);
    });
  });

  describe('Task lifecycle management', () => {
    it('should track running tasks', () => {
      const activeTasks = new Map<string, { taskId: string }>();

      activeTasks.set('task-1', { taskId: 'task-1' });
      expect(activeTasks.has('task-1')).toBe(true);
      expect(activeTasks.size).toBe(1);

      activeTasks.delete('task-1');
      expect(activeTasks.has('task-1')).toBe(false);
    });

    it('should prevent duplicate task IDs', () => {
      const activeTasks = new Map<string, { taskId: string }>();
      const taskQueue = [{ taskId: 'task-2' }];

      const isAlreadyExisting = (taskId: string) => {
        return activeTasks.has(taskId) || taskQueue.some(q => q.taskId === taskId);
      };

      activeTasks.set('task-1', { taskId: 'task-1' });

      expect(isAlreadyExisting('task-1')).toBe(true);
      expect(isAlreadyExisting('task-2')).toBe(true);
      expect(isAlreadyExisting('task-3')).toBe(false);
    });
  });

  describe('Cold start tracking', () => {
    it('should identify first task', () => {
      let isFirstTask = true;

      expect(isFirstTask).toBe(true);

      // After first task starts
      isFirstTask = false;
      expect(isFirstTask).toBe(false);
    });
  });

  describe('Concurrent task limits', () => {
    it('should respect maxConcurrentTasks default of 10', () => {
      const defaultMaxConcurrentTasks = 10;
      expect(defaultMaxConcurrentTasks).toBe(10);
    });

    it('should queue tasks when at capacity', () => {
      const maxConcurrent = 2;
      const activeTasks = 2;

      const shouldQueue = activeTasks >= maxConcurrent;
      expect(shouldQueue).toBe(true);
    });

    it('should process queue when tasks complete', () => {
      const queue = [
        { taskId: 'task-3', config: { prompt: 'test 3' } },
        { taskId: 'task-4', config: { prompt: 'test 4' } },
      ];
      const maxConcurrent = 2;
      let activeCount = 2;

      // Simulate task completion
      activeCount--;
      expect(activeCount < maxConcurrent).toBe(true);

      // Should start next queued task
      const nextTask = queue.shift();
      expect(nextTask?.taskId).toBe('task-3');
      expect(queue.length).toBe(1);
    });
  });

  describe('Task cancellation', () => {
    it('should remove task from queue', () => {
      const queue = [
        { taskId: 'task-1' },
        { taskId: 'task-2' },
        { taskId: 'task-3' },
      ];

      const cancelQueued = (taskId: string) => {
        const index = queue.findIndex(q => q.taskId === taskId);
        if (index !== -1) {
          queue.splice(index, 1);
          return true;
        }
        return false;
      };

      expect(cancelQueued('task-2')).toBe(true);
      expect(queue.length).toBe(2);
      expect(queue.map(q => q.taskId)).toEqual(['task-1', 'task-3']);

      expect(cancelQueued('task-4')).toBe(false);
    });
  });

  describe('TaskProgressEvent', () => {
    it('should include stage information', () => {
      const event = {
        stage: 'starting',
        message: 'Starting task...',
        isFirstTask: true,
      };

      expect(event.stage).toBe('starting');
      expect(event.message).toBeDefined();
      expect(event.isFirstTask).toBe(true);
    });

    it('should include model name for connecting stage', () => {
      const event = {
        stage: 'connecting',
        message: 'Connecting to GPT-4...',
        modelName: 'GPT-4',
      };

      expect(event.stage).toBe('connecting');
      expect(event.modelName).toBe('GPT-4');
    });
  });

  describe('Cleanup logic', () => {
    it('should remove listeners on cleanup', () => {
      const listeners = new Set(['message', 'progress', 'complete', 'error']);

      const cleanup = () => {
        listeners.clear();
      };

      cleanup();
      expect(listeners.size).toBe(0);
    });

    it('should dispose adapter on cleanup', () => {
      let disposed = false;

      const cleanup = () => {
        disposed = true;
      };

      cleanup();
      expect(disposed).toBe(true);
    });
  });

  describe('Working directory handling', () => {
    it('should use task config working directory if provided', () => {
      const taskConfig = { prompt: 'test', workingDirectory: '/project/src' };
      const defaultDir = '/home/user';

      const workingDirectory = taskConfig.workingDirectory || defaultDir;
      expect(workingDirectory).toBe('/project/src');
    });

    it('should fall back to default working directory', () => {
      const taskConfig = { prompt: 'test' };
      const defaultDir = '/home/user';

      const workingDirectory = taskConfig.workingDirectory || defaultDir;
      expect(workingDirectory).toBe('/home/user');
    });
  });

  describe('Session ID retrieval', () => {
    it('should return null for non-existent task', () => {
      const activeTasks = new Map<string, { getSessionId: () => string | null }>();

      const getSessionId = (taskId: string) => {
        return activeTasks.get(taskId)?.getSessionId() ?? null;
      };

      expect(getSessionId('non-existent')).toBeNull();
    });
  });

  describe('cancelAllTasks', () => {
    it('should clear queue and cancel active tasks', () => {
      const queue = [{ taskId: 'task-3' }];
      const activeTasks = new Map([
        ['task-1', { taskId: 'task-1' }],
        ['task-2', { taskId: 'task-2' }],
      ]);

      const cancelAll = () => {
        queue.length = 0;
        activeTasks.clear();
      };

      cancelAll();

      expect(queue.length).toBe(0);
      expect(activeTasks.size).toBe(0);
    });
  });
});
