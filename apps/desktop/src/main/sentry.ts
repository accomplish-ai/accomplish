/**
 * sentry.ts — Initializes Sentry error tracking for the Electron main process.
 *
 * No-ops gracefully when SENTRY_DSN is not configured (OSS builds).
 * Attaches device fingerprint as user ID and scrubs sensitive data.
 *
 * Ported from accomplish-commercial-fork with enterprise code removed:
 * - No __APP_TIER__ compile-time constant (uses getAppTier() from build-config)
 * - No gateway correlation (Phase 2 — will be added when gateway proxy is ported)
 */

import * as Sentry from '@sentry/electron/main';
import { app } from 'electron';
import { computeDeviceFingerprint } from './identity/device-fingerprint';
import { getAppTier, getBuildConfig } from './config/build-config';
import { scrubBreadcrumb, scrubEvent } from './sentry-scrub';

export function initSentry(): void {
  const dsn = getBuildConfig().sentryDsn;
  if (!dsn) return;

  try {
    const tier = getAppTier();

    Sentry.init({
      dsn,
      release: app.getVersion(),
      dist: `desktop-main-${tier}`,
      environment: app.isPackaged ? 'production' : 'development',
      beforeSend: (event) => scrubEvent(event),
      beforeBreadcrumb: scrubBreadcrumb,
    });

    Sentry.setTag('appTier', tier);
    Sentry.setTag('arch', process.arch);
    Sentry.setTag('platform', process.platform);
    Sentry.setTag('electronVersion', process.versions.electron);

    const deviceId = computeDeviceFingerprint();
    if (deviceId) {
      Sentry.setTag('deviceId', deviceId);
      Sentry.setUser({ id: deviceId });
    }
  } catch (e) {
    console.error('Sentry initialization failed, continuing without error tracking:', e);
  }
}
