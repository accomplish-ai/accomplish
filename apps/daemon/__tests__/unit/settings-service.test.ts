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

  it('getAll returns a snapshot built from three StorageAPI reads', () => {
    vi.mocked(storage.getAppSettings).mockReturnValue({
      debugMode: true,
    } as unknown as ReturnType<StorageAPI['getAppSettings']>);
    vi.mocked(storage.getProviderSettings).mockReturnValue({
      activeProviderId: 'anthropic',
    } as unknown as ReturnType<StorageAPI['getProviderSettings']>);
    vi.mocked(storage.getHuggingFaceLocalConfig).mockReturnValue(null);

    const snap = service.getAll();

    expect(snap.app).toEqual({ debugMode: true });
    expect(snap.providers).toEqual({ activeProviderId: 'anthropic' });
    expect(snap.huggingFaceLocalConfig).toBeNull();
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
});
