/**
 * analytics-service.ts — GA4 Measurement Protocol analytics + device fingerprint caching.
 *
 * No-ops gracefully when GA4 is not configured (OSS builds).
 * Also manages client ID, session ID, and device fingerprint state used by
 * both GA4 and Mixpanel (initialized independently of either sink).
 *
 * Ported from accomplish-commercial-fork with:
 * - Hardcoded GA_MEASUREMENT_ID removed — read from build config
 * - Hardcoded GA_API_SECRET removed — read from build config
 * - __APP_TIER__ removed — uses getAppTier() from build-config
 * - Device fingerprint uses identity/device-fingerprint.ts (not analytics/)
 */

import { app, net } from 'electron';
import Store from 'electron-store';
import { randomUUID } from 'crypto';
import { getBuildConfig } from '../config/build-config';
import { computeDeviceFingerprint } from '../identity/device-fingerprint';

// ── GA4 helpers ──────────────────────────────────────────────────────

function getGaMeasurementId(): string {
  return getBuildConfig().gaMeasurementId;
}

function getGaApiSecret(): string {
  return getBuildConfig().gaApiSecret;
}

function isDebugMode(): boolean {
  return process.env.GA_DEBUG_MODE === '1' || process.env.GA_DEBUG_MODE === 'true';
}

function getEndpoint(): string {
  return `https://www.google-analytics.com/mp/collect?measurement_id=${getGaMeasurementId()}&api_secret=${getGaApiSecret()}`;
}

// ── Types ────────────────────────────────────────────────────────────

interface AnalyticsConfigSchema {
  clientId: string;
  deviceFingerprint: string;
  firstSeenAt: string;
  firstLaunchVersion: string;
  firstTaskCompleted: boolean;
}

export interface EventParams {
  [key: string]: string | number | boolean | undefined;
}

interface EventMetadata {
  app_version: string;
  environment: string;
  platform: string;
  arch: string;
  session_id: number;
  trace_session_id: string;
  engagement_time_msec: number;
  os_name: string;
  os_version: string;
  timezone: string;
  user_id: string;
  plan_type: string;
  deployment_type: string;
  org_id: string;
  user_role: string;
  electron_user_agent: string;
  browser_user_agent?: string;
  first_app_version: string;
}

interface GA4Event {
  name: string;
  params: EventParams & Partial<EventMetadata>;
}

interface GA4Payload {
  client_id: string;
  user_properties?: Record<string, { value: string | number }>;
  events: GA4Event[];
}

// ── Lazy store ───────────────────────────────────────────────────────

let _analyticsStore: Store<AnalyticsConfigSchema> | null = null;

function getAnalyticsStore(): Store<AnalyticsConfigSchema> {
  if (!_analyticsStore) {
    _analyticsStore = new Store<AnalyticsConfigSchema>({
      name: 'analytics',
      defaults: {
        clientId: '',
        deviceFingerprint: '',
        firstSeenAt: '',
        firstLaunchVersion: '',
        firstTaskCompleted: false,
      },
    });
  }
  return _analyticsStore;
}

// ── Session state ────────────────────────────────────────────────────

let sessionId: string = '';
let numericSessionId: number = 0;
let sessionStartTime: number = 0;
let sessionTaskCount: number = 0;

// Offline event queue
const eventQueue: GA4Event[] = [];
let isOnline: boolean = true;

// ── Init ─────────────────────────────────────────────────────────────

/**
 * Initialize core analytics state: client ID, session IDs, fingerprint cache.
 * Call once at startup when any analytics/Sentry feature is enabled.
 * Does NOT depend on GA4 or Mixpanel being configured — initializes shared state.
 */
export function initAnalytics(): { isFirstLaunch: boolean } {
  let clientId = getAnalyticsStore().get('clientId');
  const isFirstLaunch = !clientId;
  if (!clientId) {
    clientId = randomUUID();
    getAnalyticsStore().set('clientId', clientId);
    getAnalyticsStore().set('firstSeenAt', new Date().toISOString());
    getAnalyticsStore().set('firstLaunchVersion', app.getVersion());
  }

  // Backfill for users who upgraded from before firstLaunchVersion was tracked
  if (!getAnalyticsStore().get('firstLaunchVersion')) {
    getAnalyticsStore().set('firstLaunchVersion', app.getVersion());
  }

  sessionId = randomUUID();
  numericSessionId = Date.now();
  sessionStartTime = Date.now();
  sessionTaskCount = 0;

  console.log('[Analytics] Initialized with client ID:', clientId.substring(0, 8) + '...');
  console.log('[Analytics] Session ID:', sessionId.substring(0, 8) + '...');
  console.log('[Analytics] Environment:', app.isPackaged ? 'production' : 'dev');
  if (isDebugMode()) {
    console.log('[Analytics] Debug mode enabled — events sent to GA4 DebugView');
  }

  return { isFirstLaunch };
}

/**
 * Compute and cache the device fingerprint.
 * Call once after initAnalytics() during startup.
 */
export function initDeviceFingerprint(): void {
  const cached = getAnalyticsStore().get('deviceFingerprint');
  if (cached) {
    console.log(
      '[Analytics] Device fingerprint loaded from cache:',
      cached.substring(0, 8) + '...',
    );
    return;
  }

  const fingerprint = computeDeviceFingerprint();
  if (fingerprint) {
    getAnalyticsStore().set('deviceFingerprint', fingerprint);
    console.log('[Analytics] Device fingerprint computed:', fingerprint.substring(0, 8) + '...');
  } else {
    console.warn('[Analytics] Device fingerprint computation failed, will fall back to clientId');
  }
}

