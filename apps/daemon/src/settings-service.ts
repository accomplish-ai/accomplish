/**
 * SettingsService — wraps `AppSettingsAPI` + `ProviderSettingsAPI` + a couple
 * of auxiliary stores (HuggingFace Local config, Accomplish AI credits cache).
 *
 * Milestone 2 of the daemon-only-SQLite migration
 * (plan: /Users/yanai/.claude/plans/squishy-exploring-hamster.md).
 *
 * Emits `settings.changed` on every write. The payload type lives in
 * `@accomplish_ai/agent-core` (`common/types/daemon.ts`) so both daemon and
 * client side agree on the shape — the daemon wires that into
 * `rpc.notify('settings.changed', payload)` and main forwards it to the
 * renderer to patch its cache.
 *
 * The `getAll` snapshot covers everything the renderer needs to render the
 * first frame on M5's daemon-first startup (theme, language, debug, provider
 * config, plus the fields `AppSettings` does not bundle: notifications,
 * close-behavior, sandbox / cloud-browser / messaging configs).
 */
import { EventEmitter } from 'node:events';
import type { StorageAPI } from '@accomplish_ai/agent-core';
import type {
  ConnectedProvider,
  HuggingFaceLocalConfig,
  ProviderId,
  ProviderSettings,
  SettingsChangePayload,
  SettingsSnapshot,
} from '@accomplish_ai/agent-core';
import type { ThemePreference, LanguagePreference } from '@accomplish_ai/agent-core';
import type { CreditUsage } from '@accomplish_ai/agent-core';
import type { SandboxConfig } from '@accomplish_ai/agent-core';

/**
 * Event name — subscribe via `service.on(SETTINGS_CHANGED, listener)`. We
 * intentionally do NOT use `declare interface` + class merging here
 * (forbidden by `@typescript-eslint/no-unsafe-declaration-merging`); the
 * string constant keeps callers honest and the payload type
 * (`SettingsChangePayload`, imported from agent-core) is the source of truth.
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
      notificationsEnabled: this.storage.getNotificationsEnabled(),
      closeBehavior: this.storage.getCloseBehavior(),
      sandboxConfig: this.storage.getSandboxConfig(),
      cloudBrowserConfig: this.storage.getCloudBrowserConfig(),
      messagingConfig: this.storage.getMessagingConfig(),
    };
  }

  // ─── App-level settings — writers ───────────────────────────────────────

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

  setSandboxConfig(config: SandboxConfig): void {
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

  // ─── App-level settings — on-demand getters ─────────────────────────────
  //
  // `getAll()` already covers the startup read, but the renderer has a few
  // surfaces that re-read these independently (notifications toggle, close-
  // behavior picker, sandbox config UI). Exposing individual getters avoids
  // having to fetch the whole snapshot for a single field and keeps M3's
  // repointing of those handlers a one-line change.

  getNotificationsEnabled(): boolean {
    return this.storage.getNotificationsEnabled();
  }

  getCloseBehavior(): 'keep-daemon' | 'stop-daemon' {
    return this.storage.getCloseBehavior();
  }

  getSandboxConfig(): SandboxConfig {
    return this.storage.getSandboxConfig();
  }

  getCloudBrowserConfig(): ReturnType<StorageAPI['getCloudBrowserConfig']> {
    return this.storage.getCloudBrowserConfig();
  }

  getMessagingConfig(): ReturnType<StorageAPI['getMessagingConfig']> {
    return this.storage.getMessagingConfig();
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

  getAccomplishAiCredits(): CreditUsage | null {
    return this.storage.getAccomplishAiCredits();
  }

  saveAccomplishAiCredits(usage: CreditUsage): void {
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

// Re-export the shared payload types so daemon-routes.ts can keep its
// existing import path. Single source of truth stays in agent-core.
export type { SettingsChangePayload, SettingsSnapshot };
