import { app } from 'electron';
import type { TaskManagerOptions, TaskCallbacks } from '@accomplish_ai/agent-core';
import type { TaskConfig } from '@accomplish_ai/agent-core';
import { DEV_BROWSER_PORT } from '@accomplish_ai/agent-core';
import {
  getAzureEntraToken,
  ensureDevBrowserServer,
  shutdownDevBrowserServer,
  buildCliArgs as coreBuildCliArgs,
  createSandboxProvider,
  getModelDisplayName,
  DEV_BROWSER_CDP_PORT,
  type BrowserServerConfig,
  type SandboxPaths,
} from '@accomplish_ai/agent-core';
import type { AzureFoundryCredentials } from '@accomplish_ai/agent-core';
import { getStorage } from '../store/storage';
import { getLogCollector } from '../logging';
import { getOpenCodeCliPath, isOpenCodeBundled } from './cli-resolver';
import { buildEnvironment } from './environment-builder';
import {
  generateOpenCodeConfig,
  getMcpToolsPath,
  syncApiKeysToOpenCodeAuth,
} from './config-generator';
import { getBundledNodePaths } from '../utils/bundled-node';

export { cleanupVertexServiceAccountKey } from './environment-builder';
export {
  getOpenCodeCliPath,
  isOpenCodeBundled,
  isOpenCodeCliAvailable,
  getBundledOpenCodeVersion,
} from './cli-resolver';
export { buildEnvironment };

function logOC(level: 'INFO' | 'WARN' | 'ERROR', msg: string, data?: Record<string, unknown>) {
  try {
    const l = getLogCollector();
    if (l?.log) {
      l.log(level, 'opencode', msg, data);
    }
  } catch (_e) {
    /* best-effort logging */
  }
}

export async function buildCliArgs(config: TaskConfig, _taskId: string): Promise<string[]> {
  const storage = getStorage();
  const activeModel = storage.getActiveProviderModel();
  const selectedModel = activeModel || storage.getSelectedModel();

  return coreBuildCliArgs({
    prompt: config.prompt,
    sessionId: config.sessionId,
    selectedModel: selectedModel
      ? {
          provider: selectedModel.provider,
          model: selectedModel.model,
        }
      : null,
  });
}

export function getCliCommand(): { command: string; args: string[] } {
  return getOpenCodeCliPath();
}

export async function isCliAvailable(): Promise<boolean> {
  return isOpenCodeBundled();
}

export async function onBeforeStart(): Promise<void> {
  await syncApiKeysToOpenCodeAuth();

  let azureFoundryToken: string | undefined;
  const storage = getStorage();
  const activeModel = storage.getActiveProviderModel();
  const selectedModel = activeModel || storage.getSelectedModel();
  const azureFoundryConfig = storage.getAzureFoundryConfig();
  const azureFoundryProvider = storage.getConnectedProvider('azure-foundry');
  const azureFoundryCredentials = azureFoundryProvider?.credentials as
    | AzureFoundryCredentials
    | undefined;

  const isAzureFoundryEntraId =
    (selectedModel?.provider === 'azure-foundry' &&
      azureFoundryCredentials?.authMethod === 'entra-id') ||
    (selectedModel?.provider === 'azure-foundry' && azureFoundryConfig?.authType === 'entra-id');

  if (isAzureFoundryEntraId) {
    const tokenResult = await getAzureEntraToken();
    if (!tokenResult.success) {
      throw new Error(tokenResult.error);
    }
    azureFoundryToken = tokenResult.token;
  }

  await generateOpenCodeConfig(azureFoundryToken);
}

const BROWSER_RECOVERY_COOLDOWN_MS = 30_000;
let browserEnsurePromise: Promise<void> | null = null;
let lastBrowserRecoveryAt = 0;

function getBrowserServerConfig(): BrowserServerConfig {
  const bundledPaths = getBundledNodePaths();
  return {
    mcpToolsPath: getMcpToolsPath(),
    bundledNodeBinPath: bundledPaths?.binDir,
    devBrowserPort: DEV_BROWSER_PORT,
    devBrowserCdpPort: DEV_BROWSER_CDP_PORT,
  };
}

async function ensureBrowserServer(callbacks?: Pick<TaskCallbacks, 'onProgress'>): Promise<void> {
  if (browserEnsurePromise) {
    return browserEnsurePromise;
  }

  const browserConfig = getBrowserServerConfig();
  browserEnsurePromise = ensureDevBrowserServer(browserConfig, callbacks?.onProgress)
    .then((result) => {
      if (!result.ready) {
        logOC('WARN', '[Browser] Dev-browser server did not become ready; browser tools may fail');
      }
    })
    .finally(() => {
      browserEnsurePromise = null;
    });

  return browserEnsurePromise;
}

export async function stopDevBrowserServer(): Promise<void> {
  logOC('INFO', '[Browser] Sending shutdown request to dev-browser server...');
  await shutdownDevBrowserServer({
    devBrowserPort: DEV_BROWSER_PORT,
    devBrowserCdpPort: DEV_BROWSER_CDP_PORT,
  });
}

export async function recoverDevBrowserServer(
  callbacks?: Pick<TaskCallbacks, 'onProgress'>,
  options?: { reason?: string; force?: boolean },
): Promise<boolean> {
  const now = Date.now();
  const force = options?.force === true;

  if (!force && now - lastBrowserRecoveryAt < BROWSER_RECOVERY_COOLDOWN_MS) {
    logOC('INFO', `[Browser] Recovery skipped due to cooldown (${BROWSER_RECOVERY_COOLDOWN_MS}ms)`);
    return false;
  }

  const reason = options?.reason || 'Browser connection issue detected. Reconnecting browser...';
  callbacks?.onProgress({ stage: 'browser-recovery', message: reason });

  await ensureBrowserServer(callbacks);
  lastBrowserRecoveryAt = Date.now();
  callbacks?.onProgress({ stage: 'browser-recovery', message: 'Browser reconnected.' });

  return true;
}

export async function onBeforeTaskStart(
  callbacks: TaskCallbacks,
  isFirstTask: boolean,
): Promise<void> {
  if (isFirstTask) {
    callbacks.onProgress({ stage: 'browser', message: 'Preparing browser...', isFirstTask });
  }

  await ensureBrowserServer(callbacks);
}

export function createElectronTaskManagerOptions(): TaskManagerOptions {
  return {
    adapterOptions: {
      platform: process.platform,
      isPackaged: app.isPackaged,
      tempPath: app.getPath('temp'),
      getCliCommand,
      buildEnvironment,
      onBeforeStart,
      getModelDisplayName,
      buildCliArgs,
      // Resolve sandbox provider and config lazily at each task creation so that
      // changes persisted by sandbox:set-config are reflected without recreating
      // the TaskManager.
      sandboxFactory: () => {
        const config = getStorage().getSandboxConfig();
        const getSandboxPaths = (): SandboxPaths => ({
          configDir: app.getPath('userData'),
          openDataHome: app.getPath('appData'),
        });
        return {
          provider: createSandboxProvider(config, process.platform, getSandboxPaths),
          config,
        };
      },
    },
    defaultWorkingDirectory: app.getPath('temp'),
    maxConcurrentTasks: 10,
    isCliAvailable,
    onBeforeTaskStart,
  };
}
