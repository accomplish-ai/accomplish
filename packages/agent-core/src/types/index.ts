/**
 * Public API interfaces for agent-core
 *
 * This module exports all public API interfaces and their related types.
 * Consumers should use factory functions to create instances that implement these interfaces.
 */

// Task Manager API
export type {
  TaskManagerAPI,
  TaskManagerOptions,
  TaskAdapterOptions,
  TaskCallbacks,
  TaskProgressEvent,
} from './task-manager.js';

// Storage API
export type {
  StorageAPI,
  StorageOptions,
  StoredTask,
  AppSettings,
  TaskStorageAPI,
  AppSettingsAPI,
  ProviderSettingsAPI,
  SecureStorageAPI,
  DatabaseLifecycleAPI,
} from './storage.js';

// Permission Handler API
export type {
  PermissionHandlerAPI,
  PermissionHandlerOptions,
  FilePermissionRequestData,
  QuestionRequestData,
  QuestionResponseData,
  PermissionValidationResult,
} from './permission-handler.js';

// Thought Stream API
export type {
  ThoughtStreamAPI,
  ThoughtStreamOptions,
  ThoughtEvent,
  CheckpointEvent,
  ThoughtCategory,
  CheckpointStatus,
} from './thought-stream.js';

// Log Writer API
export type {
  LogWriterAPI,
  LogWriterOptions,
  LogLevel,
  LogSource,
  LogEntry,
} from './log-writer.js';

// Skills Manager API
export type {
  SkillsManagerAPI,
  SkillsManagerOptions,
} from './skills-manager.js';

// Speech Service API
export type {
  SpeechServiceAPI,
  SpeechServiceOptions,
  TranscriptionResult,
  TranscriptionError,
} from './speech.js';
