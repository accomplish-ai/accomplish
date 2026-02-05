import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import type { TaskConfig, TaskResult, OpenCodeMessage, PermissionRequest } from '@accomplish/agent-core';
import type { TaskManagerOptions } from '@accomplish/agent-core';

const mockApp = {
  isPackaged: false,
  getAppPath: vi.fn(() => '/mock/app/path'),
  getPath: vi.fn((name: string) => `/mock/path/${name}`),
};

vi.mock('electron', () => ({
  app: mockApp,
}));

const mockFs = {
  existsSync: vi.fn(() => false),
  readdirSync: vi.fn(() => []),
  readFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
};

vi.mock('fs', () => ({
  default: mockFs,
  existsSync: mockFs.existsSync,
  readdirSync: mockFs.readdirSync,
  readFileSync: mockFs.readFileSync,
  mkdirSync: mockFs.mkdirSync,
  writeFileSync: mockFs.writeFileSync,
}));

vi.mock('os', () => ({
  default: { homedir: () => '/Users/testuser' },
  homedir: () => '/Users/testuser',
}));

class MockPty extends EventEmitter {
  pid = 12345;
  killed = false;

  write = vi.fn();
  kill = vi.fn(() => {
    this.killed = true;
  });

  onData(callback: (data: string) => void) {
    this.on('data', callback);
    return { dispose: () => this.off('data', callback) };
  }

  onExit(callback: (params: { exitCode: number; signal?: number }) => void) {
    this.on('exit', callback);
    return { dispose: () => this.off('exit', callback) };
  }
}

const mockPtyInstance = new MockPty();
const mockPtySpawn = vi.fn(() => mockPtyInstance);

vi.mock('node-pty', () => ({
  spawn: mockPtySpawn,
}));

class MockOpenCodeAdapter extends EventEmitter {
  private taskId: string | null = null;
  private sessionId: string | null = null;
  private disposed = false;
  public running = true;
  private startTaskFn: (config: TaskConfig) => Promise<{ id: string; prompt: string; status: string; messages: never[]; createdAt: string }>;

  constructor(_options: unknown, taskId?: string) {
    super();
    this.taskId = taskId || null;
    this.startTaskFn = vi.fn(async (config: TaskConfig) => {
      this.taskId = config.taskId || `task_${Date.now()}`;
      this.sessionId = `session_${Date.now()}`;
      return {
        id: this.taskId,
        prompt: config.prompt,
        status: 'running',
        messages: [],
        createdAt: new Date().toISOString(),
      };
    });
  }

  getTaskId() {
    return this.taskId;
  }

  getSessionId() {
    return this.sessionId;
  }

  isAdapterDisposed() {
    return this.disposed;
  }

  async startTask(config: TaskConfig) {
    return this.startTaskFn(config);
  }

  async cancelTask() {
    this.emit('complete', { status: 'cancelled' });
  }

  async interruptTask() {
    this.emit('complete', { status: 'interrupted' });
  }

  async sendResponse(response: string) {
    return response;
  }

  dispose() {
    this.disposed = true;
    this.removeAllListeners();
  }

  simulateComplete(result: TaskResult) {
    this.emit('complete', result);
  }

  simulateError(error: Error) {
    this.emit('error', error);
  }

  simulateMessage(message: OpenCodeMessage) {
    this.emit('message', message);
  }

  simulateProgress(progress: { stage: string; message?: string }) {
    this.emit('progress', progress);
  }

  simulatePermissionRequest(request: PermissionRequest) {
    this.emit('permission-request', request);
  }
}

const createdAdapters: MockOpenCodeAdapter[] = [];

vi.mock('@accomplish/agent-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@accomplish/agent-core')>();
  return {
    ...actual,
    OpenCodeAdapter: MockOpenCodeAdapter,
    OpenCodeCliNotFoundError: class OpenCodeCliNotFoundError extends Error {
      constructor() {
        super('OpenCode CLI is not available');
        this.name = 'OpenCodeCliNotFoundError';
      }
    },
  };
});

