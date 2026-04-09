/**
 * TaskBridge — routes incoming WhatsApp messages to Accomplish task creation.
 *
 * Contributed by aryan877 (PR #595 feat/whatsapp-integration).
 * - Rate-limiting (per-sender and global)
 * - Self-chat-only access control via ownerJid/ownerLid
 * - Session continuity across conversations
 * - Prompt injection protection (sanitizeString)
 */
import { sanitizeString } from '@accomplish_ai/agent-core';
import { log } from '../logger.js';
import {
  type InboundMessage,
  type MessageTransport,
  type SenderSession,
  type RateLimitState,
  createRateLimitState,
  isRateLimited,
  isGlobalRateLimited,
  recordMessage,
  getSessionForSender,
  setSessionForSender,
} from './task-bridge-rate-limit.js';

export type { InboundMessage, MessageTransport };

export const MAX_MESSAGE_LENGTH = 4096;

/**
 * Check whether a JID is in LID (linked-identity) format.
 * Inline implementation to avoid importing the entire Baileys package
 * in a module that may be loaded before Baileys is installed.
 */
function isLidUser(jid: string): boolean {
  return jid.endsWith('@lid');
}

export class TaskBridge {
  private rateLimitState: RateLimitState = createRateLimitState();
  private activeTasks = new Map<string, string>();
  private senderSessions = new Map<string, SenderSession>();
  /** Per-sender message queue for messages that arrive while a task is running. */
  private pendingMessages = new Map<string, InboundMessage[]>();
  private transport: MessageTransport;
  private onTaskRequest: (
    senderId: string,
    senderName: string | undefined,
    text: string,
    messageId: string,
    timestamp: number,
  ) => Promise<void>;
  private messageHandler: (msg: InboundMessage) => void;
  private ownerJid: string | null = null;
  private ownerLid: string | null = null;
  private enabled = true;

  constructor(
    transport: MessageTransport,
    onTaskRequest: (
      senderId: string,
      senderName: string | undefined,
      text: string,
      messageId: string,
      timestamp: number,
    ) => Promise<void>,
  ) {
    this.transport = transport;
    this.onTaskRequest = onTaskRequest;

    this.messageHandler = (msg) => {
      this.handleMessage(msg).catch((err) => {
        log.error('[TaskBridge] Error handling message:', err);
      });
    };
    this.transport.on('message', this.messageHandler);
  }

  setOwnerJid(jid: string): void {
    this.ownerJid = jid;
  }
  getOwnerJid(): string | null {
    return this.ownerJid;
  }
  setOwnerLid(lid: string): void {
    this.ownerLid = lid;
  }
  getOwnerLid(): string | null {
    return this.ownerLid;
  }
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  hasActiveTask(senderId: string): boolean {
    return this.activeTasks.has(senderId);
  }

  setActiveTask(senderId: string, taskId: string): void {
    this.activeTasks.set(senderId, taskId);
  }

  clearActiveTask(senderId: string): void {
    this.activeTasks.delete(senderId);

    // Process next queued message for this sender (if any).
    // Handles offline batches where multiple messages arrived while a task was running.
    const queue = this.pendingMessages.get(senderId);
    if (queue && queue.length > 0) {
      const next = queue.shift()!;
      if (queue.length === 0) {
        this.pendingMessages.delete(senderId);
      }
      // Re-enter handleMessage for the queued message
      this.handleMessage(next).catch((err) => {
        log.error('[TaskBridge] Error processing queued message:', err);
      });
    }
  }

  setSessionForSender(senderId: string, sessionId: string): void {
    setSessionForSender(this.senderSessions, senderId, sessionId);
  }

  getSessionForSender(senderId: string): string | null {
    return getSessionForSender(this.senderSessions, senderId);
  }

  private async handleMessage(msg: InboundMessage): Promise<void> {
    if (!this.enabled) {
      return;
    }
    if (msg.isGroup) {
      return;
    }

    // Self-only access control (fail-closed): only accept self-chat messages.
    // WhatsApp uses two identity formats: JID (phone@s.whatsapp.net) and
    // LID (linked-identity@lid). Self-chat messages arrive in LID format,
    // so we compare the sender against whichever format matches.
    if (!this.ownerJid && !this.ownerLid) {
      return;
    }

    const senderMatchesOwner = isLidUser(msg.senderId)
      ? msg.senderId === this.ownerLid
      : msg.senderId === this.ownerJid;
    const isSelfChat = msg.isFromMe && senderMatchesOwner;
    if (!isSelfChat) {
      return;
    }

    if (isGlobalRateLimited(this.rateLimitState)) {
      return;
    }

    if (isRateLimited(this.rateLimitState, msg.senderId)) {
      await this.transport
        .sendMessage(msg.senderId, 'You are sending messages too quickly. Please wait a moment.')
        .catch(() => {});
      return;
    }

    recordMessage(this.rateLimitState, msg.senderId);

    if (msg.text.length > MAX_MESSAGE_LENGTH) {
      await this.transport
        .sendMessage(
          msg.senderId,
          `Message too long. Please keep messages under ${MAX_MESSAGE_LENGTH} characters.`,
        )
        .catch(() => {});
      return;
    }

    let sanitizedText: string;
    try {
      sanitizedText = sanitizeString(msg.text, 'whatsappMessage', MAX_MESSAGE_LENGTH);
    } catch {
      await this.transport
        .sendMessage(
          msg.senderId,
          'Could not process your message. Please try again with plain text.',
        )
        .catch(() => {});
      return;
    }

    if (this.hasActiveTask(msg.senderId)) {
      // Queue the message instead of dropping it — process when current task completes.
      // This handles offline message batches where multiple messages arrive at once.
      const queue = this.pendingMessages.get(msg.senderId) ?? [];
      queue.push(msg);
      this.pendingMessages.set(msg.senderId, queue);
      return;
    }

    // Sanitize senderName before locking the sender as active, so a throw here
    // does not leave the sender stuck behind the "previous task is still running" guard
    const safeSenderName = msg.senderName
      ? sanitizeString(msg.senderName, 'senderName', 128)
      : undefined;

    // Mark task as active immediately to prevent duplicates before onTaskRequest resolves
    this.setActiveTask(msg.senderId, 'pending');

    try {
      await this.onTaskRequest(
        msg.senderId,
        safeSenderName,
        sanitizedText,
        msg.messageId,
        msg.timestamp,
      );
    } catch (err) {
      log.error('[TaskBridge] Failed to create task:', err);
      this.clearActiveTask(msg.senderId);
      await this.transport
        .sendMessage(
          msg.senderId,
          'Sorry, I could not process your request. Please try again later.',
        )
        .catch(() => {});
    }
  }

  dispose(): void {
    this.transport.off('message', this.messageHandler);
    this.rateLimitState.senderTimestamps.clear();
    this.rateLimitState.globalTimestamps = [];
    this.activeTasks.clear();
    this.senderSessions.clear();
    this.pendingMessages.clear();
  }
}
