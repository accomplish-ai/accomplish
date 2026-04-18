import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StorageAPI } from '@accomplish_ai/agent-core';
import { SettingsService, SETTINGS_CHANGED } from '../../src/settings-service.js';
import type { SettingsChangePayload } from '../../src/settings-service.js';

/**
 * Milestone 2 — SettingsService forwards reads/writes to StorageAPI and
 * emits `settings.changed` on every write. These tests pin both sides of
 * that contract so a future refactor can't silently stop notifying.
 */
function makeStorageStub(): StorageAPI {
  return {
    getAppSettings: vi.fn(() => ({}) as unknown as ReturnType<StorageAPI['getAppSettings']>),
    getProviderSettings: vi.fn(
      () => ({}) as unknown as ReturnType<StorageAPI['getProviderSettings']>,
    ),
    getHuggingFaceLocalConfig: vi.fn(() => null),
    // M2 review follow-up: getAll must cover the full M5 first-frame payload
    getNotificationsEnabled: vi.fn(() => true),
    getCloseBehavior: vi.fn(() => 'keep-daemon' as const),
    getSandboxConfig: vi.fn(() => ({}) as unknown as ReturnType<StorageAPI['getSandboxConfig']>),
    getCloudBrowserConfig: vi.fn(() => null),
    getMessagingConfig: vi.fn(() => null),
    // Scope-completeness: selected-model + provider-config setters/getters
    getSelectedModel: vi.fn(() => null),
    setSelectedModel: vi.fn(),
    getOpenAiBaseUrl: vi.fn(() => ''),
    setOpenAiBaseUrl: vi.fn(),
    getOllamaConfig: vi.fn(() => null),
    setOllamaConfig: vi.fn(),
    getLiteLLMConfig: vi.fn(() => null),
    setLiteLLMConfig: vi.fn(),
    getAzureFoundryConfig: vi.fn(() => null),
    setAzureFoundryConfig: vi.fn(),
    getLMStudioConfig: vi.fn(() => null),
    setLMStudioConfig: vi.fn(),
    getNimConfig: vi.fn(() => null),
    setNimConfig: vi.fn(),
    setTheme: vi.fn(),
    setLanguage: vi.fn(),
    setDebugMode: vi.fn(),
    setNotificationsEnabled: vi.fn(),
    setCloseBehavior: vi.fn(),
    setSandboxConfig: vi.fn(),
    setCloudBrowserConfig: vi.fn(),
    setMessagingConfig: vi.fn(),
    setOnboardingComplete: vi.fn(),
    setHuggingFaceLocalConfig: vi.fn(),
    setActiveProvider: vi.fn(),
    setConnectedProvider: vi.fn(),
    removeConnectedProvider: vi.fn(),
    updateProviderModel: vi.fn(),
    setProviderDebugMode: vi.fn(),
    getProviderDebugMode: vi.fn(() => false),
    getAccomplishAiCredits: vi.fn(() => null),
    saveAccomplishAiCredits: vi.fn(),
  } as unknown as StorageAPI;
}

function captureChanges(service: SettingsService): SettingsChangePayload[] {
  const captured: SettingsChangePayload[] = [];
  service.on(SETTINGS_CHANGED, (p) => captured.push(p));
  return captured;
}

