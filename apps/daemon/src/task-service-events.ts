/**
 * Event type declarations for TaskService.
 * Extracted from task-service.ts to keep files under 200 lines.
 */
import type { TaskMessage, TaskStatus } from '@accomplish_ai/agent-core';

export interface TaskServiceEvents {
  progress: [data: { taskId: string; stage: string; message?: string }];
  message: [data: { taskId: string; messages: TaskMessage[] }];
  complete: [data: { taskId: string }];
  error: [data: { taskId: string; error: string }];
  permission: [data: unknown];
  statusChange: [data: { taskId: string; status: TaskStatus }];
  summary: [data: { taskId: string; summary: string }];
}

export interface TaskServiceOptions {
  userDataPath: string;
  mcpToolsPath: string;
  isPackaged?: boolean;
  resourcesPath?: string;
  appPath?: string;
}
