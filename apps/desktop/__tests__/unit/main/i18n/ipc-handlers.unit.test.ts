/**
 * Unit tests for i18n IPC handlers
 *
 * Tests the 5 i18n IPC channels registered in handlers.ts:
 * i18n:get-language, i18n:set-language, i18n:get-translations,
 * i18n:get-supported-languages, i18n:get-resolved-language.
 *
 * All dependent modules are mocked to test handler logic in isolation.
 *
 * @module __tests__/unit/main/i18n/ipc-handlers.unit.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Track registered handlers
const mockHandlers = new Map<string, Function>();

// Track broadcasts to windows
const mockWebContentsSend = vi.fn();
const mockWindow = {
  id: 1,
  isDestroyed: vi.fn(() => false),
  webContents: {
    send: mockWebContentsSend,
    isDestroyed: vi.fn(() => false),
  },
};

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: Function) => {
      mockHandlers.set(channel, handler);
    }),
    on: vi.fn(),
    removeHandler: vi.fn(),
    removeAllListeners: vi.fn(),
  },
  BrowserWindow: {
    fromWebContents: vi.fn(() => mockWindow),
    getFocusedWindow: vi.fn(() => mockWindow),
    getAllWindows: vi.fn(() => [mockWindow]),
  },
  shell: {
    openExternal: vi.fn(),
  },
  app: {
    isPackaged: false,
    getPath: vi.fn(() => '/tmp/test'),
    getLocale: vi.fn(() => 'en-US'),
  },
  nativeTheme: {
    themeSource: 'system',
  },
  dialog: {
    showSaveDialog: vi.fn(),
  },
}));

// Mock agent-core storage
let mockLanguage = 'auto';
vi.mock('@accomplish_ai/agent-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@accomplish_ai/agent-core')>();
  const storageMethods = {
    getLanguage: vi.fn(() => mockLanguage),
    setLanguage: vi.fn((lang: string) => { mockLanguage = lang; }),
    getDebugMode: vi.fn(() => false),
    setDebugMode: vi.fn(),
    getAppSettings: vi.fn(() => ({
      debugMode: false,
      onboardingComplete: true,
      selectedModel: null,
      language: mockLanguage,
      openaiBaseUrl: '',
    })),
    getOnboardingComplete: vi.fn(() => true),
    setOnboardingComplete: vi.fn(),
    getSelectedModel: vi.fn(() => null),
    setSelectedModel: vi.fn(),
    getOpenAiBaseUrl: vi.fn(() => ''),
    setOpenAiBaseUrl: vi.fn(),
    getOllamaConfig: vi.fn(() => null),
    setOllamaConfig: vi.fn(),
    getAzureFoundryConfig: vi.fn(() => null),
    setAzureFoundryConfig: vi.fn(),
    getLiteLLMConfig: vi.fn(() => null),
    setLiteLLMConfig: vi.fn(),
    getLMStudioConfig: vi.fn(() => null),
    setLMStudioConfig: vi.fn(),
    getTheme: vi.fn(() => 'system'),
    setTheme: vi.fn(),
    initialize: vi.fn(),
    isDatabaseInitialized: vi.fn(() => true),
    close: vi.fn(),
    getDatabasePath: vi.fn(() => '/mock/path'),
    clearAppSettings: vi.fn(),
    getTasks: vi.fn(() => []),
    getTask: vi.fn(),
    saveTask: vi.fn(),
    updateTaskStatus: vi.fn(),
    updateTaskSessionId: vi.fn(),
    updateTaskSummary: vi.fn(),
    addTaskMessage: vi.fn(),
    deleteTask: vi.fn(),
    clearHistory: vi.fn(),
    saveTodosForTask: vi.fn(),
    getTodosForTask: vi.fn(() => []),
    clearTodosForTask: vi.fn(),
    storeApiKey: vi.fn(),
    getApiKey: vi.fn(() => null),
    deleteApiKey: vi.fn(() => true),
    getAllApiKeys: vi.fn(() => Promise.resolve({})),
    storeBedrockCredentials: vi.fn(),
    getBedrockCredentials: vi.fn(() => null),
    hasAnyApiKey: vi.fn(() => Promise.resolve(false)),
    listStoredCredentials: vi.fn(() => []),
    clearSecureStorage: vi.fn(),
    getProviderSettings: vi.fn(() => ({
      activeProviderId: null,
      connectedProviders: {},
      debugMode: false,
    })),
    setActiveProvider: vi.fn(),
    getActiveProviderModel: vi.fn(() => null),
    getConnectedProvider: vi.fn(() => null),
    setConnectedProvider: vi.fn(),
    removeConnectedProvider: vi.fn(),
    updateProviderModel: vi.fn(),
    setProviderDebugMode: vi.fn(),
    getProviderDebugMode: vi.fn(() => false),
    hasReadyProvider: vi.fn(() => false),
    getConnectedProviderIds: vi.fn(() => []),
    getActiveProviderId: vi.fn(() => null),
    clearProviderSettings: vi.fn(),
  };

  return {
    ...actual,
    createTaskId: vi.fn(() => 'task_1'),
    createMessageId: vi.fn(() => 'msg_1'),
    sanitizeString: actual.sanitizeString,
    safeParseJson: vi.fn((s: string) => ({ success: true, data: JSON.parse(s) })),
    validateApiKey: actual.validateApiKey,
    validateHttpUrl: actual.validateHttpUrl,
    validateTaskConfig: actual.validateTaskConfig,
    ALLOWED_API_KEY_PROVIDERS: actual.ALLOWED_API_KEY_PROVIDERS,
    STANDARD_VALIDATION_PROVIDERS: actual.STANDARD_VALIDATION_PROVIDERS,
    validate: actual.validate,
    permissionResponseSchema: actual.permissionResponseSchema,
    ...storageMethods,
    createStorage: vi.fn(() => storageMethods),
    generateTaskSummary: vi.fn(() => Promise.resolve('Summary')),
    getAzureEntraToken: vi.fn(),
    validateAnthropicApiKey: vi.fn(),
    validateOpenAIApiKey: vi.fn(),
    validateGoogleApiKey: vi.fn(),
    validateXAIApiKey: vi.fn(),
    validateBedrockCredentials: vi.fn(),
    validateDeepSeekApiKey: vi.fn(),
    validateOpenAICompatibleApiKey: vi.fn(),
    validateOllamaConnection: vi.fn(),
    validateLiteLLMConnection: vi.fn(),
    validateLMStudioConnection: vi.fn(),
    testLMStudioConnection: vi.fn(),
    fetchLMStudioModels: vi.fn(),
    validateLMStudioConfig: vi.fn(),
    validateAzureFoundryConnection: vi.fn(),
    validateMoonshotApiKey: vi.fn(),
    fetchProviderModels: vi.fn(),
    fetchBedrockModels: vi.fn(),
    validateAzureFoundry: vi.fn(),
    testAzureFoundryConnection: vi.fn(),
    fetchOpenRouterModels: vi.fn(),
    testLiteLLMConnection: vi.fn(),
    fetchLiteLLMModels: vi.fn(),
    testOllamaModelToolSupport: vi.fn(),
    testOllamaConnection: vi.fn(),
    getOpenAiOauthStatus: vi.fn(() => ({ connected: false })),
  };
});

// Mock i18n module
let mockI18nLanguage = 'en';
const mockInitializeI18n = vi.fn((stored?: string | null) => {
  if (stored && ['en', 'zh-CN'].includes(stored)) {
    mockI18nLanguage = stored;
  } else {
    mockI18nLanguage = 'en';
  }
});
const mockGetI18nLanguage = vi.fn(() => mockI18nLanguage as 'en' | 'zh-CN');
const mockSetI18nLanguage = vi.fn((lang: string) => { mockI18nLanguage = lang; });
const mockGetAllTranslations = vi.fn(() => ({
  common: { key: 'value' },
}));

vi.mock('@main/i18n', () => ({
  initializeI18n: (...args: unknown[]) => mockInitializeI18n(...args),
  getLanguage: () => mockGetI18nLanguage(),
  setLanguage: (...args: unknown[]) => mockSetI18nLanguage(...(args as [string])),
  getAllTranslations: (...args: unknown[]) => mockGetAllTranslations(...args),
  SUPPORTED_LANGUAGES: ['en', 'zh-CN'] as const,
}));

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

vi.mock('@main/opencode/auth', () => ({
  getOpenAiOauthStatus: vi.fn(() => ({ connected: false })),
  loginOpenAiWithChatGpt: vi.fn(),
}));

vi.mock('@main/store/secureStorage', () => ({
  storeApiKey: vi.fn(),
  getApiKey: vi.fn(() => null),
  deleteApiKey: vi.fn(),
  getAllApiKeys: vi.fn(() => Promise.resolve({})),
  hasAnyApiKey: vi.fn(() => Promise.resolve(false)),
  listStoredCredentials: vi.fn(() => []),
}));

vi.mock('@main/store/storage', () => ({
  getStorage: vi.fn(() => ({})),
}));

vi.mock('@main/config', () => ({
  getDesktopConfig: vi.fn(() => ({})),
}));

vi.mock('@main/permission-api', () => ({
  startPermissionApiServer: vi.fn(),
  startQuestionApiServer: vi.fn(),
  initPermissionApi: vi.fn(),
  resolvePermission: vi.fn(),
  resolveQuestion: vi.fn(),
  isFilePermissionRequest: vi.fn(),
  isQuestionRequest: vi.fn(),
  QUESTION_API_PORT: 9227,
}));

vi.mock('@main/skills', () => ({
  skillsManager: {
    initialize: vi.fn(),
    getSkills: vi.fn(() => []),
    getSkill: vi.fn(() => null),
    createSkill: vi.fn(),
    deleteSkill: vi.fn(),
    toggleSkill: vi.fn(),
    refreshSkills: vi.fn(),
    importFromGitHub: vi.fn(),
    getSkillsDir: vi.fn(() => '/tmp/skills'),
  },
}));

vi.mock('@main/providers', () => ({
  registerVertexHandlers: vi.fn(),
}));

vi.mock('@main/logging', () => ({
  getLogCollector: vi.fn(() => ({
    exportLogs: vi.fn(() => Promise.resolve('/tmp/logs.zip')),
  })),
}));

import { registerIPCHandlers } from '@main/ipc/handlers';

const mockEvent = {
  sender: {
    send: vi.fn(),
    isDestroyed: vi.fn(() => false),
  },
};

async function invokeHandler(channel: string, ...args: unknown[]): Promise<unknown> {
  const handler = mockHandlers.get(channel);
  if (!handler) {
    throw new Error(`No handler for channel: ${channel}`);
  }
  return handler(mockEvent, ...args);
}

describe('i18n IPC Handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHandlers.clear();
    mockLanguage = 'auto';
    mockI18nLanguage = 'en';
    registerIPCHandlers();
  });

  describe('i18n:get-language', () => {
    it('should return stored language preference', async () => {
      mockLanguage = 'zh-CN';
      const result = await invokeHandler('i18n:get-language');
      expect(result).toBe('zh-CN');
    });

    it('should return auto when no preference set', async () => {
      mockLanguage = 'auto';
      const result = await invokeHandler('i18n:get-language');
      expect(result).toBe('auto');
    });
  });

  describe('i18n:set-language', () => {
    it('should persist language preference', async () => {
      const { setLanguage } = await import('@accomplish_ai/agent-core');
      await invokeHandler('i18n:set-language', 'zh-CN');
      expect(setLanguage).toHaveBeenCalledWith('zh-CN');
    });

    it('should update i18n module for non-auto language', async () => {
      await invokeHandler('i18n:set-language', 'zh-CN');
      expect(mockSetI18nLanguage).toHaveBeenCalledWith('zh-CN');
    });

    it('should reinitialize i18n for auto language', async () => {
      await invokeHandler('i18n:set-language', 'auto');
      expect(mockInitializeI18n).toHaveBeenCalledWith(null);
    });

    it('should broadcast language-changed to all windows', async () => {
      await invokeHandler('i18n:set-language', 'en');
      expect(mockWebContentsSend).toHaveBeenCalledWith('i18n:language-changed', {
        language: 'en',
        resolvedLanguage: 'en',
      });
    });

    it('should reject unsupported language', async () => {
      await expect(invokeHandler('i18n:set-language', 'fr-FR')).rejects.toThrow('Unsupported language');
    });

    it('should accept auto as a valid value', async () => {
      await expect(invokeHandler('i18n:set-language', 'auto')).resolves.not.toThrow();
    });
  });

  describe('i18n:get-translations', () => {
    it('should return translations for specified language', async () => {
      const result = await invokeHandler('i18n:get-translations', 'en') as { language: string; translations: unknown };
      expect(result.language).toBe('en');
      expect(mockGetAllTranslations).toHaveBeenCalled();
    });

    it('should fall back to current language when none specified', async () => {
      mockI18nLanguage = 'zh-CN';
      const result = await invokeHandler('i18n:get-translations') as { language: string };
      expect(result.language).toBe('zh-CN');
    });

    it('should fall back to current language for unsupported param', async () => {
      mockI18nLanguage = 'en';
      const result = await invokeHandler('i18n:get-translations', 'invalid') as { language: string };
      expect(result.language).toBe('en');
    });
  });

  describe('i18n:get-supported-languages', () => {
    it('should return the supported languages array', async () => {
      const result = await invokeHandler('i18n:get-supported-languages');
      expect(result).toEqual(['en', 'zh-CN']);
    });
  });

  describe('i18n:get-resolved-language', () => {
    it('should return the resolved language from i18n module', async () => {
      mockI18nLanguage = 'zh-CN';
      const result = await invokeHandler('i18n:get-resolved-language');
      expect(result).toBe('zh-CN');
    });
  });

  describe('initialization', () => {
    it('should initialize i18n on handler registration', () => {
      expect(mockInitializeI18n).toHaveBeenCalled();
    });

    it('should pass stored language when not auto', () => {
      mockHandlers.clear();
      mockLanguage = 'zh-CN';
      vi.clearAllMocks();
      registerIPCHandlers();
      expect(mockInitializeI18n).toHaveBeenCalledWith('zh-CN');
    });

    it('should pass null when stored language is auto', () => {
      mockHandlers.clear();
      mockLanguage = 'auto';
      vi.clearAllMocks();
      registerIPCHandlers();
      expect(mockInitializeI18n).toHaveBeenCalledWith(null);
    });
  });
});
