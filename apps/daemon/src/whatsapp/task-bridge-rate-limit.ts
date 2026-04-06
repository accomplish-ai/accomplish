/**
 * Rate limiting helpers and shared types for TaskBridge.
 * Extracted to keep task-bridge files under 200 lines.
 */

export interface InboundMessage {
  messageId: string;
  senderId: string;
  senderName?: string;
  text: string;
  timestamp: number;
  isGroup: boolean;
  isFromMe: boolean;
}

/** Minimal contract TaskBridge needs from a WhatsApp transport layer. */
export interface MessageTransport {
  on(event: 'message', listener: (msg: InboundMessage) => void): this;
  off(event: 'message', listener: (msg: InboundMessage) => void): this;
  sendMessage(recipientId: string, text: string): Promise<void>;
}

export const RATE_LIMIT_WINDOW_MS = 60_000;
export const RATE_LIMIT_MAX_MESSAGES = 10;
export const GLOBAL_RATE_LIMIT_MAX = 30;
export const MAX_TRACKED_SENDERS = 100;
export const SESSION_IDLE_TIMEOUT_MS = 10 * 60_000; // 10 minutes

export interface SenderSession {
  sessionId: string;
  lastActivity: number;
}

export interface RateLimitState {
  senderTimestamps: Map<string, number[]>;
  globalTimestamps: number[];
}

export function createRateLimitState(): RateLimitState {
  return {
    senderTimestamps: new Map(),
    globalTimestamps: [],
  };
}

export function isRateLimited(state: RateLimitState, senderId: string): boolean {
  const now = Date.now();
  const timestamps = state.senderTimestamps.get(senderId) || [];
  const recent = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  state.senderTimestamps.set(senderId, recent);
  return recent.length >= RATE_LIMIT_MAX_MESSAGES;
}

export function isGlobalRateLimited(state: RateLimitState): boolean {
  const now = Date.now();
  state.globalTimestamps = state.globalTimestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  return state.globalTimestamps.length >= GLOBAL_RATE_LIMIT_MAX;
}

export function recordMessage(state: RateLimitState, senderId: string): void {
  const now = Date.now();
  const timestamps = state.senderTimestamps.get(senderId) || [];
  timestamps.push(now);
  state.senderTimestamps.set(senderId, timestamps);
  state.globalTimestamps.push(now);

  if (state.senderTimestamps.size > MAX_TRACKED_SENDERS) {
    for (const [key, ts] of state.senderTimestamps) {
      if (ts.every((t) => now - t >= RATE_LIMIT_WINDOW_MS)) {
        state.senderTimestamps.delete(key);
      }
    }
  }
}

export function getSessionForSender(
  sessions: Map<string, SenderSession>,
  senderId: string,
): string | null {
  const session = sessions.get(senderId);
  if (!session) {
    return null;
  }
  if (Date.now() - session.lastActivity > SESSION_IDLE_TIMEOUT_MS) {
    sessions.delete(senderId);
    return null;
  }
  return session.sessionId;
}

export function setSessionForSender(
  sessions: Map<string, SenderSession>,
  senderId: string,
  sessionId: string,
): void {
  sessions.set(senderId, { sessionId, lastActivity: Date.now() });
}
