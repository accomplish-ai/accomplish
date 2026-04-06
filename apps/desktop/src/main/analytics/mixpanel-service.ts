/**
 * mixpanel-service.ts — Mixpanel event tracking.
 *
 * No-ops gracefully when MIXPANEL_TOKEN is not configured (OSS builds).
 *
 * Ported from accomplish-commercial-fork with:
 * - Hardcoded MIXPANEL_TOKEN removed — read from build config
 */

import Mixpanel from 'mixpanel';
import { getDeviceFingerprint, getFirstSeenAt } from './analytics-service';
import { buildCommonTrackingFields } from '../utils/tracking-context';
import { getBuildConfig } from '../config/build-config';
import type { EventParams } from './analytics-service';

let mixpanelClient: Mixpanel.Mixpanel | null = null;

/**
 * Initialize Mixpanel client and identify the user.
 * Call once after initAnalytics() so getClientId() returns a value.
 * No-ops if MIXPANEL_TOKEN is not configured.
 */
export function initMixpanel(): void {
  const token = getBuildConfig().mixpanelToken;
  if (!token) return;

  mixpanelClient = Mixpanel.init(token, { geolocate: true });

  const distinctId = getDeviceFingerprint();
  const common = buildCommonTrackingFields();
  const firstSeen = getFirstSeenAt();

  mixpanelClient.people.set(distinctId, {
    $distinct_id: distinctId,
    $user_id: distinctId,
    $os: common.os_name,
    $created: firstSeen || undefined,
    first_seen_at: firstSeen || undefined,
    ga_client_id: common.ga_client_id,
    app_version: common.app_version,
    first_app_version: common.first_app_version,
    platform: common.platform,
    os_name: common.os_name,
    plan_type: common.plan_type,
  });

  console.log('[Mixpanel] Initialized with distinct_id:', distinctId.substring(0, 8) + '...');
}

/**
 * Track an event to Mixpanel with the same shape as GA4 events.
 * No-ops silently if initMixpanel() hasn't been called yet.
 */
export function trackMixpanelEvent(eventName: string, params: EventParams = {}): void {
  try {
    if (!mixpanelClient) return;

    const common = buildCommonTrackingFields();
    const distinctId = getDeviceFingerprint();

    const properties: Record<string, string | number | boolean> = {
      distinct_id: distinctId,
      ga_client_id: common.ga_client_id,
      $os: common.os_name,
      $os_version: common.os_version,
    };

    for (const [key, value] of Object.entries({ ...params, ...common })) {
      if (value !== undefined) {
        properties[key] = value;
      }
    }

    // Replace GA4 user_id with Mixpanel's $user_id so events are marked as "identified"
    delete properties.user_id;
    properties.$user_id = distinctId;

    mixpanelClient.track(eventName, properties);
  } catch (error) {
    console.error(`[Mixpanel] Failed to track event "${eventName}":`, error);
  }
}

/**
 * Flush pending Mixpanel events (call on app quit).
 * The Node SDK sends events immediately per track() call in the default config.
 * This function exists for API symmetry with flushAnalytics().
 */
export function flushMixpanel(): void {
  // Mixpanel Node SDK does not expose a flush/close method.
  // Events are sent immediately per track() call in the default config.
}
