import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import { buildOpenCodeEnvironment, type EnvironmentConfig } from '@accomplish_ai/agent-core';
import type { BedrockCredentials, VertexCredentials } from '@accomplish_ai/agent-core';
import { getHuggingFaceServerStatus } from '../providers/huggingface-local';
import { getStorage } from '../store/storage';
import { getAllApiKeys, getBedrockCredentials, getApiKey } from '../store/secureStorage';
import { getExtendedNodePath } from '../utils/system-path';
import { getBundledNodePaths, logBundledNodeInfo } from '../utils/bundled-node';
import { getLogCollector } from '../logging';

export const VERTEX_SA_KEY_FILENAME = 'vertex-sa-key.json';

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
        if (process.platform !== 'win32') {
          fs.chmodSync(vertexServiceAccountKeyPath, 0o600);
        }
      }
    } catch {
      logOC('WARN', '[OpenCode CLI] Failed to parse Vertex credentials');
    }
  }

  // Resolve OpenAI base URL (handles HuggingFace Local and configured OpenAI endpoint)
  let openAiBaseUrlVal: string | undefined = configuredOpenAiBaseUrl || undefined;
  if (hfProvider) {
    if (!hfBaseUrl) {
      throw new Error(
        'HuggingFace Local server is not running. Please start the server before sending requests.',
      );
    }
    openAiBaseUrlVal = hfBaseUrl;
  }

  // Build environment configuration
  const envConfig: EnvironmentConfig = {
    apiKeys,
    bedrockCredentials: bedrockCredentials || undefined,
    vertexCredentials,
    vertexServiceAccountKeyPath,
    bundledNodeBinPath: bundledNode?.binDir,
    taskId: taskId || undefined,
    openAiBaseUrl: openAiBaseUrlVal,
    ollamaHost,
  };

  // Use the core function to set API keys and credentials
  env = buildOpenCodeEnvironment(env, envConfig);

  if (taskId) {
    logOC('INFO', `[OpenCode CLI] Task ID in environment: ${taskId}`);
  }

  return env;
}
