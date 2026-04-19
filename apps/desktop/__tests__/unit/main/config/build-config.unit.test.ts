/**
 * Unit tests for loadBuildConfig() — verifies precedence between
 * the CI-injected build.env file and process.env (populated by
 * dotenv from apps/desktop/.env in dev mode).
 *
 * @module __tests__/unit/main/config/build-config.unit.test
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Mock electron.app — packaged vs. dev controls which file path is resolved.
const mockApp = {
  isPackaged: false,
};

vi.mock('electron', () => ({
  app: mockApp,
}));

// Every variable the loader consumes — saved in beforeEach so tests stay isolated.
const MANAGED_ENV_KEYS = [
  'BUILD_ENV_VERSION',
  'MIXPANEL_TOKEN',
  'GA_API_SECRET',
  'GA_MEASUREMENT_ID',
  'SENTRY_DSN',
  'ACCOMPLISH_GATEWAY_URL',
  'ACCOMPLISH_BUILD_ID',
  'ACCOMPLISH_UPDATER_URL',
  'APP_ROOT',
] as const;

describe('loadBuildConfig() — build.env and process.env resolution', () => {
  let tempDir: string;
  let buildEnvPath: string;
  let originalEnv: Record<string, string | undefined>;
  let originalResourcesPath: string | undefined;

  beforeEach(() => {
    // Fresh temp dir per test → acts as the APP_ROOT where build.env lives.
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'accomplish-build-config-'));
    buildEnvPath = path.join(tempDir, 'build.env');

    // Snapshot + clear the env vars the loader looks at, so tests control both sources.
    originalEnv = {};
    for (const key of MANAGED_ENV_KEYS) {
      originalEnv[key] = process.env[key];
      delete process.env[key];
    }
    process.env.APP_ROOT = tempDir;

    // Snapshot + clear process.resourcesPath. Only packaged tests set it; keep dev tests clean.
    originalResourcesPath = (process as { resourcesPath?: string }).resourcesPath;
    delete (process as { resourcesPath?: string }).resourcesPath;

    mockApp.isPackaged = false;

    // Reset module-level cachedConfig between tests.
    vi.resetModules();
  });

  afterEach(() => {
    // Restore original env vars verbatim (including undefined → delete).
    for (const key of MANAGED_ENV_KEYS) {
      const saved = originalEnv[key];
      if (saved === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = saved;
      }
    }
    if (originalResourcesPath === undefined) {
      delete (process as { resourcesPath?: string }).resourcesPath;
    } else {
      (process as { resourcesPath?: string }).resourcesPath = originalResourcesPath;
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  async function loadFresh() {
    // Re-import after vi.resetModules() so cachedConfig starts null.
    const mod = await import('@main/config/build-config');
    return mod.loadBuildConfig();
  }

  describe('neither source set', () => {
    it('returns empty defaults (pure OSS mode)', async () => {
      const cfg = await loadFresh();
      expect(cfg.mixpanelToken).toBe('');
      expect(cfg.sentryDsn).toBe('');
      expect(cfg.gaApiSecret).toBe('');
      expect(cfg.gaMeasurementId).toBe('');
      expect(cfg.accomplishGatewayUrl).toBe('');
      expect(cfg.buildEnvVersion).toBe('');
      expect(cfg.buildId).toBe('');
    });

    it('isAnalyticsEnabled() returns false', async () => {
      await loadFresh();
      const { isAnalyticsEnabled } = await import('@main/config/build-config');
      expect(isAnalyticsEnabled()).toBe(false);
    });

    it('isFreeMode() returns false', async () => {
      await loadFresh();
      const { isFreeMode } = await import('@main/config/build-config');
      expect(isFreeMode()).toBe(false);
    });
  });

  describe('only process.env set (OSS dev configuring their own SaaS)', () => {
    it('reads Mixpanel token from process.env', async () => {
      process.env.MIXPANEL_TOKEN = 'dev-mixpanel-token';
      const cfg = await loadFresh();
      expect(cfg.mixpanelToken).toBe('dev-mixpanel-token');
    });

    it('reads all analytics vars from process.env', async () => {
      process.env.MIXPANEL_TOKEN = 'env-mix';
      process.env.GA_API_SECRET = 'env-ga-secret';
      process.env.GA_MEASUREMENT_ID = 'G-ENV123';
      process.env.SENTRY_DSN = 'https://env.sentry.io/dsn';

      const cfg = await loadFresh();
      expect(cfg.mixpanelToken).toBe('env-mix');
      expect(cfg.gaApiSecret).toBe('env-ga-secret');
      expect(cfg.gaMeasurementId).toBe('G-ENV123');
      expect(cfg.sentryDsn).toBe('https://env.sentry.io/dsn');
    });

    it('reads gateway URL from process.env (enables Free mode in dev)', async () => {
      process.env.ACCOMPLISH_GATEWAY_URL = 'https://dev.gateway.example.com';
      const cfg = await loadFresh();
      expect(cfg.accomplishGatewayUrl).toBe('https://dev.gateway.example.com');
      const { isFreeMode } = await import('@main/config/build-config');
      expect(isFreeMode()).toBe(true);
    });

    it('isAnalyticsEnabled() returns true when any analytics var is set via env', async () => {
      process.env.SENTRY_DSN = 'https://env.sentry.io/dsn';
      await loadFresh();
      const { isAnalyticsEnabled } = await import('@main/config/build-config');
      expect(isAnalyticsEnabled()).toBe(true);
    });
  });

  describe('only build.env set (packaged Free build)', () => {
    it('reads values from build.env when no process.env fallback exists', async () => {
      fs.writeFileSync(
        buildEnvPath,
        [
          'BUILD_ENV_VERSION=1',
          'MIXPANEL_TOKEN=ci-mixpanel',
          'SENTRY_DSN=https://ci.sentry.io/dsn',
          'ACCOMPLISH_GATEWAY_URL=https://gateway.accomplish.ai',
        ].join('\n'),
      );

      const cfg = await loadFresh();
      expect(cfg.buildEnvVersion).toBe('1');
      expect(cfg.mixpanelToken).toBe('ci-mixpanel');
      expect(cfg.sentryDsn).toBe('https://ci.sentry.io/dsn');
      expect(cfg.accomplishGatewayUrl).toBe('https://gateway.accomplish.ai');
    });
  });

  describe('both sources set (precedence)', () => {
    it('build.env takes precedence over process.env per field', async () => {
      fs.writeFileSync(
        buildEnvPath,
        ['MIXPANEL_TOKEN=from-build-env', 'SENTRY_DSN=https://build-env.sentry.io/dsn'].join('\n'),
      );
      process.env.MIXPANEL_TOKEN = 'from-process-env';
      process.env.SENTRY_DSN = 'https://process-env.sentry.io/dsn';

      const cfg = await loadFresh();
      expect(cfg.mixpanelToken).toBe('from-build-env');
      expect(cfg.sentryDsn).toBe('https://build-env.sentry.io/dsn');
    });

    it('process.env fills gaps when build.env omits specific fields', async () => {
      // build.env has only Mixpanel; .env has Sentry. Both should show up.
      fs.writeFileSync(buildEnvPath, 'MIXPANEL_TOKEN=build-env-mix\n');
      process.env.SENTRY_DSN = 'https://env.sentry.io/dsn';
      process.env.GA_API_SECRET = 'env-ga';

      const cfg = await loadFresh();
      expect(cfg.mixpanelToken).toBe('build-env-mix'); // from build.env
      expect(cfg.sentryDsn).toBe('https://env.sentry.io/dsn'); // from process.env
      expect(cfg.gaApiSecret).toBe('env-ga'); // from process.env
    });

    it('empty string in build.env is treated as absent (falls back to process.env)', async () => {
      // Degenerate build.env with empty value — process.env should win.
      fs.writeFileSync(buildEnvPath, 'MIXPANEL_TOKEN=\n');
      process.env.MIXPANEL_TOKEN = 'env-wins';

      const cfg = await loadFresh();
      expect(cfg.mixpanelToken).toBe('env-wins');
    });
  });

  describe('getBuildId() fallback chain', () => {
    it('prefers build.env ACCOMPLISH_BUILD_ID when present', async () => {
      fs.writeFileSync(buildEnvPath, 'ACCOMPLISH_BUILD_ID=ci-build-abc123\n');
      await loadFresh();
      const { getBuildId } = await import('@main/config/build-config');
      expect(getBuildId()).toBe('ci-build-abc123');
    });

    it('falls back to process.env ACCOMPLISH_BUILD_ID when build.env lacks it', async () => {
      // build.env exists but has no BUILD_ID; env var should be picked up.
      fs.writeFileSync(buildEnvPath, 'MIXPANEL_TOKEN=anything\n');
      process.env.ACCOMPLISH_BUILD_ID = 'env-build-xyz789';
      await loadFresh();
      const { getBuildId } = await import('@main/config/build-config');
      expect(getBuildId()).toBe('env-build-xyz789');
    });
  });

  describe('auto-updater gate (ACCOMPLISH_UPDATER_URL)', () => {
    it('default (neither source): isAutoUpdaterEnabled() returns false', async () => {
      const cfg = await loadFresh();
      expect(cfg.accomplishUpdaterUrl).toBe('');
      const { isAutoUpdaterEnabled } = await import('@main/config/build-config');
      expect(isAutoUpdaterEnabled()).toBe(false);
    });

    it('dev mode + process.env set: isAutoUpdaterEnabled() returns true (dev opt-in)', async () => {
      process.env.ACCOMPLISH_UPDATER_URL = 'https://d.accomplish.ai';
      mockApp.isPackaged = false;
      const cfg = await loadFresh();
      expect(cfg.accomplishUpdaterUrl).toBe('https://d.accomplish.ai');
      const { isAutoUpdaterEnabled } = await import('@main/config/build-config');
      expect(isAutoUpdaterEnabled()).toBe(true);
    });

    it('packaged mode + only process.env set: isAutoUpdaterEnabled() returns false (security invariant)', async () => {
      // Packaged OSS binaries must NOT honor a runtime ACCOMPLISH_UPDATER_URL env var —
      // the updater spawns an installer and a rogue URL would be RCE.
      process.env.ACCOMPLISH_UPDATER_URL = 'https://evil.example.com';
      mockApp.isPackaged = true;
      (process as { resourcesPath?: string }).resourcesPath = tempDir;
      const cfg = await loadFresh();
      expect(cfg.accomplishUpdaterUrl).toBe('');
      const { isAutoUpdaterEnabled } = await import('@main/config/build-config');
      expect(isAutoUpdaterEnabled()).toBe(false);
    });

    it('packaged mode + build.env set: isAutoUpdaterEnabled() returns true (Free CI build)', async () => {
      fs.writeFileSync(buildEnvPath, 'ACCOMPLISH_UPDATER_URL=https://d.accomplish.ai\n');
      mockApp.isPackaged = true;
      (process as { resourcesPath?: string }).resourcesPath = tempDir;
      const cfg = await loadFresh();
      expect(cfg.accomplishUpdaterUrl).toBe('https://d.accomplish.ai');
      const { isAutoUpdaterEnabled } = await import('@main/config/build-config');
      expect(isAutoUpdaterEnabled()).toBe(true);
    });

    it('both sources set (dev): build.env takes precedence', async () => {
      fs.writeFileSync(buildEnvPath, 'ACCOMPLISH_UPDATER_URL=https://from-build-env.example.com\n');
      process.env.ACCOMPLISH_UPDATER_URL = 'https://from-process-env.example.com';
      mockApp.isPackaged = false;
      const cfg = await loadFresh();
      expect(cfg.accomplishUpdaterUrl).toBe('https://from-build-env.example.com');
    });

    it('empty build.env value (dev): falls back to process.env', async () => {
      fs.writeFileSync(buildEnvPath, 'ACCOMPLISH_UPDATER_URL=\n');
      process.env.ACCOMPLISH_UPDATER_URL = 'https://env-wins.example.com';
      mockApp.isPackaged = false;
      const cfg = await loadFresh();
      expect(cfg.accomplishUpdaterUrl).toBe('https://env-wins.example.com');
    });
  });
});
