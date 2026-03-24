/**
 * Shared mock/setup helpers for BrowserPreview IPC handler tests.
 *
 * Extracted from handlers.browserpreview.unit.test.ts to keep the test file
 * focused on assertions rather than boilerplate (CodeRabbit suggestion).
 */

import { vi } from 'vitest';

// ── Electron mock factory ────────────────────────────────────────────────────

export const mockHandlers = new Map<string, (...args: unknown[]) => unknown>();

export function createMockElectron() {
  return {
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
  };
}

// ── Storage mock factory ─────────────────────────────────────────────────────

export function createMockStorage() {
  return {
    getTasks: vi.fn(() => []),
    getTask: vi.fn(() => null),
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
    getDebugMode: vi.fn(() => false),
    setDebugMode: vi.fn(),
    getAppSettings: vi.fn(() => ({
      debugMode: false,
      onboardingComplete: false,
      selectedModel: null,
      openaiBaseUrl: '',
    })),
    getOnboardingComplete: vi.fn(() => false),
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
    clearAppSettings: vi.fn(),
    getProviderSettings: vi.fn(() => ({
      activeProviderId: 'anthropic',
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
    hasReadyProvider: vi.fn(() => true),
    getConnectedProviderIds: vi.fn(() => []),
    getActiveProviderId: vi.fn(() => null),
    clearProviderSettings: vi.fn(),
    initialize: vi.fn(),
    isDatabaseInitialized: vi.fn(() => true),
    close: vi.fn(),
    getDatabasePath: vi.fn(() => '/mock/path'),
    storeApiKey: vi.fn(),
    getApiKey: vi.fn(() => null),
    deleteApiKey: vi.fn(),
    getAllApiKeys: vi.fn(() => Promise.resolve({})),
    storeBedrockCredentials: vi.fn(),
    getBedrockCredentials: vi.fn(() => null),
    hasAnyApiKey: vi.fn(() => Promise.resolve(false)),
    listStoredCredentials: vi.fn(() => []),
    clearSecureStorage: vi.fn(),
    getTheme: vi.fn(() => 'system'),
    setTheme: vi.fn(),
    getAllConnectors: vi.fn(() => []),
    addConnector: vi.fn(),
    deleteConnector: vi.fn(),
    setConnectorEnabled: vi.fn(),
    getConnector: vi.fn(() => null),
    updateConnector: vi.fn(),
  };
}

// ── Test helpers ─────────────────────────────────────────────────────────────

export function createMockEvent() {
  return {
    sender: {
      send: vi.fn(),
      isDestroyed: vi.fn(() => false),
    },
  };
}

export async function invokeHandler(
  handlers: Map<string, (...args: unknown[]) => unknown>,
  channel: string,
  ...args: unknown[]
): Promise<unknown> {
  const handler = handlers.get(channel);
  if (!handler) {
    throw new Error(`No handler registered for channel: ${channel}`);
  }
  return handler(createMockEvent(), ...args);
}
