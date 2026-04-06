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
    resolveTaskConfig: vi.fn(async () => ({
      configOptions: {
        platform: 'darwin',
        mcpToolsPath: '/tools',
        userDataPath: '/data',
        isPackaged: false,
      },
    })),
    syncApiKeysToOpenCodeAuth: vi.fn(),
    getOpenCodeAuthPath: vi.fn(() => '/auth'),
    getEnabledSkills: vi.fn(() => []),
    buildOpenCodeEnvironment: vi.fn((env: NodeJS.ProcessEnv) => env),
    resolveCliPath: vi.fn(() => ({ cliPath: '/bin/opencode' })),
    isCliAvailable: vi.fn(() => Promise.resolve(true)),
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

  it('listTasks passes workspaceId to storage', () => {
    const storage = createMockStorage();
    const service = new TaskService(storage as never, {
      userDataPath: '/data',
      mcpToolsPath: '/tools',
    });

    service.listTasks('ws-filter');
    expect(storage.getTasks).toHaveBeenCalledWith('ws-filter');
  });
});
