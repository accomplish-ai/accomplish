/**
 * build-config.ts — Reads build.env injected by CI for official Free releases,
 * with `process.env` (populated from `.env` in dev mode) as a fallback.
 *
 * Resolution order (first non-empty wins) per field:
 *   1. `build.env` (CI-injected in packaged Free builds)
 *   2. `process.env` (populated by `dotenv` from `apps/desktop/.env` in dev)
 *   3. Empty default (disables the feature)
 *
 * This lets OSS devs and users point analytics / Sentry / the gateway at their
 * own SaaS without having to simulate a CI build.env. All fields remain optional —
 * community/OSS builds with neither source still run in no-op mode.
 *
 * Values are parsed into a local object — they're deliberately not pushed back
 * into process.env here. (dotenv already populated process.env on startup; we
 * just read from it.) Child processes spawned by the app get whatever PATH/env
 * we pass them explicitly, so build-time secrets don't auto-leak.
 *
 * Call loadBuildConfig() once at startup (in index.ts, after dotenv .env load).
 * Then use getBuildConfig() anywhere to access the cached values.
 */

import { parse as dotenvParse } from 'dotenv';
import { execSync } from 'child_process';
import { z } from 'zod';
import { app } from 'electron';
import path from 'path';
import fs from 'fs';

const buildConfigSchema = z.object({
  buildEnvVersion: z.string().default(''),
  mixpanelToken: z.string().default(''),
  gaApiSecret: z.string().default(''),
  gaMeasurementId: z.string().default(''),
  sentryDsn: z.string().default(''),
  accomplishGatewayUrl: z.string().default(''),
  buildId: z.string().default(''),
  accomplishUpdaterUrl: z.string().default(''),
});

export type BuildConfig = z.infer<typeof buildConfigSchema>;

let cachedConfig: BuildConfig | null = null;

/**
 * Return the first non-empty string, or empty string if all are empty/undefined.
 * Treats undefined, null, and '' as "absent"; anything else is returned as-is.
 */
function firstNonEmpty(...values: Array<string | undefined>): string {
  for (const value of values) {
    if (value && value.length > 0) {
      return value;
    }
  }
  return '';
}

/**
 * Load build.env from the appropriate path, falling back to process.env.
 * - Packaged: process.resourcesPath/build.env
 * - Dev: APP_ROOT/build.env (APP_ROOT = apps/desktop, set in index.ts)
 *
 * Values are parsed into a local object — NOT injected into process.env.
 * (dotenv in index.ts already populates process.env from apps/desktop/.env.)
 *
 * Silently returns empty defaults if file is absent AND env vars are unset.
 * Never throws.
 */
export function loadBuildConfig(): BuildConfig {
  if (cachedConfig) return cachedConfig;

  const buildEnvPath = app.isPackaged
    ? path.join(process.resourcesPath, 'build.env')
    : path.join(process.env.APP_ROOT || '', 'build.env');

  // Parse build.env into a local object — do NOT use dotenvConfig() which mutates
  // process.env. (process.env was already populated by the .env load in index.ts.)
  let raw: Record<string, string> = {};
  let loadedFromFile = false;
  try {
    const content = fs.readFileSync(buildEnvPath, 'utf8');
    raw = dotenvParse(content);
    loadedFromFile = true;
  } catch {
    // File absent — expected for OSS builds and dev mode without a local build.env
  }

  // Precedence: build.env (if present) wins, then process.env, then empty default.
  // Rationale: CI-injected Free-build tokens should always beat any stale dev env vars.
  const parsed = buildConfigSchema.safeParse({
    buildEnvVersion: firstNonEmpty(raw.BUILD_ENV_VERSION, process.env.BUILD_ENV_VERSION),
    mixpanelToken: firstNonEmpty(raw.MIXPANEL_TOKEN, process.env.MIXPANEL_TOKEN),
    gaApiSecret: firstNonEmpty(raw.GA_API_SECRET, process.env.GA_API_SECRET),
    gaMeasurementId: firstNonEmpty(raw.GA_MEASUREMENT_ID, process.env.GA_MEASUREMENT_ID),
    sentryDsn: firstNonEmpty(raw.SENTRY_DSN, process.env.SENTRY_DSN),
    accomplishGatewayUrl: firstNonEmpty(
      raw.ACCOMPLISH_GATEWAY_URL,
      process.env.ACCOMPLISH_GATEWAY_URL,
    ),
    buildId: firstNonEmpty(raw.ACCOMPLISH_BUILD_ID, process.env.ACCOMPLISH_BUILD_ID),
    // The updater spawns an installer at elevated privilege on some platforms. A rogue
    // URL is a code-execution risk (unlike analytics tokens that only send data). In
    // packaged builds we require build.env as the source — process.env is dev-only.
    accomplishUpdaterUrl: firstNonEmpty(
      raw.ACCOMPLISH_UPDATER_URL,
      app.isPackaged ? undefined : process.env.ACCOMPLISH_UPDATER_URL,
    ),
  });

  if (!parsed.success) {
    // Should never happen — all fields default to empty string.
    console.warn('[BuildConfig] Validation failed, using empty defaults:', parsed.error.message);
    cachedConfig = buildConfigSchema.parse({});
  } else {
    cachedConfig = parsed.data;
  }

  if (cachedConfig.buildEnvVersion) {
    const source = loadedFromFile && raw.BUILD_ENV_VERSION ? 'build.env' : 'process.env';
    console.log(
      `[BuildConfig] Loaded build config (buildEnvVersion=${cachedConfig.buildEnvVersion}, source=${source})`,
    );
  } else if (
    cachedConfig.mixpanelToken ||
    cachedConfig.gaApiSecret ||
    cachedConfig.sentryDsn ||
    cachedConfig.accomplishGatewayUrl ||
    cachedConfig.accomplishUpdaterUrl
  ) {
    console.log('[BuildConfig] Loaded build config from process.env (dev / custom fallback)');
  } else {
    console.log('[BuildConfig] No build.env or env vars found — running in OSS mode');
  }

  return cachedConfig;
}