describe('SettingsService', () => {
  let storage: StorageAPI;
  let service: SettingsService;

  beforeEach(() => {
    storage = makeStorageStub();
    service = new SettingsService(storage);
  });

  it('getAll returns the full first-frame snapshot (covers fields AppSettings does not bundle)', () => {
    vi.mocked(storage.getAppSettings).mockReturnValue({
      debugMode: true,
    } as unknown as ReturnType<StorageAPI['getAppSettings']>);
    vi.mocked(storage.getProviderSettings).mockReturnValue({
      activeProviderId: 'anthropic',
    } as unknown as ReturnType<StorageAPI['getProviderSettings']>);
    vi.mocked(storage.getHuggingFaceLocalConfig).mockReturnValue(null);
    vi.mocked(storage.getNotificationsEnabled).mockReturnValue(false);
    vi.mocked(storage.getCloseBehavior).mockReturnValue('stop-daemon');
    vi.mocked(storage.getSandboxConfig).mockReturnValue({
      mode: 'disabled',
    } as unknown as ReturnType<StorageAPI['getSandboxConfig']>);
    vi.mocked(storage.getCloudBrowserConfig).mockReturnValue(null);
    vi.mocked(storage.getMessagingConfig).mockReturnValue(null);

    const snap = service.getAll();

    expect(snap.app).toEqual({ debugMode: true });
    expect(snap.providers).toEqual({ activeProviderId: 'anthropic' });
    expect(snap.huggingFaceLocalConfig).toBeNull();
    // Review P2: these five fields are NOT in AppSettings and must be
    // present in the snapshot so M5's daemon-first startup doesn't need
    // to issue follow-up RPCs for basic chrome state.
    expect(snap.notificationsEnabled).toBe(false);
    expect(snap.closeBehavior).toBe('stop-daemon');
    expect(snap.sandboxConfig).toEqual({ mode: 'disabled' });
    expect(snap.cloudBrowserConfig).toBeNull();
    expect(snap.messagingConfig).toBeNull();
  });

  it('exposes on-demand getters for the fields AppSettings does not bundle', () => {
    // Renderer re-reads these independently (notifications toggle in tray,
    // close-behavior picker in settings, sandbox config UI). Fetching the
    // whole snapshot for a single field is wasteful.
    vi.mocked(storage.getNotificationsEnabled).mockReturnValue(true);
    vi.mocked(storage.getCloseBehavior).mockReturnValue('keep-daemon');

    expect(service.getNotificationsEnabled()).toBe(true);
    expect(service.getCloseBehavior()).toBe('keep-daemon');
    // The three typed-config getters all delegate straight to storage; we
    // don't need fancy fixtures here — just confirm the plumbing.
    service.getSandboxConfig();
    service.getCloudBrowserConfig();
    service.getMessagingConfig();
    expect(storage.getSandboxConfig).toHaveBeenCalled();
    expect(storage.getCloudBrowserConfig).toHaveBeenCalled();
    expect(storage.getMessagingConfig).toHaveBeenCalled();
  });

  it('setTheme writes to storage and emits settings.changed with the new value', () => {
    const changes = captureChanges(service);
    service.setTheme('dark');
    expect(storage.setTheme).toHaveBeenCalledWith('dark');
    expect(changes).toEqual([{ key: 'theme', value: 'dark' }]);
  });

  it('setLanguage, setDebugMode, setNotificationsEnabled, setCloseBehavior each emit', () => {
    const changes = captureChanges(service);
    service.setLanguage('en');
    service.setDebugMode(true);
    service.setNotificationsEnabled(false);
    service.setCloseBehavior('stop-daemon');

    expect(changes).toEqual([
      { key: 'language', value: 'en' },
      { key: 'debugMode', value: true },
      { key: 'notificationsEnabled', value: false },
      { key: 'closeBehavior', value: 'stop-daemon' },
    ]);
  });

  it('setOnboardingComplete forwards + emits', () => {
    const changes = captureChanges(service);
    service.setOnboardingComplete(true);
    expect(storage.setOnboardingComplete).toHaveBeenCalledWith(true);
    expect(changes).toEqual([{ key: 'onboardingComplete', value: true }]);
  });

  it('provider setters all emit the coarser `providerSettings` bucket', () => {
    const changes = captureChanges(service);

    service.setActiveProvider('anthropic' as never);
    service.setConnectedProvider('anthropic' as never, {} as never);
    service.removeConnectedProvider('anthropic' as never);
    service.updateProviderModel('anthropic' as never, 'claude-opus-4.7');
    service.setProviderDebugMode(true);
    service.saveAccomplishAiCredits({} as never);

    expect(changes.every((c) => c.key === 'providerSettings')).toBe(true);
    expect(changes).toHaveLength(6);
  });

  it('setHuggingFaceLocalConfig emits with the config in the payload', () => {
    const changes = captureChanges(service);
    const cfg = { enabled: true, selectedModelId: 'gpt-oss' } as never;

    service.setHuggingFaceLocalConfig(cfg);

    expect(storage.setHuggingFaceLocalConfig).toHaveBeenCalledWith(cfg);
    expect(changes).toEqual([{ key: 'huggingFaceLocalConfig', value: cfg }]);
  });

  it('read-only getters do NOT emit settings.changed', () => {
    const changes = captureChanges(service);

    service.getProviderSettings();
    service.getProviderDebugMode();
    service.getAccomplishAiCredits();
    service.getHuggingFaceLocalConfig();
    service.getAll();

    expect(changes).toEqual([]);
  });

  // ── Scope-completeness: selected-model + app-settings provider configs ─
  describe('selected-model + provider configs (review P2b)', () => {
    it('getAll includes nimConfig (not in AppSettings) so M5 first-frame is complete', () => {
      vi.mocked(storage.getNimConfig).mockReturnValue({
        baseUrl: 'http://nim.local',
      } as unknown as ReturnType<StorageAPI['getNimConfig']>);

      const snap = service.getAll();

      expect(snap.nimConfig).toEqual({ baseUrl: 'http://nim.local' });
    });

    it.each([
      ['selectedModel', 'setSelectedModel', { provider: 'anthropic', model: 'claude' }],
      ['openaiBaseUrl', 'setOpenAiBaseUrl', 'https://api.openai.com/v1'],
      ['ollamaConfig', 'setOllamaConfig', { baseUrl: 'http://localhost:11434' }],
      ['litellmConfig', 'setLiteLLMConfig', { baseUrl: 'http://localhost:4000' }],
      ['azureFoundryConfig', 'setAzureFoundryConfig', { endpoint: 'https://f' }],
      ['lmstudioConfig', 'setLMStudioConfig', { baseUrl: 'http://localhost:1234' }],
      ['nimConfig', 'setNimConfig', { baseUrl: 'http://nim.local' }],
    ] as const)('set%s writes through to storage and emits %s', (key, method, value) => {
      const changes = captureChanges(service);
      // @ts-expect-error — dynamic-key service method call is a table-driven
      // shortcut; the TS checker has already verified each individual method
      // via the type-tight setter signatures above.
      service[method](value);

      // @ts-expect-error — same dynamic-key rationale
      expect(storage[method]).toHaveBeenCalledWith(value);
      expect(changes).toEqual([{ key, value }]);
    });

    it('getters delegate directly to storage', () => {
      service.getSelectedModel();
      service.getOpenAiBaseUrl();
      service.getOllamaConfig();
      service.getLiteLLMConfig();
      service.getAzureFoundryConfig();
      service.getLMStudioConfig();
      service.getNimConfig();

      expect(storage.getSelectedModel).toHaveBeenCalled();
      expect(storage.getOpenAiBaseUrl).toHaveBeenCalled();
      expect(storage.getOllamaConfig).toHaveBeenCalled();
      expect(storage.getLiteLLMConfig).toHaveBeenCalled();
      expect(storage.getAzureFoundryConfig).toHaveBeenCalled();
      expect(storage.getLMStudioConfig).toHaveBeenCalled();
      expect(storage.getNimConfig).toHaveBeenCalled();
    });
  });
});
