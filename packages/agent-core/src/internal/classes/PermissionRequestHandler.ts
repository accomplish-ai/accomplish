/**
 * Permission Request Handler
 *
 * Reusable logic for handling permission and question requests.
 * This module manages request state, timeouts, and validation.
 * The Electron-specific parts (IPC, HTTP servers) remain in the desktop app.
 */

import { PERMISSION_REQUEST_TIMEOUT_MS } from '../../common/index.js';
import {
  createPendingPermissionRequest,
  createPendingQuestionRequest,
  validateFilePermissionRequest,
  validateQuestionRequest,
  buildFilePermissionRequest,
  buildQuestionRequest,
} from './permission-request-state.js';
import type { PendingRequest } from './permission-request-state.js';

export type {
  PendingRequest,
  PermissionValidationResult,
  FilePermissionRequestData,
  QuestionRequestData,
  QuestionResponseData,
} from './permission-request-state.js';

export {
  validateFilePermissionRequest,
  validateQuestionRequest,
} from './permission-request-state.js';

/**
 * Handles permission and question request lifecycle.
 * Manages pending requests, timeouts, and validation.
 */
export class PermissionRequestHandler {
  private pendingPermissions = new Map<string, PendingRequest<boolean>>();
  private pendingQuestions = new Map<
    string,
    PendingRequest<{ selectedOptions?: string[]; customText?: string; denied?: boolean }>
  >();
  private defaultTimeoutMs: number;

  constructor(timeoutMs: number = PERMISSION_REQUEST_TIMEOUT_MS) {
    this.defaultTimeoutMs = timeoutMs;
  }

  /**
   * Create a new permission request and wait for response
   */
  createPermissionRequest(timeoutMs?: number): { requestId: string; promise: Promise<boolean> } {
    const timeout = timeoutMs ?? this.defaultTimeoutMs;
    const { requestId, pending, promise } = createPendingPermissionRequest(timeout, (id) => {
      this.pendingPermissions.delete(id);
    });
    this.pendingPermissions.set(requestId, pending);
    return { requestId, promise };
  }

  /**
   * Create a new question request and wait for response
   */
  createQuestionRequest(timeoutMs?: number): {
    requestId: string;
    promise: Promise<{ selectedOptions?: string[]; customText?: string; denied?: boolean }>;
  } {
    const timeout = timeoutMs ?? this.defaultTimeoutMs;
    const { requestId, pending, promise } = createPendingQuestionRequest(timeout, (id) => {
      this.pendingQuestions.delete(id);
    });
    this.pendingQuestions.set(requestId, pending);
    return { requestId, promise };
  }

  /**
   * Resolve a pending permission request
   */
  resolvePermissionRequest(requestId: string, allowed: boolean): boolean {
    const pending = this.pendingPermissions.get(requestId);
    if (!pending) {
      return false;
    }
    clearTimeout(pending.timeoutId);
    pending.resolve(allowed);
    this.pendingPermissions.delete(requestId);
    return true;
  }

  /**
   * Resolve a pending question request
   */
  resolveQuestionRequest(
    requestId: string,
    response: { selectedOptions?: string[]; customText?: string; denied?: boolean },
  ): boolean {
    const pending = this.pendingQuestions.get(requestId);
    if (!pending) {
      return false;
    }
    clearTimeout(pending.timeoutId);
    pending.resolve(response);
    this.pendingQuestions.delete(requestId);
    return true;
  }

  /**
   * Validate file permission request data
   */
  validateFilePermissionRequest = validateFilePermissionRequest;

  /**
   * Validate question request data
   */
  validateQuestionRequest = validateQuestionRequest;

  /**
   * Build a PermissionRequest object for file operations
   */
  buildFilePermissionRequest = buildFilePermissionRequest;

  /**
   * Build a PermissionRequest object for questions
   */
  buildQuestionRequest = buildQuestionRequest;

  hasPendingPermissions(): boolean {
    return this.pendingPermissions.size > 0;
  }

  hasPendingQuestions(): boolean {
    return this.pendingQuestions.size > 0;
  }

  getPendingPermissionCount(): number {
    return this.pendingPermissions.size;
  }

  getPendingQuestionCount(): number {
    return this.pendingQuestions.size;
  }

  /**
   * Clear all pending requests (e.g., on shutdown)
   */
  clearAll(): void {
    for (const [_requestId, pending] of this.pendingPermissions) {
      clearTimeout(pending.timeoutId);
      pending.reject(new Error('Request cancelled'));
    }
    this.pendingPermissions.clear();

    for (const [_requestId, pending] of this.pendingQuestions) {
      clearTimeout(pending.timeoutId);
      pending.reject(new Error('Request cancelled'));
    }
    this.pendingQuestions.clear();
  }
}
