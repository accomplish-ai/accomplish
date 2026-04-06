/**
 * Permission Request State Helpers
 *
 * Pure state/type helpers for permission and question request lifecycle.
 * Used by PermissionRequestHandler to manage pending requests and validation.
 */

import {
  FILE_OPERATIONS,
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

export function createPendingPermissionRequest(
  timeout: number,
  onTimeout: (requestId: string) => void,
): { requestId: string; pending: PendingRequest<boolean>; promise: Promise<boolean> } {
  const requestId = createFilePermissionRequestId();
  let pendingRef: PendingRequest<boolean>;

  const promise = new Promise<boolean>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      onTimeout(requestId);
      reject(new Error('Permission request timed out'));
    }, timeout);
    pendingRef = { resolve, reject, timeoutId };
  });

  return { requestId, pending: pendingRef!, promise };
}

export function createPendingQuestionRequest(
  timeout: number,
  onTimeout: (requestId: string) => void,
): {
  requestId: string;
  pending: PendingRequest<QuestionResponseData>;
  promise: Promise<QuestionResponseData>;
} {
  const requestId = createQuestionRequestId();
  let pendingRef: PendingRequest<QuestionResponseData>;

  const promise = new Promise<QuestionResponseData>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      onTimeout(requestId);
      reject(new Error('Question request timed out'));
    }, timeout);
    pendingRef = { resolve, reject, timeoutId };
  });

  return { requestId, pending: pendingRef!, promise };
}

export function validateFilePermissionRequest(data: unknown): PermissionValidationResult {
  if (!data || typeof data !== 'object') {
    return { valid: false, error: 'Invalid request data' };
  }

  const requestData = data as FilePermissionRequestData;

  if (!requestData.operation) {
    return { valid: false, error: 'operation is required' };
  }

  if (!requestData.filePath && (!requestData.filePaths || requestData.filePaths.length === 0)) {
    return { valid: false, error: 'operation and either filePath or filePaths are required' };
  }

  if (!FILE_OPERATIONS.includes(requestData.operation as FileOperation)) {
    return {
      valid: false,
      error: `Invalid operation. Must be one of: ${FILE_OPERATIONS.join(', ')}`,
    };
  }

  return { valid: true };
}

export function validateQuestionRequest(data: unknown): PermissionValidationResult {
  if (!data || typeof data !== 'object') {
    return { valid: false, error: 'Invalid request data' };
  }

  const requestData = data as QuestionRequestData;

  if (!requestData.question) {
    return { valid: false, error: 'question is required' };
  }

  return { valid: true };
}

export function buildFilePermissionRequest(
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

export function buildQuestionRequest(
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
