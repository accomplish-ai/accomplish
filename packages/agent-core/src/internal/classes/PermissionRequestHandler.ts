/**
 * Permission Request Handler
 *
 * Reusable logic for handling permission and question requests.
 * This module manages request state, timeouts, and validation.
 * The Electron-specific parts (IPC, HTTP servers) remain in the desktop app.
 */

import {
  FILE_OPERATIONS,
  PERMISSION_REQUEST_TIMEOUT_MS,
  createFilePermissionRequestId,
  createQuestionRequestId,
} from '../../common/index.js';
import type {
  FileOperation,
  PermissionRequest,
  PermissionOption,
} from '../../common/types/permission.js';

/**
 * Generic pending request interface
 */
export interface PendingRequest<T> {
  resolve: (result: T) => void;
  reject: (error: Error) => void;
  timeoutId: NodeJS.Timeout;
}

/**
 * Validation result for permission request data
 */
export interface PermissionValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Raw file permission request data (from HTTP request body)
 */
export interface FilePermissionRequestData {
  operation?: string;
  filePath?: string;
  filePaths?: string[];
  targetPath?: string;
  contentPreview?: string;
}

/**
 * Raw question request data (from HTTP request body)
 */
export interface QuestionRequestData {
  question?: string;
  header?: string;
  options?: Array<{ label: string; description?: string }>;
  multiSelect?: boolean;
}

/**
 * Question response data
 */
export interface QuestionResponseData {
  selectedOptions?: string[];
  customText?: string;
  denied?: boolean;
}

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

  /**
   * Create a new permission request and wait for response
   * @param timeoutMs - Optional timeout override
   * @returns Promise that resolves when user responds
   */
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

  /**
   * Create a new question request and wait for response
   * @param timeoutMs - Optional timeout override
   * @returns Promise that resolves when user responds
   */
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

  /**
   * Resolve a pending permission request
   * @param requestId - The request ID to resolve
   * @param allowed - Whether permission was granted
   * @returns true if request was found and resolved, false otherwise
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
   * @param requestId - The request ID to resolve
   * @param response - The user's response
   * @returns true if request was found and resolved, false otherwise
   */
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

  /**
   * Validate file permission request data
   * @param data - Raw request data to validate
   * @returns Validation result with error message if invalid
   */
  validateFilePermissionRequest(data: unknown): PermissionValidationResult {
    if (!data || typeof data !== 'object') {
      return { valid: false, error: 'Invalid request data' };
    }

    const requestData = data as FilePermissionRequestData;

    // Check required fields
    if (!requestData.operation) {
      return { valid: false, error: 'operation is required' };
    }

    if (!requestData.filePath && (!requestData.filePaths || requestData.filePaths.length === 0)) {
      return { valid: false, error: 'operation and either filePath or filePaths are required' };
    }

    // Validate operation type
    if (!FILE_OPERATIONS.includes(requestData.operation as FileOperation)) {
      return {
        valid: false,
        error: `Invalid operation. Must be one of: ${FILE_OPERATIONS.join(', ')}`,
      };
    }

    return { valid: true };
  }

  /**
   * Validate question request data
   * @param data - Raw request data to validate
   * @returns Validation result with error message if invalid
   */
  validateQuestionRequest(data: unknown): PermissionValidationResult {
    if (!data || typeof data !== 'object') {
      return { valid: false, error: 'Invalid request data' };
    }

    const requestData = data as QuestionRequestData;

    if (!requestData.question) {
      return { valid: false, error: 'question is required' };
    }

    return { valid: true };
  }

  /**
   * Build a PermissionRequest object for file operations
   * @param requestId - The request ID
   * @param taskId - The associated task ID
   * @param data - The validated request data
   * @returns PermissionRequest object ready to send to the UI
   */
  buildFilePermissionRequest(
    requestId: string,
    taskId: string,
    data: FilePermissionRequestData,
  ): PermissionRequest {
    return {
      id: requestId,
      taskId,
      type: 'file',
      fileOperation: data.operation as FileOperation,
      filePath: data.filePath,
      filePaths: data.filePaths,
      targetPath: data.targetPath,
      contentPreview: data.contentPreview?.substring(0, 500),
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Build a PermissionRequest object for questions
   * @param requestId - The request ID
   * @param taskId - The associated task ID
   * @param data - The validated request data
   * @returns PermissionRequest object ready to send to the UI
   */
  buildQuestionRequest(
    requestId: string,
    taskId: string,
    data: QuestionRequestData,
  ): PermissionRequest {
    return {
      id: requestId,
      taskId,
      type: 'question',
      question: data.question,
      header: data.header,
      options: data.options as PermissionOption[],
      multiSelect: data.multiSelect,
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Check if there are any pending permission requests
   */
  hasPendingPermissions(): boolean {
    return this.pendingPermissions.size > 0;
  }

  /**
   * Check if there are any pending question requests
   */
  hasPendingQuestions(): boolean {
    return this.pendingQuestions.size > 0;
  }

  /**
   * Get the count of pending permission requests
   */
  getPendingPermissionCount(): number {
    return this.pendingPermissions.size;
  }

  /**
   * Get the count of pending question requests
   */
  getPendingQuestionCount(): number {
    return this.pendingQuestions.size;
  }

  /**
   * Clear all pending requests (e.g., on shutdown)
   * Rejects all pending promises with a cancellation error
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
