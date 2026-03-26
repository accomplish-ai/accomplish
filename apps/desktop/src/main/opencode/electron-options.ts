import { app } from 'electron';
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import type { TaskManagerOptions, TaskCallbacks } from '@accomplish_ai/agent-core';
import type { TaskConfig } from '@accomplish_ai/agent-core';
import { DEV_BROWSER_PORT } from '@accomplish_ai/agent-core';
import {
  getAzureEntraToken,
  ensureDevBrowserServer,
  resolveCliPath,
  isCliAvailable as coreIsCliAvailable,
  buildCliArgs as coreBuildCliArgs,
  buildOpenCodeEnvironment,
  createSandboxProvider,
  type BrowserServerConfig,
  type CliResolverConfig,
  type EnvironmentConfig,
  type SandboxPaths,
} from '@accomplish_ai/agent-core';
import { getHuggingFaceServerStatus } from '../providers/huggingface-local';
import { getModelDisplayName } from '@accomplish_ai/agent-core';
import type {
  AzureFoundryCredentials,
  BedrockCredentials,
  VertexCredentials,
} from '@accomplish_ai/agent-core';
import { getStorage } from '../store/storage';
import { getLogCollector } from '../logging';

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
import { getAllApiKeys, getBedrockCredentials, getApiKey } from '../store/secureStorage';
import {
  generateOpenCodeConfig,
  getMcpToolsPath,
  syncApiKeysToOpenCodeAuth,
} from './config-generator';
import { getExtendedNodePath } from '../utils/system-path';
import { getBundledNodePaths, logBundledNodeInfo } from '../utils/bundled-node';

const VERTEX_SA_KEY_FILENAME = 'vertex-sa-key.json';

/**
 * Removes the Vertex AI service account key file from disk if it exists.
 * Called when the Vertex provider is disconnected or the app quits.
 */
export function cleanupVertexServiceAccountKey(): void {
  try {
    const keyPath = path.join(app.getPath('userData'), VERTEX_SA_KEY_FILENAME);
    if (fs.existsSync(keyPath)) {
      fs.unlinkSync(keyPath);
      logOC('INFO', '[Vertex] Cleaned up service account key file');
    }
  } catch (error) {
    logOC('WARN', '[Vertex] Failed to clean up service account key file', { error: String(error) });
  }
}

function getCliResolverConfig(): CliResolverConfig {
  return {
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    appPath: app.getAppPath(),
  };
}

export function getOpenCodeCliPath(): { command: string; args: string[] } {
  const resolved = resolveCliPath(getCliResolverConfig());
  if (resolved) {
    return { command: resolved.cliPath, args: [] };
  }
  throw new Error('OpenCode CLI executable not found');
}

export function isOpenCodeBundled(): boolean {
  return coreIsCliAvailable(getCliResolverConfig());
}

export function isOpenCodeCliAvailable(): boolean {
  return coreIsCliAvailable(getCliResolverConfig());
}

export function getBundledOpenCodeVersion(): string | null {
  try {
    getOpenCodeCliPath();
  } catch {
    return null;
  }
  if (app.isPackaged) {
    try {
      const packageName = process.platform === 'win32' ? 'opencode-windows-x64' : 'opencode-ai';
      const packageJsonPath = path.join(
        process.resourcesPath,
        'app.asar.unpacked',
        'node_modules',
        packageName,
        'package.json',
      );

      if (fs.existsSync(packageJsonPath)) {
        const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
        return pkg.version;
      }
    } catch {
      // intentionally empty
    }
  }

  try {
    const { command } = getOpenCodeCliPath();
    // Use execFileSync (no shell) so installation paths that contain spaces
    // (e.g. "C:\Users\My Name\...") are passed directly to the OS without
    // cmd.exe quoting ambiguity.
    // See: https://github.com/accomplish-ai/accomplish/issues/596
    const output = execFileSync(command, ['--version'], {
      encoding: 'utf-8',
      timeout: 5000,
      windowsHide: true,
    }).trim();

    const versionMatch = output.match(/(\d+\.\d+\.\d+)/);
    return versionMatch ? versionMatch[1] : output;
  } catch {
    return null;
  }
}