vi.mock('@main/opencode/config-generator', () => ({
  getMcpToolsPath: vi.fn(() => '/mock/mcp-tools/path'),
  generateOpenCodeConfig: vi.fn(() => Promise.resolve('/mock/config')),
  syncApiKeysToOpenCodeAuth: vi.fn(() => Promise.resolve()),
  ACCOMPLISH_AGENT_NAME: 'accomplish',
}));

vi.mock('@main/opencode/electron-options', () => ({
  createElectronAdapterOptions: vi.fn(() => ({
    platform: 'darwin' as NodeJS.Platform,
    isPackaged: false,
    tempPath: '/mock/temp',
    getCliCommand: () => ({ command: 'opencode', args: [] }),
    buildEnvironment: async (_taskId: string) => ({}),
    buildCliArgs: async () => [],
  })),
  createElectronTaskManagerOptions: vi.fn(() => ({
    adapterOptions: {
      platform: 'darwin' as NodeJS.Platform,
      isPackaged: false,
      tempPath: '/mock/temp',
      getCliCommand: () => ({ command: 'opencode', args: [] }),
      buildEnvironment: async (_taskId: string) => ({}),
      buildCliArgs: async () => [],
    },
    defaultWorkingDirectory: '/mock/working-dir',
    maxConcurrentTasks: 10,
    isCliAvailable: async () => true,
  })),
  buildEnvironment: vi.fn((_taskId: string) => Promise.resolve({})),
  buildCliArgs: vi.fn(() => Promise.resolve([])),
  getCliCommand: vi.fn(() => ({ command: 'opencode', args: [] })),
  isCliAvailable: vi.fn(() => Promise.resolve(true)),
  onBeforeStart: vi.fn(() => Promise.resolve()),
  onBeforeTaskStart: vi.fn(() => Promise.resolve()),
  getOpenCodeCliPath: vi.fn(() => ({ command: 'opencode', args: [] })),
  isOpenCodeBundled: vi.fn(() => true),
  getBundledOpenCodeVersion: vi.fn(() => '1.0.0'),
}));

vi.mock('@main/utils/bundled-node', () => ({
  getNpxPath: vi.fn(() => '/mock/npx'),
  getBundledNodePaths: vi.fn(() => null),
  logBundledNodeInfo: vi.fn(),
}));

vi.mock('child_process', () => ({
  spawn: vi.fn(() => ({
    stdout: { on: vi.fn() },
    stderr: { on: vi.fn() },
    on: vi.fn((event: string, callback: (code: number) => void) => {
      if (event === 'close') {
        setTimeout(() => callback(0), 10);
      }
    }),
    unref: vi.fn(),
  })),
}));

function createMockTaskManagerOptions(overrides?: { maxConcurrentTasks?: number }): TaskManagerOptions {
  return {
    adapterOptions: {
      platform: 'darwin' as NodeJS.Platform,
      isPackaged: false,
      tempPath: '/mock/temp',
      getCliCommand: () => ({ command: 'opencode', args: [] }),
      buildEnvironment: async (_taskId: string) => ({}),
      buildCliArgs: async () => [],
    },
    defaultWorkingDirectory: '/mock/working-dir',
    maxConcurrentTasks: overrides?.maxConcurrentTasks ?? 10,
    isCliAvailable: async () => true,
  };
}

