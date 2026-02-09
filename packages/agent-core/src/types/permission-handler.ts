/**
 * Public API interface for PermissionRequestHandler
 * Handles permission requests and question dialogs for tasks.
 */

import type { PermissionRequest, FileOperation } from '../common/types/permission';

/** Data for file permission requests */
export interface FilePermissionRequestData {
  operation?: FileOperation;
  filePath?: string;
  filePaths?: string[];
  targetPath?: string;
  contentPreview?: string;
}

/** Data for question requests */
export interface QuestionRequestData {
  question?: string;
  header?: string;
  options?: Array<{ label: string; description?: string }>;
  multiSelect?: boolean;
}

/** Response data from a question dialog */
export interface QuestionResponseData {
  selectedOptions?: string[];
  customText?: string;
  denied?: boolean;
}

/** Result of validating a permission request */
export interface PermissionValidationResult {
  valid: boolean;
  error?: string;
}

/** Options for creating a PermissionHandler instance */
export interface PermissionHandlerOptions {
  /** Default timeout for permission requests in milliseconds */
  defaultTimeoutMs?: number;
}

/** Public API for permission handling operations */
export interface PermissionHandlerAPI {
  /**
   * Create a new permission request
   * @param timeoutMs - Optional timeout override
   * @returns Request ID and promise that resolves when user responds
   */
  createPermissionRequest(timeoutMs?: number): {
    requestId: string;
    promise: Promise<boolean>;
  };

  /**
   * Create a new question request
   * @param timeoutMs - Optional timeout override
   * @returns Request ID and promise that resolves with user's response
   */
  createQuestionRequest(timeoutMs?: number): {
    requestId: string;
    promise: Promise<QuestionResponseData>;
  };

  /**
   * Resolve a pending permission request
   * @param requestId - ID of the request to resolve
   * @param allowed - Whether permission was granted
   * @returns true if request was found and resolved
   */
  resolvePermissionRequest(requestId: string, allowed: boolean): boolean;

  /**
   * Resolve a pending question request
   * @param requestId - ID of the request to resolve
   * @param response - User's response data
   * @returns true if request was found and resolved
   */
  resolveQuestionRequest(requestId: string, response: QuestionResponseData): boolean;

  /**
   * Validate file permission request data
   * @param data - Data to validate
   * @returns Validation result
   */
  validateFilePermissionRequest(data: unknown): PermissionValidationResult;

  /**
   * Validate question request data
   * @param data - Data to validate
   * @returns Validation result
   */
  validateQuestionRequest(data: unknown): PermissionValidationResult;

  /**
   * Build a file permission request object
   * @param requestId - Unique request ID
   * @param taskId - Associated task ID
   * @param data - File permission data
   * @returns Complete permission request
   */
  buildFilePermissionRequest(
    requestId: string,
    taskId: string,
    data: FilePermissionRequestData
  ): PermissionRequest;

  /**
   * Build a question request object
   * @param requestId - Unique request ID
   * @param taskId - Associated task ID
   * @param data - Question data
   * @returns Complete permission request
   */
  buildQuestionRequest(
    requestId: string,
    taskId: string,
    data: QuestionRequestData
  ): PermissionRequest;

  /**
   * Check if there are any pending permission requests
   */
  hasPendingPermissions(): boolean;

  /**
   * Check if there are any pending question requests
   */
  hasPendingQuestions(): boolean;

  /**
   * Get count of pending permission requests
   */
  getPendingPermissionCount(): number;

  /**
   * Get count of pending question requests
   */
  getPendingQuestionCount(): number;

  /**
   * Clear all pending requests (permissions and questions)
   */
  clearAll(): void;
}
