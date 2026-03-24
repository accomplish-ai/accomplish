import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';
import type { TaskManagerOptions, TaskConfig, StorageAPI } from '@accomplish_ai/agent-core';
import {
  resolveCliPath,
  buildCliArgs as coreBuildCliArgs,
  buildOpenCodeEnvironment,
  getModelDisplayName,
  generateConfig,
  buildProviderConfigs,
  syncApiKeysToOpenCodeAuth,
  getOpenCodeAuthPath,
  PERMISSION_API_PORT,
  QUESTION_API_PORT,
} from '@accomplish_ai/agent-core';
import type { EnvironmentConfig } from '@accomplish_ai/agent-core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DAEMON_ROOT = path.resolve(__dirname, '..');

let storage: StorageAPI;
let dataDir: string;

export function initDaemonOptions(s: StorageAPI, dir: string): void {
  storage = s;
  dataDir = dir;
}

function getCliCommand(): { command: string; args: string[] } {
  const resolved = resolveCliPath({ isPackaged: false, appPath: DAEMON_ROOT });
  if (resolved) return { command: resolved.cliPath, args: [] };

  const local = path.join(DAEMON_ROOT, 'node_modules', 'opencode-ai', 'bin', 'opencode');
  if (fs.existsSync(local)) return { command: local, args: [] };

  return { command: 'opencode', args: [] };
}

function getMcpToolsPath(): string {
  const mono = path.resolve(DAEMON_ROOT, '../../packages/agent-core/mcp-tools');
  return fs.existsSync(mono)
    ? mono
    : path.join(DAEMON_ROOT, 'node_modules', '@accomplish_ai', 'agent-core', 'mcp-tools');
}

async function buildEnvironment(taskId: string): Promise<NodeJS.ProcessEnv> {
  const apiKeys = await storage.getAllApiKeys();
  const activeModel = storage.getActiveProviderModel();
  const selectedModel = storage.getSelectedModel();

  const envConfig: EnvironmentConfig = {
    apiKeys,
    bedrockCredentials:
      (storage.getBedrockCredentials() as unknown as EnvironmentConfig['bedrockCredentials']) ??
      undefined,
    taskId,
    openAiBaseUrl: apiKeys.openai ? storage.getOpenAiBaseUrl().trim() || undefined : undefined,
    ollamaHost:
      (activeModel?.provider === 'ollama' ? activeModel.baseUrl : null) ||
      (selectedModel?.provider === 'ollama' ? selectedModel.baseUrl : null) ||
      undefined,
  };

  return buildOpenCodeEnvironment({ ...process.env }, envConfig);
}

async function buildCliArgs(config: TaskConfig): Promise<string[]> {
  const model = storage.getActiveProviderModel() || storage.getSelectedModel();
  return coreBuildCliArgs({
    prompt: config.prompt,
    sessionId: config.sessionId,
    selectedModel: model ? { provider: model.provider, model: model.model } : null,
  });
}

async function onBeforeStart(): Promise<void> {
  const apiKeys = await storage.getAllApiKeys();
  await syncApiKeysToOpenCodeAuth(getOpenCodeAuthPath(), apiKeys);

  const { providerConfigs, enabledProviders, modelOverride } = await buildProviderConfigs({
    getApiKey: (p: string) => storage.getApiKey(p),
  });

  const result = generateConfig({
    platform: process.platform,
    mcpToolsPath: getMcpToolsPath(),
    userDataPath: dataDir,
    isPackaged: false,
    skills: [],
    providerConfigs,
    permissionApiPort: PERMISSION_API_PORT,
    questionApiPort: QUESTION_API_PORT,
    enabledProviders,
    model: modelOverride?.model,
    smallModel: modelOverride?.smallModel,
  });

  process.env.OPENCODE_CONFIG = result.configPath;
  process.env.OPENCODE_CONFIG_DIR = path.dirname(result.configPath);
  console.log('[Daemon] OpenCode config at:', result.configPath);
}

export function createDaemonTaskManagerOptions(): TaskManagerOptions {
  return {
    adapterOptions: {
      platform: process.platform,
      isPackaged: false,
      tempPath: os.tmpdir(),
      getCliCommand,
      buildEnvironment,
      onBeforeStart,
      getModelDisplayName,
      buildCliArgs,
    },
    defaultWorkingDirectory: os.tmpdir(),
    maxConcurrentTasks: 10,
    isCliAvailable: async () => {
      const { command } = getCliCommand();
      return fs.existsSync(command);
    },
    async onBeforeTaskStart() {},
  };
}
