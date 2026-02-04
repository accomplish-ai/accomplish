import { app } from 'electron';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import type { AdapterOptions, TaskManagerOptions, TaskCallbacks } from '@accomplish/core';
import type { TaskConfig } from '@accomplish/shared';
import { DEV_BROWSER_PORT } from '@accomplish/shared';
import {
  getSelectedModel,
  getAzureFoundryConfig,
  getActiveProviderModel,
  getConnectedProvider,
  getAzureEntraToken,
  getModelDisplayName,
  ensureDevBrowserServer,
  resolveCliPath,
  isCliAvailable as coreIsCliAvailable,
  buildCliArgs as coreBuildCliArgs,
  type BrowserServerConfig,
  type CliResolverConfig,
} from '@accomplish/core';
import type { AzureFoundryCredentials } from '@accomplish/shared';
import { getAllApiKeys, getBedrockCredentials } from '../store/secureStorage';
import { getOpenAiBaseUrl } from '@accomplish/core';
import { generateOpenCodeConfig, getMcpToolsPath, syncApiKeysToOpenCodeAuth } from './config-generator';
import { getExtendedNodePath } from '../utils/system-path';
import { getBundledNodePaths, logBundledNodeInfo } from '../utils/bundled-node';

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
  console.log('[CLI Path] Falling back to opencode command on PATH');
  return { command: 'opencode', args: [] };
}

export function isOpenCodeBundled(): boolean {
  return coreIsCliAvailable(getCliResolverConfig());
}

