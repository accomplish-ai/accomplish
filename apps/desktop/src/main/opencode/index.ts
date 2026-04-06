// Factory functions from agent-core
export { OpenCodeCliNotFoundError, createTaskManager } from '@accomplish_ai/agent-core';

// Types from agent-core
export type {
  TaskManagerOptions,
  TaskCallbacks,
  TaskProgressEvent,
  TaskManagerAPI,
} from '@accomplish_ai/agent-core';

export {
  createElectronTaskManagerOptions,
  buildEnvironment,
  buildCliArgs,
  getCliCommand,
  isCliAvailable,
  onBeforeStart,
  onBeforeTaskStart,
  getOpenCodeCliPath,
  getBundledOpenCodeVersion,
  cleanupVertexServiceAccountKey,
  recoverDevBrowserServer,
} from './electron-options';

export {
  generateOpenCodeConfig,
  getMcpToolsPath,
  syncApiKeysToOpenCodeAuth,
  ACCOMPLISH_AGENT_NAME,
} from './config-generator';

export { loginOpenAiWithChatGpt } from './auth-browser';

import { isCliAvailable, getBundledOpenCodeVersion } from './electron-options';

export async function isOpenCodeCliInstalled(): Promise<boolean> {
  return isCliAvailable();
}

export async function getOpenCodeCliVersion(): Promise<string | null> {
  return getBundledOpenCodeVersion();
}
