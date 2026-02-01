import { app } from 'electron';
import Store from 'electron-store';
import { randomUUID } from 'crypto';

// GA4 Configuration
const GA_MEASUREMENT_ID = 'G-RQWHYJ5NEG';

// Read API secret lazily (after dotenv loads) rather than at module import time
function getApiSecret(): string {
  return process.env.GA_API_SECRET || '';
}

function getEndpoint(): string {
  return `https://www.google-analytics.com/mp/collect?measurement_id=${GA_MEASUREMENT_ID}&api_secret=${getApiSecret()}`;
}

/**
 * Analytics configuration persisted across app launches
 */
interface AnalyticsConfigSchema {
  clientId: string;
  firstSeenAt: string;
  firstTaskCompleted: boolean;
}

/**
 * Event parameters that can be sent with any event
 */
export interface EventParams {
  [key: string]: string | number | boolean | undefined;
}

/**
 * Metadata automatically attached to all events
 */
interface EventMetadata {
  app_version: string;
  environment: 'dev' | 'production';
  platform: string;
  arch: string;
  session_id: string;
  engagement_time_msec: number;
}

/**
 * GA4 Measurement Protocol event payload
 */
interface GA4Event {
  name: string;
  params: EventParams & Partial<EventMetadata>;
}

/**
 * GA4 Measurement Protocol request body
 */
interface GA4Payload {
  client_id: string;
  events: GA4Event[];
}

// Lazy initialization to ensure app.setPath('userData') has been called
let _analyticsStore: Store<AnalyticsConfigSchema> | null = null;

function getAnalyticsStore(): Store<AnalyticsConfigSchema> {
  if (!_analyticsStore) {
    _analyticsStore = new Store<AnalyticsConfigSchema>({
      name: 'analytics',
      defaults: {
        clientId: '',
        firstSeenAt: '',
        firstTaskCompleted: false,
      },
    });
  }
  return _analyticsStore;
}

// Session-scoped values (reset each app launch)
let sessionId: string = '';
let sessionStartTime: number = 0;
let sessionTaskCount: number = 0;

// Offline event queue
const eventQueue: GA4Event[] = [];
let isOnline: boolean = true;

/**
 * Initialize the analytics service
 * Call this once when the app starts
 */
export function initAnalytics(): void {
  // Generate or retrieve client ID
  let clientId = getAnalyticsStore().get('clientId');
  if (!clientId) {
    clientId = randomUUID();
    getAnalyticsStore().set('clientId', clientId);
    getAnalyticsStore().set('firstSeenAt', new Date().toISOString());
  }

  // Generate new session ID for this app launch
  sessionId = randomUUID();
  sessionStartTime = Date.now();
  sessionTaskCount = 0;

  console.log('[Analytics] Initialized with client ID:', clientId.substring(0, 8) + '...');
  console.log('[Analytics] Session ID:', sessionId.substring(0, 8) + '...');
  console.log('[Analytics] Environment:', app.isPackaged ? 'production' : 'dev');
}

/**
 * Get the current metadata to attach to events
 */
function getMetadata(): EventMetadata {
  return {
    app_version: app.getVersion(),
    environment: app.isPackaged ? 'production' : 'dev',
    platform: process.platform,
    arch: process.arch,
    session_id: sessionId,
    engagement_time_msec: 100, // Required by GA4, minimum value
  };
}

/**
 * Send events to GA4 Measurement Protocol
 */
async function sendToGA4(events: GA4Event[]): Promise<boolean> {
  const clientId = getAnalyticsStore().get('clientId');
  if (!clientId) {
    console.warn('[Analytics] No client ID, skipping send');
    return false;
  }

  const apiSecret = getApiSecret();
  if (!apiSecret) {
    console.warn('[Analytics] No API secret configured, skipping send');
    return false;
  }

  const payload: GA4Payload = {
    client_id: clientId,
    events,
  };

  try {
    const response = await fetch(getEndpoint(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
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

/**
 * Flush the offline event queue
 */
async function flushEventQueue(): Promise<void> {
  if (eventQueue.length === 0) return;

  const events = [...eventQueue];
  eventQueue.length = 0;

  const success = await sendToGA4(events);
  if (!success) {
    // Put events back in queue if send failed
    eventQueue.push(...events);
  } else {
    console.log(`[Analytics] Flushed ${events.length} queued events`);
  }
}

/**
 * Track an analytics event
 * @param eventName - The event name (e.g., 'submit_task')
 * @param params - Optional event-specific parameters
 */
export async function trackEvent(
  eventName: string,
  params: EventParams = {}
): Promise<void> {
  const metadata = getMetadata();

  const event: GA4Event = {
    name: eventName,
    params: {
      ...params,
      ...metadata,
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
}

/**
 * Set online/offline status
 */
export function setOnlineStatus(online: boolean): void {
  const wasOffline = !isOnline;
  isOnline = online;

  if (online && wasOffline) {
    // Came back online, flush queue
    flushEventQueue();
  }
}

/**
 * Increment session task count
 */
export function incrementTaskCount(): void {
  sessionTaskCount++;
}

/**
 * Get session task count
 */
export function getSessionTaskCount(): number {
  return sessionTaskCount;
}

/**
 * Get session duration in seconds
 */
export function getSessionDuration(): number {
  return Math.floor((Date.now() - sessionStartTime) / 1000);
}

/**
 * Check if this is the user's first completed task
 */
export function isFirstTaskCompleted(): boolean {
  return getAnalyticsStore().get('firstTaskCompleted');
}

/**
 * Mark first task as completed
 */
export function markFirstTaskCompleted(): void {
  getAnalyticsStore().set('firstTaskCompleted', true);
}

/**
 * Flush any pending events (call on app quit)
 */
export function flushAnalytics(): void {
  if (eventQueue.length > 0) {
    // Synchronous flush attempt on quit - best effort
    console.log(`[Analytics] Attempting to flush ${eventQueue.length} events on quit`);
    sendToGA4([...eventQueue]).catch((err) => {
      console.error('[Analytics] Failed to flush on quit:', err);
    });
  }
}