export function getBundledOpenCodeVersion(): string | null {
  const { command } = getOpenCodeCliPath();
  // getCliVersion is async but we need sync for backwards compatibility
  // For packaged apps, we can read version from package.json directly
  if (app.isPackaged) {
    try {
      const packageName = process.platform === 'win32' ? 'opencode-windows-x64' : 'opencode-ai';
      const packageJsonPath = path.join(
        process.resourcesPath,
        'app.asar.unpacked',
        'node_modules',
        packageName,
        'package.json'
      );

      if (fs.existsSync(packageJsonPath)) {
        const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
        return pkg.version;
      }
    } catch {
      // Fall through to command execution
    }
  }

  // For dev mode, execute the CLI to get version
  try {
    const fullCommand = `"${command}" --version`;
    const output = execSync(fullCommand, {
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim();

    const versionMatch = output.match(/(\d+\.\d+\.\d+)/);
    return versionMatch ? versionMatch[1] : output;
  } catch {
    return null;
  }
}

export async function buildEnvironment(): Promise<NodeJS.ProcessEnv> {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
  };

  if (app.isPackaged) {
    env.ELECTRON_RUN_AS_NODE = '1';

    logBundledNodeInfo();

    const bundledNode = getBundledNodePaths();
    if (bundledNode) {
      const delimiter = process.platform === 'win32' ? ';' : ':';
      const existingPath = env.PATH ?? env.Path ?? '';
      const combinedPath = existingPath
        ? `${bundledNode.binDir}${delimiter}${existingPath}`
        : bundledNode.binDir;
      env.PATH = combinedPath;
      if (process.platform === 'win32') {
        env.Path = combinedPath;
      }
      env.NODE_BIN_PATH = bundledNode.binDir;
      console.log('[OpenCode CLI] Added bundled Node.js to PATH:', bundledNode.binDir);
    }

    if (process.platform === 'darwin') {
      env.PATH = getExtendedNodePath(env.PATH);
    }
  }

  const apiKeys = await getAllApiKeys();

  if (apiKeys.anthropic) {
    env.ANTHROPIC_API_KEY = apiKeys.anthropic;
  }
  if (apiKeys.openai) {
    env.OPENAI_API_KEY = apiKeys.openai;
    const configuredOpenAiBaseUrl = getOpenAiBaseUrl().trim();
    if (configuredOpenAiBaseUrl) {
      env.OPENAI_BASE_URL = configuredOpenAiBaseUrl;
    }
  }
  if (apiKeys.google) {
    env.GOOGLE_GENERATIVE_AI_API_KEY = apiKeys.google;
  }
  if (apiKeys.xai) {
    env.XAI_API_KEY = apiKeys.xai;
  }
  if (apiKeys.deepseek) {
    env.DEEPSEEK_API_KEY = apiKeys.deepseek;
  }
  if (apiKeys.moonshot) {
    env.MOONSHOT_API_KEY = apiKeys.moonshot;
  }
  if (apiKeys.zai) {
    env.ZAI_API_KEY = apiKeys.zai;
  }
  if (apiKeys.openrouter) {
    env.OPENROUTER_API_KEY = apiKeys.openrouter;
  }
  if (apiKeys.litellm) {
    env.LITELLM_API_KEY = apiKeys.litellm;
  }
  if (apiKeys.minimax) {
    env.MINIMAX_API_KEY = apiKeys.minimax;
  }

  const bedrockCredentials = getBedrockCredentials();
  if (bedrockCredentials) {
    if (bedrockCredentials.authType === 'apiKey') {
      env.AWS_BEARER_TOKEN_BEDROCK = bedrockCredentials.apiKey;
    } else if (bedrockCredentials.authType === 'accessKeys') {
      env.AWS_ACCESS_KEY_ID = bedrockCredentials.accessKeyId;
      env.AWS_SECRET_ACCESS_KEY = bedrockCredentials.secretAccessKey;
      if (bedrockCredentials.sessionToken) {
        env.AWS_SESSION_TOKEN = bedrockCredentials.sessionToken;
      }
    } else if (bedrockCredentials.authType === 'profile') {
      env.AWS_PROFILE = bedrockCredentials.profileName;
    }
    if (bedrockCredentials.region) {
      env.AWS_REGION = bedrockCredentials.region;
    }
  }

  const activeModel = getActiveProviderModel();
  const selectedModel = getSelectedModel();
  if (activeModel?.provider === 'ollama' && activeModel.baseUrl) {
    env.OLLAMA_HOST = activeModel.baseUrl;
  } else if (selectedModel?.provider === 'ollama' && selectedModel.baseUrl) {
    env.OLLAMA_HOST = selectedModel.baseUrl;
  }

  return env;
}

export async function buildCliArgs(config: TaskConfig, _taskId: string): Promise<string[]> {
  // Get model from provider settings (Electron secure storage)
  const activeModel = getActiveProviderModel();
  const selectedModel = activeModel || getSelectedModel();

  // Use core's buildCliArgs with Electron-sourced model info
  return coreBuildCliArgs({
    prompt: config.prompt,
    sessionId: config.sessionId,
    selectedModel: selectedModel ? {
      provider: selectedModel.provider,
      model: selectedModel.model,
    } : null,
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
  const activeModel = getActiveProviderModel();
  const selectedModel = activeModel || getSelectedModel();
  const azureFoundryConfig = getAzureFoundryConfig();
  const azureFoundryProvider = getConnectedProvider('azure-foundry');
  const azureFoundryCredentials = azureFoundryProvider?.credentials as AzureFoundryCredentials | undefined;

  const isAzureFoundryEntraId =
    (selectedModel?.provider === 'azure-foundry' && azureFoundryCredentials?.authMethod === 'entra-id') ||
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

function getBrowserServerConfig(): BrowserServerConfig {
  const bundledPaths = getBundledNodePaths();
  return {
    mcpToolsPath: getMcpToolsPath(),
    bundledNodeBinPath: bundledPaths?.binDir,
    devBrowserPort: DEV_BROWSER_PORT,
  };
}

export async function onBeforeTaskStart(
  callbacks: TaskCallbacks,
  isFirstTask: boolean
): Promise<void> {
  if (isFirstTask) {
    callbacks.onProgress({ stage: 'browser', message: 'Preparing browser...', isFirstTask });
  }

  const browserConfig = getBrowserServerConfig();
  await ensureDevBrowserServer(browserConfig, callbacks.onProgress);
}

export function createElectronAdapterOptions(): AdapterOptions {
  return {
    platform: process.platform,
    isPackaged: app.isPackaged,
    tempPath: app.getPath('temp'),
    getCliCommand,
    buildEnvironment,
    buildCliArgs: (config: TaskConfig) => buildCliArgs(config, ''),
    onBeforeStart,
    getModelDisplayName,
  };
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
    },
    defaultWorkingDirectory: app.getPath('temp'),
    maxConcurrentTasks: 10,
    isCliAvailable,
    onBeforeTaskStart,
  };
}
