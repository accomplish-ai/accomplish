export {
  OpenCodeCliNotFoundError,
  createLogWatcher,
  createTaskManager,
} from '@accomplish/agent-core';

export type {
  AdapterOptions,
  OpenCodeAdapterEvents,
  TaskManagerOptions,
  TaskCallbacks,
  TaskProgressEvent,
  OpenCodeLogError,
  CompletionEnforcerCallbacks,
  TaskManagerAPI,
} from '@accomplish/agent-core';

export {
  createElectronAdapterOptions,
  createElectronTaskManagerOptions,
  buildEnvironment,
  buildCliArgs,
  getCliCommand,
  isCliAvailable,
  onBeforeStart,
  onBeforeTaskStart,
  getOpenCodeCliPath,
  isOpenCodeBundled,
  getBundledOpenCodeVersion,
} from './electron-options';

export {
  generateOpenCodeConfig,
  getMcpToolsPath,
  syncApiKeysToOpenCodeAuth,
  ACCOMPLISH_AGENT_NAME,
} from './config-generator';

export { loginOpenAiWithChatGpt } from './auth-browser';

import { createTaskManager, type TaskManagerAPI } from '@accomplish/agent-core';
import {
  createElectronAdapterOptions,
  createElectronTaskManagerOptions,
  isCliAvailable,
  getBundledOpenCodeVersion,
} from './electron-options';

let taskManagerInstance: TaskManagerAPI | null = null;

export function getTaskManager(): TaskManagerAPI {
  if (!taskManagerInstance) {
    taskManagerInstance = createTaskManager(createElectronTaskManagerOptions());
  }
  return taskManagerInstance;
}

export function disposeTaskManager(): void {
  if (taskManagerInstance) {
    taskManagerInstance.dispose();
    taskManagerInstance = null;
  }
}

export async function isOpenCodeCliInstalled(): Promise<boolean> {
  return isCliAvailable();
}

export async function getOpenCodeCliVersion(): Promise<string | null> {
  return getBundledOpenCodeVersion();
}