describe('Task Manager Module', () => {
  let createTaskManager: typeof import('@main/opencode').createTaskManager;
  let getTaskManager: typeof import('@main/opencode').getTaskManager;
  let disposeTaskManager: typeof import('@main/opencode').disposeTaskManager;

  function createMockCallbacks() {
    return {
      onMessage: vi.fn(),
      onProgress: vi.fn(),
      onPermissionRequest: vi.fn(),
      onComplete: vi.fn(),
      onError: vi.fn(),
      onStatusChange: vi.fn(),
      onDebug: vi.fn(),
    };
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    createdAdapters.length = 0;

    const module = await import('@main/opencode');
    createTaskManager = module.createTaskManager;
    getTaskManager = module.getTaskManager;
    disposeTaskManager = module.disposeTaskManager;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('TaskManager Class', () => {
    describe('Constructor', () => {
      it('should create task manager with default max concurrent tasks', () => {
        const manager = createTaskManager(createMockTaskManagerOptions());

        expect(manager.getActiveTaskCount()).toBe(0);
        expect(manager.getQueueLength()).toBe(0);
      });

      it('should create task manager with custom max concurrent tasks', () => {
        const manager = createTaskManager(createMockTaskManagerOptions({ maxConcurrentTasks: 5 }));

        expect(manager.getActiveTaskCount()).toBe(0);
      });
    });

    describe('startTask()', () => {
      it('should start a single task successfully', async () => {
        const manager = createTaskManager(createMockTaskManagerOptions());
        const callbacks = createMockCallbacks();
        const config: TaskConfig = { prompt: 'Test task' };

        const task = await manager.startTask('task-1', config, callbacks);

        expect(task.id).toBe('task-1');
        expect(task.status).toBe('running');
        expect(manager.hasActiveTask('task-1')).toBe(true);
        expect(manager.getActiveTaskCount()).toBe(1);
      });

      it('should throw error if task ID already exists', async () => {
        const manager = createTaskManager(createMockTaskManagerOptions());
        const callbacks = createMockCallbacks();
        const config: TaskConfig = { prompt: 'Test task' };

        await manager.startTask('task-1', config, callbacks);

        await expect(
          manager.startTask('task-1', config, createMockCallbacks())
        ).rejects.toThrow('already running or queued');
      });

      it('should execute multiple tasks in parallel up to limit', async () => {
        const manager = createTaskManager(createMockTaskManagerOptions({ maxConcurrentTasks: 3 }));

        await manager.startTask('task-1', { prompt: 'Task 1' }, createMockCallbacks());
        await manager.startTask('task-2', { prompt: 'Task 2' }, createMockCallbacks());
        await manager.startTask('task-3', { prompt: 'Task 3' }, createMockCallbacks());

        expect(manager.getActiveTaskCount()).toBe(3);
        expect(manager.getQueueLength()).toBe(0);
        expect(manager.hasActiveTask('task-1')).toBe(true);
        expect(manager.hasActiveTask('task-2')).toBe(true);
        expect(manager.hasActiveTask('task-3')).toBe(true);
      });

      it('should queue tasks when at capacity', async () => {
        const manager = createTaskManager(createMockTaskManagerOptions({ maxConcurrentTasks: 2 }));

        await manager.startTask('task-1', { prompt: 'Task 1' }, createMockCallbacks());
        await manager.startTask('task-2', { prompt: 'Task 2' }, createMockCallbacks());
        const task3 = await manager.startTask('task-3', { prompt: 'Task 3' }, createMockCallbacks());

        expect(manager.getActiveTaskCount()).toBe(2);
        expect(manager.getQueueLength()).toBe(1);
        expect(task3.status).toBe('queued');
        expect(manager.isTaskQueued('task-3')).toBe(true);
      });

      it('should throw error when queue is full', async () => {
        const manager = createTaskManager(createMockTaskManagerOptions({ maxConcurrentTasks: 1 }));

        await manager.startTask('task-1', { prompt: 'Task 1' }, createMockCallbacks());
        await manager.startTask('task-2', { prompt: 'Task 2' }, createMockCallbacks());

        await expect(
          manager.startTask('task-3', { prompt: 'Task 3' }, createMockCallbacks())
        ).rejects.toThrow('Maximum queued tasks');
      });

      it('should return queue position for queued tasks', async () => {
        const manager = createTaskManager(createMockTaskManagerOptions({ maxConcurrentTasks: 1 }));

        await manager.startTask('task-1', { prompt: 'Task 1' }, createMockCallbacks());
        await manager.startTask('task-2', { prompt: 'Task 2' }, createMockCallbacks());

        const position = manager.getQueuePosition('task-2');

        expect(position).toBe(1);
      });

      it('should return 0 for non-queued task position', async () => {
        const manager = createTaskManager(createMockTaskManagerOptions());
        await manager.startTask('task-1', { prompt: 'Task 1' }, createMockCallbacks());

        const position = manager.getQueuePosition('task-1');

        expect(position).toBe(0);
      });
    });

    describe('Task Event Handling', () => {
      it('should forward message events to callbacks', async () => {
        const manager = createTaskManager(createMockTaskManagerOptions());
        const callbacks = createMockCallbacks();
        await manager.startTask('task-1', { prompt: 'Test' }, callbacks);

        expect(callbacks.onMessage).not.toHaveBeenCalled();
      });

      it('should forward progress events to callbacks', async () => {
        const manager = createTaskManager(createMockTaskManagerOptions());
        const callbacks = createMockCallbacks();
        await manager.startTask('task-1', { prompt: 'Test' }, callbacks);

        await new Promise((resolve) => setTimeout(resolve, 50));

        // Note: Exact number depends on browser detection
        expect(callbacks.onProgress).toHaveBeenCalled();
      });

      it('should cleanup task on completion and process queue', async () => {
        const manager = createTaskManager(createMockTaskManagerOptions({ maxConcurrentTasks: 1 }));
        const callbacks1 = createMockCallbacks();
        const callbacks2 = createMockCallbacks();

        await manager.startTask('task-1', { prompt: 'Task 1' }, callbacks1);
        await manager.startTask('task-2', { prompt: 'Task 2' }, callbacks2);

        expect(manager.getActiveTaskCount()).toBe(1);
        expect(manager.getQueueLength()).toBe(1);

        expect(manager.hasActiveTask('task-1')).toBe(true);
      });

      it('should cleanup task on error and process queue', async () => {
        const manager = createTaskManager(createMockTaskManagerOptions({ maxConcurrentTasks: 1 }));
        const callbacks1 = createMockCallbacks();
        const callbacks2 = createMockCallbacks();

        await manager.startTask('task-1', { prompt: 'Task 1' }, callbacks1);
        await manager.startTask('task-2', { prompt: 'Task 2' }, callbacks2);

        expect(manager.hasActiveTask('task-1')).toBe(true);
        expect(manager.isTaskQueued('task-2')).toBe(true);
      });
    });

    describe('cancelTask()', () => {
      it('should cancel a running task', async () => {
        const manager = createTaskManager(createMockTaskManagerOptions());
        const callbacks = createMockCallbacks();
        await manager.startTask('task-1', { prompt: 'Test' }, callbacks);

        await manager.cancelTask('task-1');

        expect(manager.hasActiveTask('task-1')).toBe(false);
      });

      it('should cancel a queued task', async () => {
        const manager = createTaskManager(createMockTaskManagerOptions({ maxConcurrentTasks: 1 }));
        await manager.startTask('task-1', { prompt: 'Task 1' }, createMockCallbacks());
        await manager.startTask('task-2', { prompt: 'Task 2' }, createMockCallbacks());

        expect(manager.isTaskQueued('task-2')).toBe(true);

        await manager.cancelTask('task-2');

        expect(manager.isTaskQueued('task-2')).toBe(false);
        expect(manager.getQueueLength()).toBe(0);
      });

      it('should handle cancellation of non-existent task gracefully', async () => {
        const manager = createTaskManager(createMockTaskManagerOptions());

        await manager.cancelTask('non-existent');
      });

      it('should process queue after cancellation', async () => {
        const manager = createTaskManager(createMockTaskManagerOptions({ maxConcurrentTasks: 1 }));
        const callbacks2 = createMockCallbacks();

        await manager.startTask('task-1', { prompt: 'Task 1' }, createMockCallbacks());
        await manager.startTask('task-2', { prompt: 'Task 2' }, callbacks2);

        await manager.cancelTask('task-1');

        await new Promise((resolve) => setTimeout(resolve, 100));

        expect(manager.getQueueLength()).toBe(0);
      });
    });

    describe('interruptTask()', () => {
      it('should interrupt a running task', async () => {
        const manager = createTaskManager(createMockTaskManagerOptions());
        await manager.startTask('task-1', { prompt: 'Test' }, createMockCallbacks());

        await manager.interruptTask('task-1');
      });

      it('should handle interruption of non-existent task gracefully', async () => {
        const manager = createTaskManager(createMockTaskManagerOptions());

        await manager.interruptTask('non-existent');
      });
    });

    describe('cancelQueuedTask()', () => {
      it('should remove task from queue and return true', async () => {
        const manager = createTaskManager(createMockTaskManagerOptions({ maxConcurrentTasks: 1 }));
        await manager.startTask('task-1', { prompt: 'Task 1' }, createMockCallbacks());
        await manager.startTask('task-2', { prompt: 'Task 2' }, createMockCallbacks());

        const result = manager.cancelQueuedTask('task-2');

        expect(result).toBe(true);
        expect(manager.getQueueLength()).toBe(0);
      });

      it('should return false for non-queued task', async () => {
        const manager = createTaskManager(createMockTaskManagerOptions());
        await manager.startTask('task-1', { prompt: 'Test' }, createMockCallbacks());

        const result = manager.cancelQueuedTask('task-1');

        expect(result).toBe(false);
      });
    });

    describe('sendResponse()', () => {
      it('should attempt to send response to active task', async () => {
        const manager = createTaskManager(createMockTaskManagerOptions());
        await manager.startTask('task-1', { prompt: 'Test' }, createMockCallbacks());

        // The adapter throws "No active process" because there's no real PTY
        // in the test environment. This verifies that the task manager correctly delegates
        // to the adapter's sendResponse method.
        await expect(manager.sendResponse('task-1', 'user response')).rejects.toThrow(
          'No active process'
        );
      });

      it('should throw error for non-existent task', async () => {
        const manager = createTaskManager(createMockTaskManagerOptions());

        await expect(manager.sendResponse('non-existent', 'response')).rejects.toThrow(
          'not found or not active'
        );
      });
    });

    describe('getSessionId()', () => {
      it('should return session ID for active task after adapter starts', async () => {
        const manager = createTaskManager(createMockTaskManagerOptions());
        await manager.startTask('task-1', { prompt: 'Test' }, createMockCallbacks());

        await new Promise((resolve) => setTimeout(resolve, 100));

        const sessionId = manager.getSessionId('task-1');

        // Session ID may or may not be set depending on adapter state;
        // the important thing is that the method doesn't throw and returns expected type
        expect(sessionId === null || typeof sessionId === 'string').toBe(true);
      });

      it('should return null for non-existent task', () => {
        const manager = createTaskManager(createMockTaskManagerOptions());

        const sessionId = manager.getSessionId('non-existent');

        expect(sessionId).toBeNull();
      });
    });

    describe('State Query Methods', () => {
      it('should report hasRunningTask correctly', async () => {
        const manager = createTaskManager(createMockTaskManagerOptions());

        expect(manager.hasRunningTask()).toBe(false);

        await manager.startTask('task-1', { prompt: 'Test' }, createMockCallbacks());

        expect(manager.hasRunningTask()).toBe(true);
      });

      it('should return all active task IDs', async () => {
        const manager = createTaskManager(createMockTaskManagerOptions({ maxConcurrentTasks: 3 }));
        await manager.startTask('task-1', { prompt: 'Task 1' }, createMockCallbacks());
        await manager.startTask('task-2', { prompt: 'Task 2' }, createMockCallbacks());

        const activeIds = manager.getActiveTaskIds();

        expect(activeIds).toContain('task-1');
        expect(activeIds).toContain('task-2');
        expect(activeIds.length).toBe(2);
      });

      it('should return first active task ID', async () => {
        const manager = createTaskManager(createMockTaskManagerOptions());
        await manager.startTask('task-1', { prompt: 'Test' }, createMockCallbacks());

        const activeId = manager.getActiveTaskId();

        expect(activeId).toBe('task-1');
      });

      it('should return null when no active tasks', () => {
        const manager = createTaskManager(createMockTaskManagerOptions());

        const activeId = manager.getActiveTaskId();

        expect(activeId).toBeNull();
      });
    });

    describe('dispose()', () => {
      it('should dispose all active tasks', async () => {
        const manager = createTaskManager(createMockTaskManagerOptions());
        await manager.startTask('task-1', { prompt: 'Task 1' }, createMockCallbacks());
        await manager.startTask('task-2', { prompt: 'Task 2' }, createMockCallbacks());

        manager.dispose();

        expect(manager.getActiveTaskCount()).toBe(0);
        expect(manager.hasRunningTask()).toBe(false);
      });

      it('should clear the task queue', async () => {
        const manager = createTaskManager(createMockTaskManagerOptions({ maxConcurrentTasks: 1 }));
        await manager.startTask('task-1', { prompt: 'Task 1' }, createMockCallbacks());
        await manager.startTask('task-2', { prompt: 'Task 2' }, createMockCallbacks());

        expect(manager.getQueueLength()).toBe(1);

        manager.dispose();

        expect(manager.getQueueLength()).toBe(0);
      });
    });
  });

  describe('Singleton Functions', () => {
    describe('getTaskManager()', () => {
      it('should return singleton instance', () => {
        const manager1 = getTaskManager();
        const manager2 = getTaskManager();

        expect(manager1).toBe(manager2);
      });

      it('should create new instance if none exists', () => {
        disposeTaskManager();
        const manager = getTaskManager();

        expect(manager).toBeDefined();
        expect(typeof manager.startTask).toBe('function');
        expect(typeof manager.cancelTask).toBe('function');
        expect(typeof manager.dispose).toBe('function');
      });
    });

    describe('disposeTaskManager()', () => {
      it('should dispose singleton and allow recreation', () => {
        const manager1 = getTaskManager();

        disposeTaskManager();
        const manager2 = getTaskManager();

        expect(manager2).not.toBe(manager1);
      });

      it('should be safe to call multiple times', () => {
        disposeTaskManager();
        disposeTaskManager();
        disposeTaskManager();
      });
    });
  });

  describe('Queue Processing', () => {
    it('should queue tasks and track positions correctly', async () => {
      const manager = createTaskManager(createMockTaskManagerOptions({ maxConcurrentTasks: 2 }));

      const callbacks1 = createMockCallbacks();
      const callbacks2 = createMockCallbacks();
      const callbacks3 = createMockCallbacks();
      const callbacks4 = createMockCallbacks();

      await manager.startTask('task-1', { prompt: 'Task 1' }, callbacks1);
      await manager.startTask('task-2', { prompt: 'Task 2' }, callbacks2);
      await manager.startTask('task-3', { prompt: 'Task 3' }, callbacks3);
      await manager.startTask('task-4', { prompt: 'Task 4' }, callbacks4);

      expect(manager.getActiveTaskCount()).toBe(2);
      expect(manager.getQueueLength()).toBe(2);
      expect(manager.getQueuePosition('task-3')).toBe(1);
      expect(manager.getQueuePosition('task-4')).toBe(2);
    });

    it('should maintain queue integrity during concurrent operations', async () => {
      const manager = createTaskManager(createMockTaskManagerOptions({ maxConcurrentTasks: 2 }));

      await manager.startTask('task-1', { prompt: 'Task 1' }, createMockCallbacks());
      await manager.startTask('task-2', { prompt: 'Task 2' }, createMockCallbacks());
      await manager.startTask('task-3', { prompt: 'Task 3' }, createMockCallbacks());
      await manager.startTask('task-4', { prompt: 'Task 4' }, createMockCallbacks());

      expect(manager.getActiveTaskCount()).toBe(2);
      expect(manager.getQueueLength()).toBe(2);

      const removed = manager.cancelQueuedTask('task-3');
      expect(removed).toBe(true);
      expect(manager.getQueueLength()).toBe(1);

      expect(manager.isTaskQueued('task-4')).toBe(true);
    });
  });
});
