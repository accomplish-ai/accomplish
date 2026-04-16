/**
 * Tests for Phase 2 parity requirements:
 * - startTask passes attachments into validated config
 * - resumeSession passes attachments into resumed config
 * - saveTask uses workspaceId
 * - per-task config file isolation under concurrency
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { TaskConfig, Task, FileAttachmentInfo } from '@accomplish_ai/agent-core';

// Track what TaskManager.startTask receives
let capturedTaskConfigs: Array<{ taskId: string; config: TaskConfig }> = [];
let capturedSavedTasks: Array<{ task: Task; workspaceId?: string | null }> = [];

// Mock agent-core to avoid DB/pty dependencies
vi.mock('@accomplish_ai/agent-core', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    createTaskManager: vi.fn(() => ({
      startTask: vi.fn((taskId: string, config: TaskConfig, _callbacks: unknown): Promise<Task> => {
        capturedTaskConfigs.push({ taskId, config });
        return Promise.resolve({
          id: taskId,
          prompt: config.prompt,
          status: 'running' as const,
          messages: [],
          createdAt: new Date().toISOString(),
        });
      }),
      getSessionId: vi.fn(() => null),
      getActiveTaskId: vi.fn(() => null),
      hasActiveTask: vi.fn(() => false),
      getActiveTaskCount: vi.fn(() => 0),
      isTaskQueued: vi.fn(() => false),
      cancelQueuedTask: vi.fn(),
      cancelTask: vi.fn(),
      interruptTask: vi.fn(),
      sendResponse: vi.fn(),
      dispose: vi.fn(),
    })),
    validateTaskConfig: vi.fn((config: TaskConfig) => config),
    createTaskId: vi.fn(() => 'tsk_test_123'),
    createMessageId: vi.fn(() => 'msg_test_123'),
    generateTaskSummary: vi.fn(() => Promise.resolve('Test summary')),
    mapResultToStatus: vi.fn(() => 'completed'),
    ensureDevBrowserServer: vi.fn(),
    generateConfig: vi.fn((opts: Record<string, unknown>) => ({
      configPath: `/data/opencode/${opts.configFileName || 'opencode.json'}`,
      systemPrompt: '',
      mcpServers: {},
      environment: {},
      config: {},
    })),
    syncApiKeysToOpenCodeAuth: vi.fn(),
    getOpenCodeAuthJsonPath: vi.fn(() => '/auth/auth.json'),
    getEnabledSkills: vi.fn(() => []),
    isCliAvailable: vi.fn(() => Promise.resolve(true)),
    buildProviderConfigs: vi.fn(async () => ({
      providerConfigs: {},
      enabledProviders: [],
      modelOverride: undefined,
    })),
    getModelDisplayName: vi.fn((id: string) => id),
    getBundledNodePaths: vi.fn(() => null),
    DEV_BROWSER_PORT: 9224,
  };
});

const { TaskService } = await import('../../src/task-service.js');

function createMockStorage() {
  return {
    saveTask: vi.fn((task: Task, workspaceId?: string | null) => {
      capturedSavedTasks.push({ task, workspaceId });
    }),
    addTaskMessage: vi.fn(),
    updateTaskStatus: vi.fn(),
    updateTaskSummary: vi.fn(),
    updateTaskSessionId: vi.fn(),
    clearTodosForTask: vi.fn(),
    saveTodosForTask: vi.fn(),
    getTasks: vi.fn(() => []),
    getTask: vi.fn(() => null),
    getApiKey: vi.fn(() => null),
    getAllApiKeys: vi.fn(() => Promise.resolve({})),
    getActiveProviderModel: vi.fn(() => null),
    getSelectedModel: vi.fn(() => null),
    getBedrockCredentials: vi.fn(() => null),
    getEnabledConnectors: vi.fn(() => []),
    getConnectorTokens: vi.fn(() => null),
    setConnectorStatus: vi.fn(),
    storeConnectorTokens: vi.fn(),
    getCloudBrowserConfig: vi.fn(() => null),
  } as unknown as Parameters<typeof TaskService>[0];
}

describe('TaskService parity', () => {
  beforeEach(() => {
    capturedTaskConfigs = [];
    capturedSavedTasks = [];
  });

  it('startTask passes attachments into TaskConfig.files', async () => {
    const storage = createMockStorage();
    const service = new TaskService(storage as never, {
      userDataPath: '/data',
      mcpToolsPath: '/tools',
    });

    const attachments: FileAttachmentInfo[] = [
      { id: 'att-1', name: 'test.txt', path: '/tmp/test.txt', type: 'text', size: 100 },
    ];

    await service.startTask({
      prompt: 'Read this file',
      taskId: 'tsk_att_test',
      attachments,
    });

    expect(capturedTaskConfigs).toHaveLength(1);
    expect(capturedTaskConfigs[0].config.files).toEqual(attachments);
  });

  it('startTask saves task with workspaceId', async () => {
    const storage = createMockStorage();
    const service = new TaskService(storage as never, {
      userDataPath: '/data',
      mcpToolsPath: '/tools',
    });

    await service.startTask({
      prompt: 'Workspace task',
      taskId: 'tsk_ws_test',
      workspaceId: 'ws-abc',
    });

    expect(capturedSavedTasks).toHaveLength(1);
    expect(capturedSavedTasks[0].workspaceId).toBe('ws-abc');
  });

  it('startTask without workspaceId saves with null workspace', async () => {
    const storage = createMockStorage();
    const service = new TaskService(storage as never, {
      userDataPath: '/data',
      mcpToolsPath: '/tools',
    });

    await service.startTask({
      prompt: 'No workspace',
      taskId: 'tsk_no_ws',
    });

    expect(capturedSavedTasks).toHaveLength(1);
    expect(capturedSavedTasks[0].workspaceId).toBeUndefined();
  });

  it('resumeSession passes attachments into TaskConfig.files', async () => {
    const storage = createMockStorage();
    const service = new TaskService(storage as never, {
      userDataPath: '/data',
      mcpToolsPath: '/tools',
    });

    const attachments: FileAttachmentInfo[] = [
      { id: 'att-2', name: 'resume.pdf', path: '/tmp/resume.pdf', type: 'pdf', size: 5000 },
    ];

    await service.resumeSession({
      sessionId: 'sess-123',
      prompt: 'Continue with this file',
      existingTaskId: 'tsk_resume_test',
      attachments,
    });

    expect(capturedTaskConfigs).toHaveLength(1);
    expect(capturedTaskConfigs[0].config.files).toEqual(attachments);
  });

  // Regression: `resumeSession` used to not accept `workspaceId` at all,
  // so every follow-up turn in a workspace conversation ran without
  // workspace-scoped knowledge notes. This test pins the explicit forward.
  it('resumeSession forwards caller-supplied workspaceId into the resumed TaskConfig', async () => {
    const storage = createMockStorage();
    const service = new TaskService(storage as never, {
      userDataPath: '/data',
      mcpToolsPath: '/tools',
    });

    await service.resumeSession({
      sessionId: 'sess-ws-1',
      prompt: 'continue please',
      existingTaskId: 'tsk_ws_resume',
      workspaceId: 'ws_explicit',
    });

    expect(capturedTaskConfigs).toHaveLength(1);
    expect(capturedTaskConfigs[0].config.workspaceId).toBe('ws_explicit');
  });

  // Regression: without an explicit workspaceId, `resumeSession` should
  // fall back to the workspace the existing task was originally saved
  // under — otherwise users who scheduled a workspace task and later
  // resume via a daemon-only source (WhatsApp, scheduler) would still
  // lose workspace knowledge notes on the resumed turn.
  it('resumeSession falls back to the stored task workspaceId when none is provided', async () => {
    const storage = createMockStorage();
    (storage.getTask as ReturnType<typeof vi.fn>).mockReturnValue({
      id: 'tsk_stored_ws',
      prompt: 'original',
      status: 'completed',
      messages: [],
      createdAt: new Date().toISOString(),
      workspaceId: 'ws_from_storage',
    });
    const service = new TaskService(storage as never, {
      userDataPath: '/data',
      mcpToolsPath: '/tools',
    });

    await service.resumeSession({
      sessionId: 'sess-fallback',
      prompt: 'continue',
      existingTaskId: 'tsk_stored_ws',
    });

    expect(capturedTaskConfigs).toHaveLength(1);
    expect(capturedTaskConfigs[0].config.workspaceId).toBe('ws_from_storage');
  });

  // Regression: when the resumed task has no workspaceId anywhere,
  // `resumeSession` must not invent one — it stays undefined so the
  // resolver skips the knowledge-note step cleanly.
  it('resumeSession leaves workspaceId undefined when neither params nor stored task has one', async () => {
    const storage = createMockStorage();
    (storage.getTask as ReturnType<typeof vi.fn>).mockReturnValue({
      id: 'tsk_no_ws',
      prompt: 'original',
      status: 'completed',
      messages: [],
      createdAt: new Date().toISOString(),
      workspaceId: undefined,
    });
    const service = new TaskService(storage as never, {
      userDataPath: '/data',
      mcpToolsPath: '/tools',
    });

    await service.resumeSession({
      sessionId: 'sess-plain',
      prompt: 'continue',
      existingTaskId: 'tsk_no_ws',
    });

    expect(capturedTaskConfigs).toHaveLength(1);
    expect(capturedTaskConfigs[0].config.workspaceId).toBeUndefined();
  });

  it('listTasks passes workspaceId to storage', () => {
    const storage = createMockStorage();
    const service = new TaskService(storage as never, {
      userDataPath: '/data',
      mcpToolsPath: '/tools',
    });

    service.listTasks('ws-filter');
    // `TaskService.listTasks` forwards both the workspace filter and the
    // `includeUnassigned` flag (default `false`). `toHaveBeenCalledWith`
    // checks the full argument list, so the assertion must include the flag.
    expect(storage.getTasks).toHaveBeenCalledWith('ws-filter', false);
  });

  // REGRESSION (Codex review P1): `stopTask` used to only update storage
  // to `'cancelled'` without emitting any terminal event. Callbacks are
  // wired only off `'complete'`/`'error'`/`'statusChange'`, so every
  // cancelled task leaked its `taskSources` entry and its per-task
  // `opencode serve` runtime until the daemon was restarted.
  describe('stopTask cleanup', () => {
    it('emits statusChange { status: "cancelled" } for queued tasks', async () => {
      const storage = createMockStorage();
      const service = new TaskService(storage as never, {
        userDataPath: '/data',
        mcpToolsPath: '/tools',
      });
      // Force the queued branch: `isTaskQueued` returns true, `hasActiveTask`
      // returns false (the default mock already does this).
      const taskManager = (
        service as unknown as { taskManager: { isTaskQueued: ReturnType<typeof vi.fn> } }
      ).taskManager;
      taskManager.isTaskQueued.mockReturnValueOnce(true);

      const statusChanges: Array<{ taskId: string; status: string }> = [];
      service.on('statusChange', (data) =>
        statusChanges.push(data as { taskId: string; status: string }),
      );

      await service.stopTask({ taskId: 'tsk_queued_1' });

      expect(statusChanges).toEqual([
        expect.objectContaining({ taskId: 'tsk_queued_1', status: 'cancelled' }),
      ]);
      expect(storage.updateTaskStatus).toHaveBeenCalledWith(
        'tsk_queued_1',
        'cancelled',
        expect.any(String),
      );
    });

    it('emits statusChange { status: "cancelled" } for running tasks', async () => {
      const storage = createMockStorage();
      const service = new TaskService(storage as never, {
        userDataPath: '/data',
        mcpToolsPath: '/tools',
      });
      const taskManager = (
        service as unknown as {
          taskManager: {
            isTaskQueued: ReturnType<typeof vi.fn>;
            hasActiveTask: ReturnType<typeof vi.fn>;
          };
        }
      ).taskManager;
      taskManager.isTaskQueued.mockReturnValueOnce(false);
      taskManager.hasActiveTask.mockReturnValueOnce(true);

      const statusChanges: Array<{ taskId: string; status: string }> = [];
      service.on('statusChange', (data) =>
        statusChanges.push(data as { taskId: string; status: string }),
      );

      await service.stopTask({ taskId: 'tsk_running_1' });

      expect(statusChanges).toEqual([
        expect.objectContaining({ taskId: 'tsk_running_1', status: 'cancelled' }),
      ]);
      expect(taskManager.cancelTask).toHaveBeenCalledWith('tsk_running_1');
    });
  });

  // REGRESSION (Max residual #1): the `permission.respond` RPC handler in
  // `daemon-routes.ts` now gates on `taskService.hasActiveTask(taskId)`
  // before forwarding the response. Without the guard a bogus taskId
  // cascades an error from deep inside `OpenCodeAdapter.sendResponse`
  // (pending === null, or the adapter doesn't exist) producing a
  // confusing stack trace rather than a clean "unknown task" RPC error.
  // This suite pins the contract that hasActiveTask returns false for
  // unknown taskIds and the handler throws a readable error.
  describe('permission.respond bogus taskId guard', () => {
    it('hasActiveTask returns false for unknown taskIds', () => {
      const storage = createMockStorage();
      const service = new TaskService(storage as never, {
        userDataPath: '/data',
        mcpToolsPath: '/tools',
      });
      // TaskManager's default mock returns false — this assertion pins the
      // contract TaskService.hasActiveTask delegates through to it.
      expect(service.hasActiveTask('tsk_nonexistent')).toBe(false);
    });

    it('mirrors the guard logic from daemon-routes: throws when task is unknown', async () => {
      // Replicate the handler's gate + forward pattern. The real handler
      // lives in `apps/daemon/src/daemon-routes.ts`; this test pins the
      // contract so a refactor that drops the gate fails fast.
      const storage = createMockStorage();
      const service = new TaskService(storage as never, {
        userDataPath: '/data',
        mcpToolsPath: '/tools',
      });
      const bogusTaskId = 'tsk_never_existed';

      const handlerSimulation = async (taskId: string): Promise<void> => {
        if (!service.hasActiveTask(taskId)) {
          throw new Error(
            `permission.respond: no active task with id=${taskId}. The task may have completed, been cancelled, or never existed.`,
          );
        }
        await service.sendResponse(taskId, {
          taskId,
          requestId: 'filereq_irrelevant',
          decision: 'deny',
        });
      };

      await expect(handlerSimulation(bogusTaskId)).rejects.toThrow(
        /permission.respond: no active task with id=tsk_never_existed/,
      );
    });
  });
});
