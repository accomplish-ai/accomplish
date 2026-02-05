export {
  OpenCodeAdapter,
  OpenCodeCliNotFoundError,
  TaskManager,
  StreamParser,
  CompletionEnforcer,
  OpenCodeLogWatcher,
  createLogWatcher,
} from '@accomplish/agent-core';

export type {
  AdapterOptions,
  OpenCodeAdapterEvents,
  TaskManagerOptions,
  TaskCallbacks,
  TaskProgressEvent,
  OpenCodeLogError,
  CompletionEnforcerCallbacks,
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

import { OpenCodeAdapter, TaskManager } from '@accomplish/agent-core';
import {
  createElectronAdapterOptions,
  createElectronTaskManagerOptions,
  isCliAvailable,
  getBundledOpenCodeVersion,
} from './electron-options';

let taskManagerInstance: TaskManager | null = null;

export function getTaskManager(): TaskManager {
  if (!taskManagerInstance) {
    taskManagerInstance = new TaskManager(createElectronTaskManagerOptions());
  }
  return taskManagerInstance;
}

export function disposeTaskManager(): void {
  if (taskManagerInstance) {
    taskManagerInstance.dispose();
    taskManagerInstance = null;
  }
}

export function createAdapter(taskId?: string): OpenCodeAdapter {
  return new OpenCodeAdapter(createElectronAdapterOptions(), taskId);
}

export async function isOpenCodeCliInstalled(): Promise<boolean> {
  return isCliAvailable();
}

export async function getOpenCodeCliVersion(): Promise<string | null> {
  return getBundledOpenCodeVersion();
}
