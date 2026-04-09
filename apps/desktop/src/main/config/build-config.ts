/**
 * build-config.ts — Reads build.env injected by CI for official Free releases.
 *
 * Community/OSS builds don't have this file. All consumers must handle
 * empty-string defaults gracefully (no-op when absent).
 *
 * Call loadBuildConfig() once at startup (in index.ts, after dotenv .env load).
 * Then use getBuildConfig() anywhere to access the cached values.
 */

import { parse as dotenvParse } from 'dotenv';
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
});

export type BuildConfig = z.infer<typeof buildConfigSchema>;

let cachedConfig: BuildConfig | null = null;

/**
 * Load build.env from the appropriate path.
 * - Packaged: process.resourcesPath/build.env
 * - Dev: APP_ROOT/build.env (APP_ROOT = apps/desktop, set in index.ts)
 *
 * Values are parsed into a local object — NOT injected into process.env.
 * This prevents build secrets from leaking into child processes (daemon, OpenCode).
 *
 * Silently returns empty defaults if file is absent. Never throws.
 */
export function loadBuildConfig(): BuildConfig {
  if (cachedConfig) return cachedConfig;

  const buildEnvPath = app.isPackaged
    ? path.join(process.resourcesPath, 'build.env')
    : path.join(process.env.APP_ROOT || '', 'build.env');

  // Parse into a local object — do NOT use dotenvConfig() which mutates process.env.
  let raw: Record<string, string> = {};
  try {
    const content = fs.readFileSync(buildEnvPath, 'utf8');
    raw = dotenvParse(content);
  } catch {
    // File absent — expected for OSS builds
  }

  const parsed = buildConfigSchema.safeParse({
    buildEnvVersion: raw.BUILD_ENV_VERSION,
    mixpanelToken: raw.MIXPANEL_TOKEN,
    gaApiSecret: raw.GA_API_SECRET,
    gaMeasurementId: raw.GA_MEASUREMENT_ID,
    sentryDsn: raw.SENTRY_DSN,
    accomplishGatewayUrl: raw.ACCOMPLISH_GATEWAY_URL,
  });

  if (!parsed.success) {
    // Should never happen — all fields default to empty string.
    console.warn('[BuildConfig] Validation failed, using empty defaults:', parsed.error.message);
    cachedConfig = buildConfigSchema.parse({});
  } else {
    cachedConfig = parsed.data;
  }

  if (cachedConfig.buildEnvVersion) {
    console.log('[BuildConfig] Loaded build.env version:', cachedConfig.buildEnvVersion);
  } else {
    console.log('[BuildConfig] No build.env found — running in OSS mode');
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

/** True when any analytics or error-tracking service is configured. */
export function isAnalyticsEnabled(): boolean {
  const bc = getBuildConfig();
  return !!(bc.mixpanelToken || bc.gaApiSecret || bc.sentryDsn);
}

/** Returns 'free' when build.env is present, 'oss' otherwise. */
export function getAppTier(): 'free' | 'oss' {
  return getBuildConfig().buildEnvVersion ? 'free' : 'oss';
}
