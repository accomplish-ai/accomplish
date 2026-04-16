import type { TaskConfig } from '../common/types/task.js';
import { sanitizeString } from './sanitize.js';

/**
 * Validates and sanitizes a TaskConfig object.
 * Ensures all fields are properly typed, trimmed, and within length limits.
 *
 * @param config - The task configuration to validate
 * @returns A sanitized TaskConfig with all fields validated
 */
export function validateTaskConfig(config: TaskConfig): TaskConfig {
  const prompt = sanitizeString(config.prompt, 'prompt');
  const validated: TaskConfig = { prompt };

  if (config.taskId) {
    validated.taskId = sanitizeString(config.taskId, 'taskId', 128);
  }
  if (config.sessionId) {
    validated.sessionId = sanitizeString(config.sessionId, 'sessionId', 128);
  }
  if (config.workingDirectory) {
    validated.workingDirectory = sanitizeString(config.workingDirectory, 'workingDirectory', 1024);
  }
  if (Array.isArray(config.allowedTools)) {
    validated.allowedTools = config.allowedTools
      .filter((tool): tool is string => typeof tool === 'string')
      .map((tool) => sanitizeString(tool, 'allowedTools', 64))
      .slice(0, 20);
  }
  if (config.systemPromptAppend) {
    validated.systemPromptAppend = sanitizeString(config.systemPromptAppend, 'systemPromptAppend');
  }
  if (config.outputSchema && typeof config.outputSchema === 'object') {
    validated.outputSchema = config.outputSchema;
  }
  if (config.modelId) {
    validated.modelId = sanitizeString(config.modelId, 'modelId', 128);
  }
  // Copy workspaceId through so `resolveTaskConfig` can inject the
  // workspace's knowledge notes into the system prompt. Without this
  // copy, `task-service.startTask` writes `config.workspaceId` but
  // `validateTaskConfig` silently strips it, the adapter builds
  // `{ workspaceId: undefined }`, and `resolveTaskConfig`'s step 5
  // skips the notes. Tight length limit (128) matches other IDs here.
  if (config.workspaceId) {
    validated.workspaceId = sanitizeString(config.workspaceId, 'workspaceId', 128);
  }
  // Pass through file attachments — they are validated at the IPC/RPC boundary,
  // not here. Stripping them silently breaks the daemon task path.
  if (Array.isArray(config.files) && config.files.length > 0) {
    validated.files = config.files;
  }
  // Copy task-origin through. The no-UI auto-deny policy in task-callbacks depends on
  // this field; silently dropping it would misclassify WhatsApp/scheduler tasks as 'ui'.
  // The Zod enum at taskConfigSchema rejects invalid values upstream; double-check here
  // so bypassed callers (WhatsApp/scheduler) still get the sanity check.
  if (config.source === 'ui' || config.source === 'whatsapp' || config.source === 'scheduler') {
    validated.source = config.source;
  }

  return validated;
}