export async function buildEnvironment(taskId: string): Promise<NodeJS.ProcessEnv> {
  // Start with base environment
  let env: NodeJS.ProcessEnv = { ...process.env };

  // Handle Electron-specific environment setup for packaged app
  if (app.isPackaged) {
    env.ELECTRON_RUN_AS_NODE = '1';
    logBundledNodeInfo();

    const bundledNodePaths = getBundledNodePaths();
    if (!bundledNodePaths) {
      throw new Error(
        'Bundled Node.js not found in packaged build. Cannot spawn opencode without it.',
      );
    }
    const delimiter = process.platform === 'win32' ? ';' : ':';
    const existingPath = env.PATH ?? env.Path ?? '';
    const combinedPath = existingPath
      ? `${bundledNodePaths.binDir}${delimiter}${existingPath}`
      : bundledNodePaths.binDir;
    env.PATH = combinedPath;
    if (process.platform === 'win32') {
      env.Path = combinedPath;
    }
    logOC('INFO', `[OpenCode CLI] Added bundled Node.js to PATH: ${bundledNodePaths.binDir}`);

    if (process.platform === 'darwin') {
      env.PATH = getExtendedNodePath(env.PATH);
    }
  }

  // Gather configuration for the reusable environment builder
  const apiKeys = await getAllApiKeys();
  const bedrockCredentials = getBedrockCredentials() as BedrockCredentials | null;
  const bundledNode = getBundledNodePaths();

  // Determine OpenAI base URL
  const storage = getStorage();
  const configuredOpenAiBaseUrl = apiKeys.openai ? storage.getOpenAiBaseUrl().trim() : undefined;

  // Determine Ollama host
  const activeModel = storage.getActiveProviderModel();
  const selectedModel = storage.getSelectedModel();
  let ollamaHost: string | undefined;
  if (activeModel?.provider === 'ollama' && activeModel.baseUrl) {
    ollamaHost = activeModel.baseUrl;
  } else if (selectedModel?.provider === 'ollama' && selectedModel.baseUrl) {
    ollamaHost = selectedModel.baseUrl;
  }

  // Determine HuggingFace Local server URL
  const hfProvider =
    activeModel?.provider === 'huggingface-local' ||
    selectedModel?.provider === 'huggingface-local';
  let hfBaseUrl: string | undefined;
  if (hfProvider) {
    const hfStatus = getHuggingFaceServerStatus();
    if (hfStatus.running && hfStatus.port) {
      hfBaseUrl = `http://127.0.0.1:${hfStatus.port}/v1`;
    }
  }

  // Handle Vertex AI credentials
  let vertexCredentials: VertexCredentials | undefined;
  let vertexServiceAccountKeyPath: string | undefined;
  const vertexCredsJson = getApiKey('vertex');
  if (vertexCredsJson) {
    try {
      const parsed = JSON.parse(vertexCredsJson) as VertexCredentials;
      vertexCredentials = parsed;
      if (parsed.authType === 'serviceAccount' && parsed.serviceAccountJson) {
        const userDataPath = app.getPath('userData');
        vertexServiceAccountKeyPath = path.join(userDataPath, VERTEX_SA_KEY_FILENAME);
        fs.writeFileSync(vertexServiceAccountKeyPath, parsed.serviceAccountJson, { mode: 0o600 });
      }
    } catch {
      logOC('WARN', '[OpenCode CLI] Failed to parse Vertex credentials');
    }
  }

  // Build environment configuration
  const envConfig: EnvironmentConfig = {
    apiKeys,
    bedrockCredentials: bedrockCredentials || undefined,
    vertexCredentials,
    vertexServiceAccountKeyPath,
    bundledNodeBinPath: bundledNode?.binDir,
    taskId: taskId || undefined,
    openAiBaseUrl: hfProvider
      ? (hfBaseUrl ??
        (() => {
          throw new Error(
            'HuggingFace Local server is not running. Please start the server before sending requests.',
          );
        })())
      : configuredOpenAiBaseUrl || undefined,
    ollamaHost,
  };

  // Use the core function to set API keys and credentials
  env = buildOpenCodeEnvironment(env, envConfig);

  if (taskId) {
    logOC('INFO', `[OpenCode CLI] Task ID in environment: ${taskId}`);
  }

  return env;
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
  };
}

async function ensureBrowserServer(callbacks?: Pick<TaskCallbacks, 'onProgress'>): Promise<void> {
  if (browserEnsurePromise) {
    return browserEnsurePromise;
  }

  const browserConfig = getBrowserServerConfig();
  browserEnsurePromise = ensureDevBrowserServer(browserConfig, callbacks?.onProgress)
    .then(() => undefined)
    .finally(() => {
      browserEnsurePromise = null;
    });

  return browserEnsurePromise;
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

  const browserConfig = getBrowserServerConfig();
  await ensureDevBrowserServer(browserConfig, callbacks.onProgress);
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