// ── Getters ──────────────────────────────────────────────────────────

export function getDeviceFingerprint(): string {
  return getAnalyticsStore().get('deviceFingerprint') || getAnalyticsStore().get('clientId');
}

export function getClientId(): string {
  return getAnalyticsStore().get('clientId');
}

export function getAnalyticsSessionId(): string {
  return sessionId;
}

export function getFirstSeenAt(): string {
  return getAnalyticsStore().get('firstSeenAt') || '';
}

export function getFirstLaunchVersion(): string {
  return getAnalyticsStore().get('firstLaunchVersion') || '';
}

export function isFirstTaskCompleted(): boolean {
  return getAnalyticsStore().get('firstTaskCompleted');
}

export function markFirstTaskCompleted(): void {
  getAnalyticsStore().set('firstTaskCompleted', true);
}

export function incrementTaskCount(): void {
  sessionTaskCount++;
}

export function getSessionTaskCount(): number {
  return sessionTaskCount;
}

export function getSessionDuration(): number {
  return Math.floor((Date.now() - sessionStartTime) / 1000);
}

// ── GA4 send ─────────────────────────────────────────────────────────

function isGA4Configured(): boolean {
  return !!(getAnalyticsStore().get('clientId') && getGaApiSecret() && getGaMeasurementId());
}

// Lazy-cached reference to break circular dependency:
// analytics-service → tracking-context → analytics-service
// The dynamic import() runs once on first GA4 event, well after both modules are loaded.
let _buildCommonTrackingFields: (() => Record<string, unknown>) | null = null;

async function getMetadata(): Promise<EventMetadata> {
  if (!_buildCommonTrackingFields) {
    const mod = await import('../utils/tracking-context');
    _buildCommonTrackingFields = mod.buildCommonTrackingFields;
  }
  const {
    ga_session_id: _sessionUuid,
    ga_client_id: _clientId,
    first_launched_at: _firstLaunched,
    ...common
  } = _buildCommonTrackingFields();
  return {
    ...(common as Omit<EventMetadata, 'session_id' | 'trace_session_id' | 'engagement_time_msec'>),
    session_id: numericSessionId,
    trace_session_id: sessionId,
    engagement_time_msec: 100,
  };
}

async function sendToGA4(events: GA4Event[]): Promise<boolean> {
  const clientId = getAnalyticsStore().get('clientId');
  if (!clientId) {
    console.warn('[Analytics] No client ID, skipping send');
    return false;
  }

  const apiSecret = getGaApiSecret();
  if (!apiSecret) {
    console.warn('[Analytics] No API secret configured, skipping send');
    return false;
  }

  const payload: GA4Payload = {
    client_id: clientId,
    user_properties: {
      first_seen_at: { value: getAnalyticsStore().get('firstSeenAt') || '' },
    },
    events,
  };

  try {
    const jsonBody = JSON.stringify(payload);
    const response = await net.fetch(getEndpoint(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: jsonBody,
    });

    if (!response.ok) {
      console.error('[Analytics] GA4 request failed:', response.status, response.statusText);
      return false;
    }

    return true;
  } catch (error) {
    console.error('[Analytics] Failed to send events:', error);
    return false;
  }
}

// ── Event tracking ───────────────────────────────────────────────────

async function flushEventQueue(): Promise<void> {
  if (eventQueue.length === 0) return;

  const events = [...eventQueue];
  eventQueue.length = 0;

  const success = await sendToGA4(events);
  if (!success) {
    eventQueue.push(...events);
  } else {
    console.log(`[Analytics] Flushed ${events.length} queued events`);
  }
}

/**
 * Track an analytics event to GA4 (and Mixpanel via trackMixpanelEvent).
 */
export async function trackEvent(eventName: string, params: EventParams = {}): Promise<void> {
  try {
    // Mixpanel tracking — imported lazily to avoid circular deps
    try {
      const { trackMixpanelEvent } = await import('./mixpanel-service');
      trackMixpanelEvent(eventName, params);
    } catch {
      // Mixpanel not initialized — no-op
    }

    if (!isGA4Configured()) return;

    const metadata = await getMetadata();

    const event: GA4Event = {
      name: eventName,
      params: {
        ...params,
        ...metadata,
        ...(isDebugMode() ? { debug_mode: true } : {}),
      },
    };

    if (!isOnline) {
      eventQueue.push(event);
      console.log(`[Analytics] Queued event (offline): ${eventName}`);
      return;
    }

    const success = await sendToGA4([event]);
    if (!success) {
      eventQueue.push(event);
      console.log(`[Analytics] Queued event (send failed): ${eventName}`);
    } else {
      console.log(`[Analytics] Sent event: ${eventName}`);
    }
  } catch (error) {
    console.error(`[Analytics] Failed to track event "${eventName}":`, error);
  }
}

export function setOnlineStatus(online: boolean): void {
  const wasOffline = !isOnline;
  isOnline = online;

  if (online && wasOffline) {
    flushEventQueue();
  }
}

/**
 * Flush any pending GA4 events (call on app quit — best effort).
 */
export function flushAnalytics(): void {
  if (eventQueue.length > 0) {
    console.log(`[Analytics] Attempting to flush ${eventQueue.length} events on quit`);
    sendToGA4([...eventQueue]).catch((err) => {
      console.error('[Analytics] Failed to flush on quit:', err);
    });
  }
}
