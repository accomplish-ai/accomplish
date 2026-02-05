import type { PermissionRequest, PermissionResponse, TaskMessage, TaskProgress, TaskResult } from '@accomplish/shared';

export interface PlatformConfig {
  userDataPath: string;
  tempPath: string;
  isPackaged: boolean;
  resourcesPath?: string;
  appPath?: string;
  platform: NodeJS.Platform;
  arch: string;
}

export interface PermissionHandler {
  requestPermission(request: PermissionRequest): Promise<PermissionResponse>;
}

export interface TaskEventHandler {
  onMessage(taskId: string, message: TaskMessage): void;
  onProgress(taskId: string, progress: TaskProgress): void;
  onToolUse(taskId: string, toolName: string, toolInput: unknown): void;
  onComplete(taskId: string, result: TaskResult): void;
  onError(taskId: string, error: Error): void;
  onCancelled(taskId: string): void;
}

export interface StorageConfig {
  databasePath: string;
  secureStoragePath: string;
}

export interface CliResolverConfig {
  isPackaged: boolean;
  resourcesPath?: string;
  appPath?: string;
}

export interface ResolvedCliPaths {
  cliPath: string;
  cliDir: string;
  source: 'bundled' | 'local' | 'global';
}

export interface BundledNodePaths {
  nodePath: string;
  npmPath: string;
  npxPath: string;
  binDir: string;
}

