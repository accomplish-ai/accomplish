import type { OAuthProviderId } from './connector.js';

export type TaskStatus =
  | 'pending'
  | 'queued'
  | 'running'
  | 'waiting_permission'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'interrupted';

export interface TaskConfig {
  prompt: string;
  taskId?: string;
  workingDirectory?: string;
  allowedTools?: string[];
  systemPromptAppend?: string;
  outputSchema?: object;
  sessionId?: string;
  /** Model ID for display name in progress events */
  modelId?: string;
  /**
   * User-attached files (drag-and-drop or file picker). Ephemeral — paths reference
   * the host filesystem at submission time and are not persisted with the task.
   */
  files?: FileAttachmentInfo[];
}

/** Metadata for a user-attached file in a task. */
export interface FileAttachmentInfo {
  /** Unique identifier for this attachment */
  id: string;
  /** Original filename */
  name: string;
  /** Absolute or working-directory-relative file path */
  path: string;
  /** Categorized file type based on extension */
  type: 'image' | 'text' | 'code' | 'pdf' | 'other';
  /** File size in bytes */
  size: number;
  /** Pre-read file content for text/code files (populated by IPC handler in Electron) */
  content?: string;
}

export interface Task {
  id: string;
  prompt: string;
  summary?: string;
  status: TaskStatus;
  sessionId?: string;
  messages: TaskMessage[];
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  result?: TaskResult;
}

export interface TaskAttachment {
  type: 'screenshot' | 'json';
  data: string;
  label?: string;
}

export interface TaskMessage {
  id: string;
  type: 'assistant' | 'user' | 'tool' | 'system';
  content: string;
  toolName?: string;
  toolInput?: unknown;
  timestamp: string;
  attachments?: TaskAttachment[];
}

export interface TaskPauseAction {
  type: 'oauth-connect';
  providerId: OAuthProviderId;
  label: string;
  pendingLabel?: string;
  successText?: string;
}

export interface TaskResult {
  status: 'success' | 'error' | 'interrupted';
  sessionId?: string;
  durationMs?: number;
  error?: string;
  pauseReason?: 'auth';
  pauseAction?: TaskPauseAction;
}

export type StartupStage =
  | 'starting'
  | 'browser'
  | 'environment'
  | 'loading'
  | 'connecting'
  | 'waiting';

/**
 * Array of all valid startup stage values.
 * Order reflects the typical startup progression.
 * Typed as readonly string[] for easy use with .includes() on string values.
 */
export const STARTUP_STAGES: readonly string[] = [
  'starting',
  'browser',
  'environment',
  'loading',
  'connecting',
  'waiting',
] as const satisfies readonly StartupStage[];

export interface TaskProgress {
  taskId: string;
  stage: 'init' | 'thinking' | 'tool-use' | 'waiting' | 'complete' | 'setup' | StartupStage;
  toolName?: string;
  toolInput?: unknown;
  percentage?: number;
  message?: string;
  modelName?: string;
  isFirstTask?: boolean;
}

export interface TaskUpdateEvent {
  taskId: string;
  type: 'message' | 'progress' | 'complete' | 'error';
  message?: TaskMessage;
  progress?: TaskProgress;
  result?: TaskResult;
  error?: string;
}
