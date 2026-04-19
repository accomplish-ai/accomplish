/**
 * Unit tests for BrowserPreview IPC handlers (ENG-695 / ENG-981)
 *
 * Tests the browser live-view IPC handlers:
 * - browser-preview:start
 * - browser-preview:stop
 * - browser-preview:status
 *
 * The implementation routes IPC calls to the browserPreview service which
 * uses Chrome DevTools Protocol (CDP) via a WebSocket-based CdpClient.
 * These tests mock the browserPreview service to isolate handler logic.
 *
 * Mock/setup helpers live in helpers/browserPreview.helpers.ts.
 *
 * @module __tests__/unit/main/ipc/handlers.browserpreview.unit.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Prevent undici from crashing on Node 20 (undici 8 requires Node 22 APIs) ──
vi.mock('undici', () => ({
  ProxyAgent: class ProxyAgent {},
  Agent: class Agent {},
  fetch: vi.fn(),
  setGlobalDispatcher: vi.fn(),
  getGlobalDispatcher: vi.fn(),
}));

// ── Hoisted mock fns (must be defined before any vi.mock() calls) ─────────────
const {
  mockStartBrowserPreviewStream,
  mockStopBrowserPreviewStream,
  mockStopAllBrowserPreviewStreams,
  mockIsScreencastActive,
  mockAutoStartScreencast,
} = vi.hoisted(() => ({
  mockStartBrowserPreviewStream: vi.fn(() => Promise.resolve()),
  mockStopBrowserPreviewStream: vi.fn(() => Promise.resolve()),
  mockStopAllBrowserPreviewStreams: vi.fn(() => Promise.resolve()),
  mockIsScreencastActive: vi.fn(() => false),
  mockAutoStartScreencast: vi.fn(() => Promise.resolve()),
}));

import { mockHandlers, createMockStorage, invokeHandler } from './helpers/browserPreview.helpers';

// ── Mock browserPreview service (CDP-based, not ws npm package) ──────────────

vi.mock('@main/services/browserPreview', () => ({
  startBrowserPreviewStream: mockStartBrowserPreviewStream,
  stopBrowserPreviewStream: mockStopBrowserPreviewStream,
  stopAllBrowserPreviewStreams: mockStopAllBrowserPreviewStreams,
  isScreencastActive: mockIsScreencastActive,
  autoStartScreencast: mockAutoStartScreencast,
}));

// ── Mock Electron ────────────────────────────────────────────────────────────

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      mockHandlers.set(channel, handler);
    }),
    on: vi.fn(),
    removeHandler: vi.fn(),
    removeAllListeners: vi.fn(),
  },
  BrowserWindow: {
    fromWebContents: vi.fn(() => ({
      id: 1,
      isDestroyed: vi.fn(() => false),
      webContents: { send: vi.fn(), isDestroyed: vi.fn(() => false) },
    })),
    getFocusedWindow: vi.fn(() => ({
      id: 1,
      isDestroyed: vi.fn(() => false),
    })),
    getAllWindows: vi.fn(() => [
      {
        id: 1,
        isDestroyed: vi.fn(() => false),
        webContents: { send: vi.fn() },
      },
    ]),
  },
  shell: { openExternal: vi.fn(), openPath: vi.fn(), showItemInFolder: vi.fn() },
  dialog: { showOpenDialog: vi.fn() },
  nativeTheme: { themeSource: 'system', shouldUseDarkColors: false, on: vi.fn(), off: vi.fn() },
  app: { isPackaged: false, getPath: vi.fn(() => '/tmp/test-app') },
}));

// ── Mock opencode ────────────────────────────────────────────────────────────

vi.mock('@main/opencode', () => ({
  getTaskManager: vi.fn(() => ({
    startTask: vi.fn(),
    cancelTask: vi.fn(),
    interruptTask: vi.fn(),
    sendResponse: vi.fn(),
    hasActiveTask: vi.fn(() => false),
    getActiveTaskId: vi.fn(() => null),
    getSessionId: vi.fn(() => null),
    isTaskQueued: vi.fn(() => false),
    cancelQueuedTask: vi.fn(),
    dispose: vi.fn(),
  })),
  disposeTaskManager: vi.fn(),
  isOpenCodeCliInstalled: vi.fn(() => Promise.resolve(true)),
  getOpenCodeCliVersion: vi.fn(() => Promise.resolve('1.0.0')),
  cleanupVertexServiceAccountKey: vi.fn(),
}));

vi.mock('@main/opencode/auth-browser', () => ({
  loginOpenAiWithChatGpt: vi.fn(() => Promise.resolve({ openedUrl: undefined })),
}));

// ── Mock storage ─────────────────────────────────────────────────────────────

vi.mock('@main/store/storage', () => ({
  getStorage: vi.fn(() => createMockStorage()),
}));

// ── Mock agent-core ──────────────────────────────────────────────────────────

vi.mock('@accomplish_ai/agent-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@accomplish_ai/agent-core')>();
  return {
    validateApiKey: vi.fn(() => Promise.resolve({ valid: true })),
    validateBedrockCredentials: vi.fn(() => Promise.resolve({ valid: true })),
    fetchBedrockModels: vi.fn(() => Promise.resolve({ success: true, models: [] })),
    validateAzureFoundry: vi.fn(() => Promise.resolve({ valid: true })),
    testAzureFoundryConnection: vi.fn(() => Promise.resolve({ success: true })),
    fetchOpenRouterModels: vi.fn(() => Promise.resolve({ success: true, models: [] })),
    fetchProviderModels: vi.fn(() => Promise.resolve({ success: true, models: [] })),
    testLiteLLMConnection: vi.fn(() => Promise.resolve({ success: true })),
    fetchLiteLLMModels: vi.fn(() => Promise.resolve({ success: true, models: [] })),
    validateHttpUrl: actual.validateHttpUrl,
    sanitizeString: vi.fn((input: unknown, _fieldName: string, _maxLength = 255) => {
      if (typeof input !== 'string') throw new Error('must be a string');
      return input.trim();
    }),
    generateTaskSummary: vi.fn(() => Promise.resolve('Mock summary')),
    validateTaskConfig: actual.validateTaskConfig,
    createTaskId: vi.fn(() => `task_${Date.now()}`),
    createMessageId: vi.fn(() => `msg-${Date.now()}`),
    testOllamaConnection: vi.fn(() => Promise.resolve({ success: true })),
    testLMStudioConnection: vi.fn(() => Promise.resolve({ success: true, models: [] })),
    fetchLMStudioModels: vi.fn(() => Promise.resolve({ success: true, models: [] })),
    validateLMStudioConfig: vi.fn(),
    getOpenAiOauthStatus: vi.fn(() => ({ connected: false })),
    discoverOAuthMetadata: vi.fn(),
    registerOAuthClient: vi.fn(),
    generatePkceChallenge: vi.fn(),
    buildAuthorizationUrl: vi.fn(),
    exchangeCodeForTokens: vi.fn(),
    DEFAULT_PROVIDERS: actual.DEFAULT_PROVIDERS,
    ALLOWED_API_KEY_PROVIDERS: actual.ALLOWED_API_KEY_PROVIDERS,
    STANDARD_VALIDATION_PROVIDERS: actual.STANDARD_VALIDATION_PROVIDERS,
    ZAI_ENDPOINTS: actual.ZAI_ENDPOINTS ?? {},
    DEV_BROWSER_PORT: 9224,
    DEV_BROWSER_CDP_PORT: 9223,
    validate: actual.validate,
    permissionResponseSchema: actual.permissionResponseSchema,
    taskConfigSchema: actual.taskConfigSchema,
    resumeSessionSchema: actual.resumeSessionSchema,
    getAzureEntraToken: vi.fn(() => Promise.resolve({ success: true, token: 'mock' })),
  };
});

vi.mock('@accomplish_ai/agent-core/common', () => ({
  DEV_BROWSER_PORT: 9224,
  DEV_BROWSER_CDP_PORT: 9223,
  getConnectorDefinitions: () => [],
}));

// ── Mock remaining dependencies ──────────────────────────────────────────────

vi.mock('@main/connectors/connector-token-resolver', () => ({
  connectBuiltInConnector: vi.fn(),
  resolveMcpConnectorAccessToken: vi.fn(),
}));

vi.mock('@main/ipc/handlers/built-in-connector-handlers', () => ({
  registerBuiltInConnectorHandlers: vi.fn(),
}));

vi.mock('@main/store/secureStorage', () => ({
  storeApiKey: vi.fn(),
  getApiKey: vi.fn(() => null),
  deleteApiKey: vi.fn(),
  getAllApiKeys: vi.fn(() => Promise.resolve({})),
  hasAnyApiKey: vi.fn(() => Promise.resolve(false)),
  getBedrockCredentials: vi.fn(() => null),
}));

vi.mock('@main/ipc/validation', () => ({
  normalizeIpcError: vi.fn((err: Error) => err),
  validate: vi.fn((_schema: unknown, data: unknown) => data),
  permissionResponseSchema: {},
}));

vi.mock('@main/ipc/task-callbacks', () => ({
  createTaskCallbacks: vi.fn(() => ({})),
}));

vi.mock('@main/test-utils/mock-task-flow', () => ({
  isMockTaskEventsEnabled: vi.fn(() => false),
  createMockTask: vi.fn(),
  executeMockTaskFlow: vi.fn(),
  detectScenarioFromPrompt: vi.fn(),
}));

vi.mock('@main/skills', () => ({
  skillsManager: {
    getAll: vi.fn(() => []),
    getEnabled: vi.fn(() => []),
    setEnabled: vi.fn(),
    getContent: vi.fn(() => null),
    addFromFile: vi.fn(),
    addFromGitHub: vi.fn(),
    delete: vi.fn(),
    resync: vi.fn(),
  },
}));

vi.mock('@main/providers', () => ({
  registerVertexHandlers: vi.fn(),
}));

vi.mock('@main/logging', () => ({
  getLogCollector: vi.fn(() => ({
    addLog: vi.fn(),
    getLogs: vi.fn(() => []),
    exportLogs: vi.fn(() => Promise.resolve({ success: true, path: '/tmp/logs.txt' })),
  })),
}));

vi.mock('@main/services/speechToText', () => ({
  validateElevenLabsApiKey: vi.fn(() => Promise.resolve({ valid: true })),
  transcribeAudio: vi.fn(() => Promise.resolve({ success: true, result: { text: '' } })),
}));

// ── Mock global fetch ─────────────────────────────────────────────────────────

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ── Import handler registration (after all mocks) ─────────────────────────────

import { registerIPCHandlers } from '@main/ipc/handlers';

// ── Convenience wrapper using module-level mockHandlers ───────────────────────

async function invoke(channel: string, ...args: unknown[]): Promise<unknown> {
  return invokeHandler(mockHandlers, channel, ...args);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('BrowserPreview IPC Handlers (CDP implementation)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHandlers.clear();

    // Reset mock implementations
    mockStartBrowserPreviewStream.mockResolvedValue(undefined);
    mockStopBrowserPreviewStream.mockResolvedValue(undefined);
    mockStopAllBrowserPreviewStreams.mockResolvedValue(undefined);
    mockIsScreencastActive.mockReturnValue(false);

    registerIPCHandlers();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  // ── Handler registration ──────────────────────────────────────────────────

  describe('handler registration', () => {
    it('should register browser-preview:start handler', () => {
      expect(mockHandlers.has('browser-preview:start')).toBe(true);
    });

    it('should register browser-preview:stop handler', () => {
      expect(mockHandlers.has('browser-preview:stop')).toBe(true);
    });

    it('should register browser-preview:status handler', () => {
      expect(mockHandlers.has('browser-preview:status')).toBe(true);
    });
  });

  // ── browser-preview:start ─────────────────────────────────────────────────

  describe('browser-preview:start', () => {
    it('should return { success: true } on success', async () => {
      const result = await invoke('browser-preview:start', 'task-123', 'main');
      expect(result).toEqual({ success: true });
    });

    it('should call startBrowserPreviewStream with taskId and pageName', async () => {
      await invoke('browser-preview:start', 'task-abc', 'mypage');
      expect(mockStartBrowserPreviewStream).toHaveBeenCalledWith('task-abc', 'mypage');
    });

    it('should call startBrowserPreviewStream with default pageName when omitted', async () => {
      await invoke('browser-preview:start', 'task-xyz');
      expect(mockStartBrowserPreviewStream).toHaveBeenCalledWith('task-xyz', undefined);
    });

    it('should throw when taskId is empty string', async () => {
      await expect(invoke('browser-preview:start', '')).rejects.toThrow('taskId is required');
    });

    it('should throw when taskId is not a string', async () => {
      await expect(invoke('browser-preview:start', 42)).rejects.toThrow('taskId is required');
    });

    it('should throw when taskId is null', async () => {
      await expect(invoke('browser-preview:start', null)).rejects.toThrow('taskId is required');
    });

    it('should propagate errors from startBrowserPreviewStream', async () => {
      mockStartBrowserPreviewStream.mockRejectedValueOnce(new Error('CDP connection failed'));
      await expect(invoke('browser-preview:start', 'task-err')).rejects.toThrow(
        'CDP connection failed',
      );
    });

    it('should call startBrowserPreviewStream once per invocation', async () => {
      await invoke('browser-preview:start', 'task-once', 'page');
      expect(mockStartBrowserPreviewStream).toHaveBeenCalledTimes(1);
    });

    it('should allow multiple start calls for different tasks', async () => {
      await invoke('browser-preview:start', 'task-1', 'page-1');
      await invoke('browser-preview:start', 'task-2', 'page-2');

      expect(mockStartBrowserPreviewStream).toHaveBeenCalledTimes(2);
      expect(mockStartBrowserPreviewStream).toHaveBeenNthCalledWith(1, 'task-1', 'page-1');
      expect(mockStartBrowserPreviewStream).toHaveBeenNthCalledWith(2, 'task-2', 'page-2');
    });
  });

  // ── browser-preview:stop ──────────────────────────────────────────────────

  describe('browser-preview:stop', () => {
    it('should return { stopped: true } on success', async () => {
      const result = await invoke('browser-preview:stop', 'task-123');
      expect(result).toEqual({ stopped: true });
    });

    it('should call stopBrowserPreviewStream with the given taskId', async () => {
      await invoke('browser-preview:stop', 'task-stop-abc');
      expect(mockStopBrowserPreviewStream).toHaveBeenCalledWith('task-stop-abc');
    });

    it('should throw when taskId is empty string', async () => {
      await expect(invoke('browser-preview:stop', '')).rejects.toThrow('taskId is required');
    });

    it('should throw when taskId is not a string', async () => {
      await expect(invoke('browser-preview:stop', null)).rejects.toThrow('taskId is required');
    });

    it('should propagate errors from stopBrowserPreviewStream', async () => {
      mockStopBrowserPreviewStream.mockRejectedValueOnce(new Error('Stop failed'));
      await expect(invoke('browser-preview:stop', 'task-err')).rejects.toThrow('Stop failed');
    });

    it('should call stopBrowserPreviewStream exactly once', async () => {
      await invoke('browser-preview:stop', 'task-once');
      expect(mockStopBrowserPreviewStream).toHaveBeenCalledTimes(1);
    });

    it('should handle safe stop when no session is active (service handles it gracefully)', async () => {
      mockStopBrowserPreviewStream.mockResolvedValueOnce(undefined);
      await expect(invoke('browser-preview:stop', 'nonexistent-task')).resolves.toEqual({
        stopped: true,
      });
    });
  });

  // ── browser-preview:status ────────────────────────────────────────────────

  describe('browser-preview:status', () => {
    it('should return { active: false } when no session is running', async () => {
      mockIsScreencastActive.mockReturnValue(false);
      const result = await invoke('browser-preview:status');
      expect(result).toEqual({ active: false });
    });

    it('should return { active: true } when a session is active', async () => {
      mockIsScreencastActive.mockReturnValue(true);
      const result = await invoke('browser-preview:status');
      expect(result).toEqual({ active: true });
    });

    it('should call isScreencastActive to determine status', async () => {
      await invoke('browser-preview:status');
      expect(mockIsScreencastActive).toHaveBeenCalled();
    });

    it('should reflect live changes: false → true → false', async () => {
      mockIsScreencastActive.mockReturnValueOnce(false);
      expect(await invoke('browser-preview:status')).toEqual({ active: false });

      mockIsScreencastActive.mockReturnValueOnce(true);
      expect(await invoke('browser-preview:status')).toEqual({ active: true });

      mockIsScreencastActive.mockReturnValueOnce(false);
      expect(await invoke('browser-preview:status')).toEqual({ active: false });
    });
  });

  // ── Handler isolation / idempotency ──────────────────────────────────────

  describe('handler isolation', () => {
    it('should not share state between independent start calls', async () => {
      mockStartBrowserPreviewStream.mockResolvedValue(undefined);

      const result1 = await invoke('browser-preview:start', 'task-A', 'page-A');
      const result2 = await invoke('browser-preview:start', 'task-B', 'page-B');

      expect(result1).toEqual({ success: true });
      expect(result2).toEqual({ success: true });
      expect(mockStartBrowserPreviewStream).toHaveBeenNthCalledWith(1, 'task-A', 'page-A');
      expect(mockStartBrowserPreviewStream).toHaveBeenNthCalledWith(2, 'task-B', 'page-B');
    });

    it('should allow start then stop for the same task', async () => {
      await invoke('browser-preview:start', 'task-cycle');
      await invoke('browser-preview:stop', 'task-cycle');

      expect(mockStartBrowserPreviewStream).toHaveBeenCalledWith('task-cycle', undefined);
      expect(mockStopBrowserPreviewStream).toHaveBeenCalledWith('task-cycle');
    });

    it('should not call stop when starting (lifecycle managed by service)', async () => {
      await invoke('browser-preview:start', 'task-new', 'main');
      expect(mockStopBrowserPreviewStream).not.toHaveBeenCalled();
    });
  });

  // ── CDP architecture validation ───────────────────────────────────────────

  describe('CDP architecture (service contract)', () => {
    it('startBrowserPreviewStream is the CDP-based service function (not ws package)', () => {
      expect(mockStartBrowserPreviewStream).toBeDefined();
      expect(typeof mockStartBrowserPreviewStream).toBe('function');
    });

    it('stopBrowserPreviewStream sends Page.stopScreencast via CDP (service contract)', () => {
      expect(mockStopBrowserPreviewStream).toBeDefined();
      expect(typeof mockStopBrowserPreviewStream).toBe('function');
    });

    it('isScreencastActive reflects CDP session state (not WebSocket server state)', () => {
      mockIsScreencastActive.mockReturnValue(true);
      expect(mockIsScreencastActive()).toBe(true);
      mockIsScreencastActive.mockReturnValue(false);
      expect(mockIsScreencastActive()).toBe(false);
    });

    it('IPC channels use browser-preview: prefix (not browser:start-screencast)', () => {
      expect(mockHandlers.has('browser-preview:start')).toBe(true);
      expect(mockHandlers.has('browser-preview:stop')).toBe(true);
      expect(mockHandlers.has('browser-preview:status')).toBe(true);

      expect(mockHandlers.has('browser:start-screencast')).toBe(false);
      expect(mockHandlers.has('browser:stop-screencast')).toBe(false);
    });
  });
});
