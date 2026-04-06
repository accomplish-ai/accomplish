/**
 * Permission Request Builders
 *
 * Functions to build PermissionRequest objects from raw request data.
 * Extracted to keep PermissionRequestHandler under the 200-line limit.
 */

import type {
  FileOperation,
  PermissionRequest,
  PermissionOption,
} from '../../common/types/permission.js';
import { FILE_OPERATIONS } from '../../common/index.js';
import type {
  FilePermissionRequestData,
  QuestionRequestData,
  PermissionValidationResult,
} from './permission-request-types.js';

/**
 * Validate file permission request data
 * @param data - Raw request data to validate
 * @returns Validation result with error message if invalid
 */
export function validateFilePermissionRequest(data: unknown): PermissionValidationResult {
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

/**
 * Build a PermissionRequest object for file operations
 * @param requestId - The request ID
 * @param taskId - The associated task ID
 * @param data - The validated request data
 * @returns PermissionRequest object ready to send to the UI
 */
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

/**
 * Build a PermissionRequest object for questions
 * @param requestId - The request ID
 * @param taskId - The associated task ID
 * @param data - The validated request data
 * @returns PermissionRequest object ready to send to the UI
 */
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
