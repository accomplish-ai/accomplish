import { FILE_PERMISSION_REQUEST_PREFIX, QUESTION_REQUEST_PREFIX } from '../types/permission.js';

export function createTaskId(): string {
  return `task_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function createMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function createFilePermissionRequestId(): string {
  return `${FILE_PERMISSION_REQUEST_PREFIX}${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

export function createQuestionRequestId(): string {
  return `${QUESTION_REQUEST_PREFIX}${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

export function isFilePermissionRequest(requestId: string): boolean {
  return requestId.startsWith(FILE_PERMISSION_REQUEST_PREFIX);
}

export function isQuestionRequest(requestId: string): boolean {
  return requestId.startsWith(QUESTION_REQUEST_PREFIX);
}