/**
 * Get the cached build config. Must call loadBuildConfig() first.
 * Returns empty defaults if loadBuildConfig() was never called.
 */
export function getBuildConfig(): BuildConfig {
  if (!cachedConfig) {
    return loadBuildConfig();
  }
  return cachedConfig;
}

/** True when the gateway URL is configured — Free tier is available. */
export function isFreeMode(): boolean {
  return !!getBuildConfig().accomplishGatewayUrl;
}

/** True when an updater feed URL is configured — auto-updater is available.
 *  In packaged builds this requires build.env (process.env fallback is dev-only). */
export function isAutoUpdaterEnabled(): boolean {
  return !!getBuildConfig().accomplishUpdaterUrl;
}

/** True when any analytics or error-tracking service is configured. */
export function isAnalyticsEnabled(): boolean {
  const bc = getBuildConfig();
  return !!(bc.mixpanelToken || bc.gaApiSecret || bc.sentryDsn);
}

/** Returns 'lite' when build.env is present (Free/signed build), 'oss' otherwise.
 *  Uses 'lite' to maintain continuity with existing Mixpanel data from
 *  the commercial repo's Free tier (which also used 'lite'). */
export function getAppTier(): 'lite' | 'oss' {
  return getBuildConfig().buildEnvVersion ? 'lite' : 'oss';
}

/**
 * Get the build identity for daemon version-guard.
 *
 * Used to detect stale daemons after app upgrades. The identity changes
 * with every different build, ensuring the new app restarts the daemon.
 *
 * Priority:
 * 1. Packaged builds: ACCOMPLISH_BUILD_ID from build.env (injected by release pipeline)
 * 2. Dev builds: git commit SHA (changes with every committed change / git pull).
 *    NOTE: does not detect uncommitted edits or stale daemon artifacts from
 *    bundled-input changes — developers must rebuild the daemon explicitly.
 * 3. Fallback: app version (weakest, but covers basic version upgrades)
 */
let cachedBuildId: string | null = null;

export function getBuildId(): string {
  if (cachedBuildId) return cachedBuildId;

  // 1. From build.env (packaged Free builds)
  const fromBuildEnv = getBuildConfig().buildId;
  if (fromBuildEnv) {
    cachedBuildId = fromBuildEnv;
    return cachedBuildId;
  }

  // 2. Git commit SHA (dev builds)
  try {
    cachedBuildId = execSync('git rev-parse --short HEAD', {
      encoding: 'utf8',
      stdio: 'pipe',
    }).trim();
    return cachedBuildId;
  } catch {
    // Not in a git repo or git not available
  }

  // 3. Fallback: app version
  cachedBuildId = app.getVersion();
  return cachedBuildId;
}
