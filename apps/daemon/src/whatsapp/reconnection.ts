/**
 * reconnection — exponential-backoff reconnect scheduler for WhatsAppService.
 *
 * Extracted from WhatsAppService for modularity.
 */

import { log } from '../logger.js';

export const MAX_RECONNECT_ATTEMPTS = 5;
export const INITIAL_RECONNECT_DELAY_MS = 2000;

export interface ReconnectState {
  attempts: number;
  scheduled: boolean;
  timer: ReturnType<typeof setTimeout> | null;
}

export function createReconnectState(): ReconnectState {
  return { attempts: 0, scheduled: false, timer: null };
}

export function clearReconnectTimer(state: ReconnectState): void {
  if (state.timer) {
    clearTimeout(state.timer);
    state.timer = null;
  }
}

/**
 * Schedule a reconnect attempt with exponential backoff.
 *
 * @param state   Mutable reconnect state object
 * @param onConnect  Async function to call when the timer fires
 * @param onMaxReached  Called when MAX_RECONNECT_ATTEMPTS is exceeded
 */
export function scheduleReconnect(
  state: ReconnectState,
  onConnect: () => Promise<void>,
  onMaxReached: () => void,
): void {
  if (state.scheduled) {
    return;
  }

  if (state.attempts >= MAX_RECONNECT_ATTEMPTS) {
    log.warn('[WhatsApp] Max reconnect attempts reached');
    onMaxReached();
    return;
  }

  state.attempts++;
  state.scheduled = true;

  const delay = INITIAL_RECONNECT_DELAY_MS * Math.pow(2, state.attempts - 1);
  log.warn(
    `[WhatsApp] Reconnecting in ${delay}ms (attempt ${state.attempts}/${MAX_RECONNECT_ATTEMPTS})`,
  );

  clearReconnectTimer(state);
  state.timer = setTimeout(() => {
    state.scheduled = false;
    onConnect().catch((err) => log.error('[WhatsApp] Reconnect failed:', err));
  }, delay);
}
