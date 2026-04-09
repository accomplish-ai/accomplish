/**
 * Permission Request Handler
 *
 * Reusable logic for handling permission and question requests.
 * This module manages request state, timeouts, and validation.
 * The Electron-specific parts (IPC, HTTP servers) remain in the desktop app.
 */

import { PERMISSION_REQUEST_TIMEOUT_MS } from '../common/index.js';
import {
  type PendingRequest,
  type PermissionValidationResult,
  type FilePermissionRequestData,
  type QuestionRequestData,
  type QuestionResponseData,
  createFilePermissionRequestId,
  createQuestionRequestId,
  validateFilePermissionRequest,
  validateQuestionRequest,
  buildFilePermissionRequest,
  buildQuestionRequest,
} from './permission-handler-utils.js';
import type { PermissionRequest } from '../common/types/permission.js';

export type {
  PendingRequest,
  PermissionValidationResult,
  FilePermissionRequestData,
  QuestionRequestData,
  QuestionResponseData,
} from './permission-handler-utils.js';

/**
 * Handles permission and question request lifecycle.
 * Manages pending requests, timeouts, and validation.
 */
export class PermissionRequestHandler {
  private pendingPermissions = new Map<string, PendingRequest<boolean>>();
  private pendingQuestions = new Map<string, PendingRequest<QuestionResponseData>>();
  private defaultTimeoutMs: number;

  constructor(timeoutMs: number = PERMISSION_REQUEST_TIMEOUT_MS) {
    this.defaultTimeoutMs = timeoutMs;
  }

  /** Create a new permission request and wait for response */
  createPermissionRequest(timeoutMs?: number): { requestId: string; promise: Promise<boolean> } {
    const requestId = createFilePermissionRequestId();
    const timeout = timeoutMs ?? this.defaultTimeoutMs;

    const promise = new Promise<boolean>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingPermissions.delete(requestId);
        reject(new Error('Permission request timed out'));
      }, timeout);

      this.pendingPermissions.set(requestId, { resolve, reject, timeoutId });
    });

    return { requestId, promise };
  }

  /** Create a new question request and wait for response */
  createQuestionRequest(timeoutMs?: number): {
    requestId: string;
    promise: Promise<QuestionResponseData>;
  } {
    const requestId = createQuestionRequestId();
    const timeout = timeoutMs ?? this.defaultTimeoutMs;

    const promise = new Promise<QuestionResponseData>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingQuestions.delete(requestId);
        reject(new Error('Question request timed out'));
      }, timeout);

      this.pendingQuestions.set(requestId, { resolve, reject, timeoutId });
    });

    return { requestId, promise };
  }

  /** Resolve a pending permission request. Returns true if found and resolved. */
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

  /** Resolve a pending question request. Returns true if found and resolved. */
  resolveQuestionRequest(requestId: string, response: QuestionResponseData): boolean {
    const pending = this.pendingQuestions.get(requestId);
    if (!pending) {
      return false;
    }

    clearTimeout(pending.timeoutId);
    pending.resolve(response);
    this.pendingQuestions.delete(requestId);
    return true;
  }

  /** Validate file permission request data */
  validateFilePermissionRequest(data: unknown): PermissionValidationResult {
    return validateFilePermissionRequest(data);
  }

  /** Validate question request data */
  validateQuestionRequest(data: unknown): PermissionValidationResult {
    return validateQuestionRequest(data);
  }

  /** Build a PermissionRequest object for file operations */
  buildFilePermissionRequest(
    requestId: string,
    taskId: string,
    data: FilePermissionRequestData,
  ): PermissionRequest {
    return buildFilePermissionRequest(requestId, taskId, data);
  }

  /** Build a PermissionRequest object for questions */
  buildQuestionRequest(
    requestId: string,
    taskId: string,
    data: QuestionRequestData,
  ): PermissionRequest {
    return buildQuestionRequest(requestId, taskId, data);
  }

  /** Check if there are any pending permission requests */
  hasPendingPermissions(): boolean {
    return this.pendingPermissions.size > 0;
  }

  /** Check if there are any pending question requests */
  hasPendingQuestions(): boolean {
    return this.pendingQuestions.size > 0;
  }

  /** Get the count of pending permission requests */
  getPendingPermissionCount(): number {
    return this.pendingPermissions.size;
  }

  /** Get the count of pending question requests */
  getPendingQuestionCount(): number {
    return this.pendingQuestions.size;
  }

  /** Clear all pending requests (e.g., on shutdown). Rejects all pending promises. */
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
