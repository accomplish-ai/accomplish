/**
 * SettingsService — wraps `AppSettingsAPI` + `ProviderSettingsAPI` + a couple
 * of auxiliary stores (HuggingFace Local config, Accomplish AI credits cache).
 *
 * Milestone 2 of the daemon-only-SQLite migration
 * (plan: /Users/yanai/.claude/plans/squishy-exploring-hamster.md).
 *
 * Emits `settings.changed` on every write. The daemon wires that through
 * `rpc.notify('settings.changed', payload)` so main can forward to the
 * renderer and invalidate its local caches.
 *
 * The payload is a discriminated `{ key, value }` object so subscribers can
 * patch their cache in place. `getAll` returns a full snapshot used by the
 * renderer on startup (M5 daemon-first boot).
 */
import { EventEmitter } from 'node:events';
import type { StorageAPI } from '@accomplish_ai/agent-core';
import type {
  AppSettings,
  ThemePreference,
  ProviderId,
  ConnectedProvider,
  ProviderSettings,
  HuggingFaceLocalConfig,
} from '@accomplish_ai/agent-core';

/** Subset of `AppSettingsAPI`'s `language` literal. Re-declared here so
 *  consumers don't need a second import. */
export type LanguagePreference = 'auto' | 'en' | 'zh-CN' | 'ru' | 'fr';

export type SettingsChangePayload =
  | { key: 'theme'; value: ThemePreference }
  | { key: 'language'; value: LanguagePreference }
  | { key: 'debugMode'; value: boolean }
  | { key: 'notificationsEnabled'; value: boolean }
  | { key: 'closeBehavior'; value: 'keep-daemon' | 'stop-daemon' }
  | { key: 'sandboxConfig'; value: unknown }
  | { key: 'cloudBrowserConfig'; value: unknown | null }
  | { key: 'messagingConfig'; value: unknown | null }
  | { key: 'onboardingComplete'; value: boolean }
  | { key: 'providerSettings' }
  | { key: 'huggingFaceLocalConfig'; value: HuggingFaceLocalConfig | null };

export type SettingsSnapshot = {
  app: AppSettings;
  providers: ProviderSettings;
  huggingFaceLocalConfig: HuggingFaceLocalConfig | null;
};

/**
 * Event name — subscribe via `service.on(SETTINGS_CHANGED, listener)`. The
 * listener receives a `SettingsChangePayload`. We intentionally do NOT use
 * `declare interface` + class merging here (forbidden by
 * `@typescript-eslint/no-unsafe-declaration-merging`); the string constant
 * keeps callers honest and the payload type is the source of truth.
 */
export const SETTINGS_CHANGED = 'settings.changed' as const;

export class SettingsService extends EventEmitter {
  constructor(private readonly storage: StorageAPI) {
    super();
  }

  // ─── Bulk read (used by main on startup in M5) ──────────────────────────

  getAll(): SettingsSnapshot {
    return {
      app: this.storage.getAppSettings(),
      providers: this.storage.getProviderSettings(),
      huggingFaceLocalConfig: this.storage.getHuggingFaceLocalConfig(),
    };
  }

  // ─── App-level settings ─────────────────────────────────────────────────

  setTheme(theme: ThemePreference): void {
    this.storage.setTheme(theme);
    this.emit('settings.changed', { key: 'theme', value: theme });
  }

  setLanguage(language: LanguagePreference): void {
    this.storage.setLanguage(language);
    this.emit('settings.changed', { key: 'language', value: language });
  }

  setDebugMode(enabled: boolean): void {
    this.storage.setDebugMode(enabled);
    this.emit('settings.changed', { key: 'debugMode', value: enabled });
  }

  setNotificationsEnabled(enabled: boolean): void {
    this.storage.setNotificationsEnabled(enabled);
    this.emit('settings.changed', { key: 'notificationsEnabled', value: enabled });
  }

  setCloseBehavior(behavior: 'keep-daemon' | 'stop-daemon'): void {
    this.storage.setCloseBehavior(behavior);
    this.emit('settings.changed', { key: 'closeBehavior', value: behavior });
  }

  setSandboxConfig(config: Parameters<StorageAPI['setSandboxConfig']>[0]): void {
    this.storage.setSandboxConfig(config);
    this.emit('settings.changed', { key: 'sandboxConfig', value: config });
  }

  setCloudBrowserConfig(config: Parameters<StorageAPI['setCloudBrowserConfig']>[0]): void {
    this.storage.setCloudBrowserConfig(config);
    this.emit('settings.changed', { key: 'cloudBrowserConfig', value: config });
  }

  setMessagingConfig(config: Parameters<StorageAPI['setMessagingConfig']>[0]): void {
    this.storage.setMessagingConfig(config);
    this.emit('settings.changed', { key: 'messagingConfig', value: config });
  }

  setOnboardingComplete(complete: boolean): void {
    this.storage.setOnboardingComplete(complete);
    this.emit('settings.changed', { key: 'onboardingComplete', value: complete });
  }

  // ─── Provider settings ──────────────────────────────────────────────────

  getProviderSettings(): ProviderSettings {
    return this.storage.getProviderSettings();
  }

  setActiveProvider(providerId: ProviderId | null): void {
    this.storage.setActiveProvider(providerId);
    this.emit('settings.changed', { key: 'providerSettings' });
  }

  setConnectedProvider(providerId: ProviderId, provider: ConnectedProvider): void {
    this.storage.setConnectedProvider(providerId, provider);
    this.emit('settings.changed', { key: 'providerSettings' });
  }

  removeConnectedProvider(providerId: ProviderId): void {
    this.storage.removeConnectedProvider(providerId);
    this.emit('settings.changed', { key: 'providerSettings' });
  }

  updateProviderModel(providerId: ProviderId, modelId: string | null): void {
    this.storage.updateProviderModel(providerId, modelId);
    this.emit('settings.changed', { key: 'providerSettings' });
  }

  setProviderDebugMode(enabled: boolean): void {
    this.storage.setProviderDebugMode(enabled);
    this.emit('settings.changed', { key: 'providerSettings' });
  }

  getProviderDebugMode(): boolean {
    return this.storage.getProviderDebugMode();
  }

  // ─── Accomplish AI credits cache ────────────────────────────────────────

  getAccomplishAiCredits(): Parameters<StorageAPI['saveAccomplishAiCredits']>[0] | null {
    return this.storage.getAccomplishAiCredits();
  }

  saveAccomplishAiCredits(usage: Parameters<StorageAPI['saveAccomplishAiCredits']>[0]): void {
    this.storage.saveAccomplishAiCredits(usage);
    this.emit('settings.changed', { key: 'providerSettings' });
  }

  // ─── HuggingFace Local config ───────────────────────────────────────────

  getHuggingFaceLocalConfig(): HuggingFaceLocalConfig | null {
    return this.storage.getHuggingFaceLocalConfig();
  }

  setHuggingFaceLocalConfig(config: HuggingFaceLocalConfig | null): void {
    this.storage.setHuggingFaceLocalConfig(config);
    this.emit('settings.changed', { key: 'huggingFaceLocalConfig', value: config });
  }
}
