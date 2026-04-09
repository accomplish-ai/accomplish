/**
 * tracking-context.ts — Common tracking fields shared between GA4 and Mixpanel.
 *
 * Ported from accomplish-commercial-fork with enterprise code removed:
 * - __APP_TIER__ replaced with getAppTier() from build-config
 * - org_id and user_role hardcoded to defaults (no enterprise identity)
 */

import * as os from 'os';
import { app, session } from 'electron';
import {
  getClientId,
  getAnalyticsSessionId,
  getFirstSeenAt,
  getFirstLaunchVersion,
  getDeviceFingerprint,
} from '../analytics/analytics-service';
import { getAppTier } from '../config/build-config';

// Lazy-cached Electron (Chromium) user agent — captured once
let _electronUserAgent: string | null = null;

function getElectronUserAgent(): string {
  if (_electronUserAgent === null) {
    _electronUserAgent = session.defaultSession.getUserAgent();
  }
  return _electronUserAgent;
}

// Browser user agent — set when first browser tool call provides it
let _browserUserAgent: string | null = null;

export function setBrowserUserAgent(ua: string): void {
  _browserUserAgent = ua;
}

export function getBrowserUserAgent(): string | null {
  return _browserUserAgent;
}

function getReadableOsName(): string {
  switch (process.platform) {
    case 'darwin':
      return 'macOS';
    case 'win32':
      return 'Windows';
    case 'linux':
      return 'Linux';
    default:
      return process.platform;
  }
}

/**
 * Common tracking fields shared between trace steps and GA events.
 */
export function buildCommonTrackingFields() {
  return {
    platform: process.platform as string,
    app_version: app.getVersion(),
    ga_session_id: getAnalyticsSessionId(),
    environment: (app.isPackaged ? 'production' : 'dev') as string,
    user_id: getDeviceFingerprint(),
    ga_client_id: getClientId(),
    arch: process.arch as string,
    os_name: getReadableOsName(),
    os_version: os.release(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    plan_type: getAppTier(),
    deployment_type: 'saas',
    org_id: 'none',
    user_role: 'user',
    electron_user_agent: getElectronUserAgent(),
    browser_user_agent: _browserUserAgent || undefined,
    first_launched_at: getFirstSeenAt(),
    first_app_version: getFirstLaunchVersion(),
  };
}
